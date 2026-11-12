import { HTTPError, NoNetworkError, wrapNativeHttpException } from '@akylas/nativescript-app-utils/error';
import * as https from '@nativescript-community/https';
import { lc } from '@nativescript-community/l';
import { File, Folder, knownFolders, path } from '@nativescript/core';
import { EventData, Observable } from '@nativescript/core/data/observable';
import { throttle } from '@nativescript/core/utils';
import { showError } from '@shared/utils/showError';
import { PackDeletedEventData, documentsService } from '~/services/documents';
import { importService } from '~/services/importservice';
import * as ProgressNotifications from '~/services/ProgressNotifications';
import { networkService } from '~/services/api';
import { Feed, parseFeed } from '~/services/podcast/rssParser';
import { Podcast, PodcastEpisode, PodcastRepository } from '~/services/podcast/podcastRepository';
import { buildStoryJSON } from '~/services/podcast/storyBuilder';
import { getAudioDuration, getFileOrFolderSize, hashCode } from '~/utils';
import { EVENT_PACK_DELETED } from '~/utils/constants';
import { hideSnackMessage, showSnackMessage } from '~/utils/ui';

export const EVENT_PODCASTS_CHANGED = 'podcastsChanged';
export const EVENT_PODCAST_DOWNLOAD_PROGRESS = 'podcastDownloadProgress';

export interface PodcastsChangedEventData extends EventData {
    /** undefined when the list of podcasts changed */
    podcastId?: number;
}
export interface PodcastDownloadProgressEventData extends EventData {
    podcastId: number;
    episodeId: number;
    /** 0-100, -1 when done/cancelled */
    progress: number;
}

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'mp4'];
const FEED_HEADERS = { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' };

function getAudioExtension(url: string) {
    const extension = /\.([a-z0-9]{2,4})$/i.exec(url.split(/[?#]/)[0])?.[1]?.toLowerCase();
    return extension && AUDIO_EXTENSIONS.includes(extension) ? extension : 'mp3';
}

interface QueuedDownload {
    podcastId: number;
    episodeId: number;
}

export class PodcastService extends Observable {
    private started = false;
    private queue: QueuedDownload[] = [];
    private currentDownload?: QueuedDownload;
    /** episodes whose running request was cancelled on purpose */
    private cancelledEpisodes = new Set<number>();
    private progress = new Map<number, number>();

    get repository(): PodcastRepository {
        return documentsService.podcastRepository;
    }

    /** Must be called before using the service, it is cheap to call it many times. */
    async start() {
        if (this.started) {
            return;
        }
        this.started = true;
        documentsService.on(EVENT_PACK_DELETED, this.onPacksDeleted);
        await this.reconcilePacks();
    }

    /** a pack could have been deleted while we were not listening */
    private async reconcilePacks() {
        const podcasts = await this.repository.listPodcasts();
        for (const podcast of podcasts) {
            if (podcast.packId && !(await documentsService.packRepository.get(podcast.packId))) {
                await this.forgetPack(podcast.id);
            }
        }
    }

    private onPacksDeleted = async (event: PackDeletedEventData) => {
        for (const packId of event.packIds) {
            const podcast = await this.repository.findPodcastByPackId(packId);
            if (podcast) {
                await this.forgetPack(podcast.id);
            }
        }
    };

    private async forgetPack(podcastId: number) {
        await this.repository.clearPodcastDownloaded(podcastId);
        await this.repository.setPodcastPackId(podcastId, null);
        this.notifyChanged(podcastId);
    }

    private notifyChanged(podcastId?: number) {
        this.notify({ eventName: EVENT_PODCASTS_CHANGED, object: this, podcastId } as PodcastsChangedEventData);
    }

    getDownloadProgress(episodeId: number) {
        return this.progress.get(episodeId);
    }

    // ---- feeds ----

    async fetchFeed(url: string): Promise<Feed> {
        if (!networkService.connected) {
            throw new NoNetworkError();
        }
        const requestParams = { url, method: 'GET' as const, headers: FEED_HEADERS };
        try {
            const response = await https.request(requestParams);
            if (Math.round(response.statusCode / 100) !== 2) {
                throw new HTTPError({ statusCode: response.statusCode, message: 'HTTP error', requestParams });
            }
            return parseFeed(await response.content.toStringAsync());
        } catch (error) {
            throw wrapNativeHttpException(error, requestParams);
        }
    }

    async listPodcasts() {
        await this.start();
        return this.repository.listPodcasts();
    }

    async getPodcast(id: number) {
        return this.repository.getPodcast(id);
    }

    async listEpisodes(podcastId: number, search?: string) {
        return this.repository.listEpisodes(podcastId, search?.trim());
    }

    /** Subscribes to a feed. Returns the id of the (possibly already existing) podcast. */
    async addByUrl(url: string) {
        await this.start();
        const feedUrl = url.trim();
        const existing = await this.repository.findPodcastByFeedUrl(feedUrl);
        if (existing) {
            return existing.id;
        }
        const feed = await this.fetchFeed(feedUrl);
        const id = await this.repository.createPodcast(feedUrl, feed);
        await this.repository.upsertEpisodes(id, feed.episodes);
        this.notifyChanged();
        return id;
    }

    async refresh(podcastId: number) {
        const podcast = await this.repository.getPodcast(podcastId);
        if (!podcast) {
            return;
        }
        const feed = await this.fetchFeed(podcast.feedUrl);
        await this.repository.updatePodcastFromFeed(podcastId, feed);
        await this.repository.upsertEpisodes(podcastId, feed.episodes);
        if (podcast.packId) {
            await this.syncPack(podcastId);
        }
        this.notifyChanged(podcastId);
    }

    /** Returns the number of podcasts which failed to refresh. */
    async refreshAll() {
        await this.start();
        const podcasts = await this.repository.listPodcasts();
        let failed = 0;
        let firstError: Error | undefined;
        for (let index = 0; index < podcasts.length; index++) {
            showSnackMessage({ text: lc('refreshing_podcasts', index + 1, podcasts.length), progress: Math.round((index / podcasts.length) * 100) });
            try {
                await this.refresh(podcasts[index].id);
            } catch (error) {
                failed++;
                firstError = firstError || error;
            }
        }
        hideSnackMessage();
        if (firstError) {
            showError(firstError);
        }
        return failed;
    }

    async removePodcast(podcastId: number) {
        this.cancelQueued(podcastId);
        await this.deleteDownloads(podcastId);
        await this.repository.deletePodcast(podcastId);
        this.notifyChanged();
    }

    // ---- downloads ----

    /** queues the episodes which are not yet downloaded */
    async downloadEpisodes(podcastId: number, episodeIds: number[]) {
        await this.start();
        for (const episodeId of episodeIds) {
            const episode = await this.repository.getEpisode(episodeId);
            const alreadyQueued = this.queue.some((item) => item.episodeId === episodeId) || this.currentDownload?.episodeId === episodeId;
            if (episode && !episode.file && !alreadyQueued) {
                this.queue.push({ podcastId, episodeId });
                this.setProgress(podcastId, episodeId, 0);
            }
        }
        void this.processQueue();
    }

    async downloadMissing(podcastId: number) {
        const episodes = await this.repository.listEpisodes(podcastId);
        await this.downloadEpisodes(
            podcastId,
            episodes.filter((episode) => !episode.file).map((episode) => episode.id)
        );
    }

    cancelDownloads() {
        const queued = this.queue.splice(0, this.queue.length);
        queued.forEach((item) => this.setProgress(item.podcastId, item.episodeId, -1));
        this.cancelCurrent();
    }

    private cancelCurrent(podcastId?: number) {
        if (this.currentDownload && (podcastId === undefined || this.currentDownload.podcastId === podcastId)) {
            this.cancelledEpisodes.add(this.currentDownload.episodeId);
            https.cancelRequest(this.getRequestTag(this.currentDownload.episodeId));
        }
    }

    private cancelQueued(podcastId: number) {
        const removed = this.queue.filter((item) => item.podcastId === podcastId);
        this.queue = this.queue.filter((item) => item.podcastId !== podcastId);
        removed.forEach((item) => this.setProgress(item.podcastId, item.episodeId, -1));
        this.cancelCurrent(podcastId);
    }

    private getRequestTag(episodeId: number) {
        return `podcast-episode-${episodeId}`;
    }

    private setProgress(podcastId: number, episodeId: number, progress: number) {
        if (progress < 0) {
            this.progress.delete(episodeId);
        } else {
            this.progress.set(episodeId, progress);
        }
        this.notify({ eventName: EVENT_PODCAST_DOWNLOAD_PROGRESS, object: this, podcastId, episodeId, progress } as PodcastDownloadProgressEventData);
    }

    private processing = false;
    private async processQueue() {
        if (this.processing) {
            return;
        }
        this.processing = true;
        try {
            while (this.queue.length) {
                const item = this.queue.shift();
                this.currentDownload = item;
                try {
                    await this.downloadEpisode(item);
                } catch (error) {
                    // a cancelled request is not an error
                    if (!this.cancelledEpisodes.has(item.episodeId)) {
                        showError(error);
                    }
                } finally {
                    this.cancelledEpisodes.delete(item.episodeId);
                    this.setProgress(item.podcastId, item.episodeId, -1);
                    this.currentDownload = undefined;
                    this.notifyChanged(item.podcastId);
                }
            }
        } finally {
            this.processing = false;
            hideSnackMessage();
        }
    }

    private async downloadFile(url: string, tag: string, destination: string, onProgress?: (current: number, total: number) => void) {
        return https.getFile({ url, tag, method: 'GET', onProgress }, destination);
    }

    private async downloadEpisode({ episodeId, podcastId }: QueuedDownload) {
        const episode = await this.repository.getEpisode(episodeId);
        const podcast = await this.repository.getPodcast(podcastId);
        if (!episode || !podcast || episode.file) {
            return;
        }
        if (!networkService.connected) {
            throw new NoNetworkError();
        }
        const tag = this.getRequestTag(episodeId);
        const notificationId = 52346 + hashCode(tag);
        const notification = ProgressNotifications.show({
            id: notificationId,
            icon: 'mdi-download',
            smallIcon: 'mdi-download',
            title: lc('downloading_episode'),
            message: episode.title,
            indeterminate: false,
            progress: 0,
            actions: [{ id: 'cancel', text: 'mdi-close', notifText: lc('cancel'), callback: () => this.cancelDownloads() }]
        });
        const onProgress = throttle((current: number, total: number) => {
            const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
            showSnackMessage({ text: lc('downloading_episode_progress', episode.title, percentage), progress: percentage });
            ProgressNotifications.update(notification, { rightIcon: `${percentage}%`, progress: percentage });
            this.setProgress(podcastId, episodeId, percentage);
        }, 1000);
        const tempFolder = knownFolders.temp();
        const audioFileName = `episode-${episode.id}.${getAudioExtension(episode.audioUrl)}`;
        const temporaryAudio = path.join(tempFolder.path, audioFileName);
        try {
            const audioFile = await this.downloadFile(episode.audioUrl, tag, temporaryAudio, onProgress);
            if (!File.exists(audioFile.path) || audioFile.size <= 0) {
                throw new Error(lc('podcast_download_failed', episode.title));
            }
            // we write into the pack folder only once the download is done so that a pack folder always has a valid story.json
            const assetsFolder = this.getPackFolder(podcast).getFolder('assets');
            const destinationAudio = path.join(assetsFolder.path, audioFileName);
            await audioFile.copy(destinationAudio);
            audioFile.removeSync();
            let imageFile: string;
            if (episode.image && episode.image !== podcast.image) {
                imageFile = await this.downloadEpisodeImage(episode, assetsFolder, tag);
            }
            const duration = (await getAudioDuration(destinationAudio)) || episode.duration;
            await this.repository.setEpisodeDownloaded(episodeId, { file: audioFileName, imageFile, duration, size: File.fromPath(destinationAudio).size });
            try {
                await this.syncPack(podcastId);
            } catch (error) {
                // do not keep an episode flagged as downloaded if its pack could not be built
                await this.repository.clearEpisodeDownloaded(episodeId);
                [destinationAudio, imageFile && path.join(assetsFolder.path, imageFile)].forEach((filePath) => {
                    if (filePath && File.exists(filePath)) {
                        File.fromPath(filePath).removeSync();
                    }
                });
                throw error;
            }
        } finally {
            ProgressNotifications.dismiss(notificationId);
            if (File.exists(temporaryAudio)) {
                File.fromPath(temporaryAudio).removeSync();
            }
        }
    }

    private async downloadEpisodeImage(episode: PodcastEpisode, assetsFolder: Folder, tag: string) {
        const fileName = `episode-${episode.id}.jpg`;
        try {
            await this.downloadFile(episode.image, tag + '-image', path.join(assetsFolder.path, fileName));
            return fileName;
        } catch (error) {
            // the image is optional, the pack thumbnail will be used
            DEV_LOG && console.error('downloadEpisodeImage', error);
        }
    }

    async deleteEpisodes(podcastId: number, episodeIds: number[]) {
        const podcast = await this.repository.getPodcast(podcastId);
        if (!podcast) {
            return;
        }
        for (const episodeId of episodeIds) {
            const episode = await this.repository.getEpisode(episodeId);
            if (episode?.file) {
                this.removeEpisodeFiles(podcast, episode);
                await this.repository.clearEpisodeDownloaded(episodeId);
            }
        }
        await this.syncPack(podcastId);
        this.notifyChanged(podcastId);
    }

    async deleteDownloads(podcastId: number) {
        const episodes = await this.repository.listDownloadedEpisodes(podcastId);
        await this.deleteEpisodes(
            podcastId,
            episodes.map((episode) => episode.id)
        );
    }

    private removeEpisodeFiles(podcast: Podcast, episode: PodcastEpisode) {
        if (!podcast.packId) {
            return;
        }
        const assetsPath = path.join(this.getPackFolderPath(podcast.packId), 'assets');
        [episode.file, episode.imageFile].forEach((fileName) => {
            const filePath = fileName && path.join(assetsPath, fileName);
            if (filePath && File.exists(filePath)) {
                File.fromPath(filePath).removeSync();
            }
        });
    }

    // ---- linked pack ----

    private getPackFolderPath(packId: string) {
        return path.join(documentsService.dataFolder.path, packId);
    }

    /** Folder of the linked pack. The pack id is reserved now, the pack itself is created in syncPack. */
    private getPackFolder(podcast: Podcast) {
        return Folder.fromPath(this.getPackFolderPath(podcast.packId || this.reservePackId(podcast)));
    }

    private reservedPackIds = new Map<number, string>();
    private reservePackId(podcast: Podcast) {
        let packId = this.reservedPackIds.get(podcast.id);
        if (!packId) {
            packId = Date.now() + '';
            this.reservedPackIds.set(podcast.id, packId);
        }
        return packId;
    }

    /** Rebuilds story.json from the downloaded episodes and creates/updates/deletes the linked pack. */
    async syncPack(podcastId: number) {
        const podcast = await this.repository.getPodcast(podcastId);
        if (!podcast) {
            return;
        }
        const episodes = await this.repository.listDownloadedEpisodes(podcastId);
        if (episodes.length === 0) {
            await this.removeLinkedPack(podcast);
            return;
        }
        const isNew = !podcast.packId;
        const packId = podcast.packId || this.reservePackId(podcast);
        const folder = Folder.fromPath(this.getPackFolderPath(packId));
        const thumbnailPath = path.join(folder.path, 'thumbnail.png');
        if (podcast.image && !File.exists(thumbnailPath)) {
            try {
                await this.downloadFile(podcast.image, `podcast-${podcast.id}-cover`, thumbnailPath);
            } catch (error) {
                // the cover is optional
                DEV_LOG && console.error('podcast cover', error);
            }
        }
        const story = buildStoryJSON(
            { ...podcast, podcastId: podcast.id },
            episodes.map((episode) => ({
                id: episode.id,
                title: episode.title,
                pubDate: episode.pubDate,
                episodeNumber: episode.episodeNumber,
                audioFile: episode.file,
                imageFile: episode.imageFile,
                duration: episode.duration
            }))
        );
        const storyPath = path.join(folder.path, 'story.json');
        const storyText = JSON.stringify(story);
        // writeTextSync is broken with the current android runtime (writes a single wrong char)
        await File.fromPath(storyPath).writeText(storyText);
        if ((await File.fromPath(storyPath).readText()) !== storyText) {
            throw new Error('story.json was not written correctly');
        }
        if (isNew) {
            // link first so that the pack is never left without its podcast (deleting it must reset the episodes)
            await this.repository.setPodcastPackId(podcastId, packId);
            try {
                await importService.importFolder(packId);
                if (!(await documentsService.packRepository.get(packId))) {
                    throw new Error(lc('podcast_import_failed', podcast.title));
                }
            } catch (error) {
                await this.repository.setPodcastPackId(podcastId, null);
                throw error;
            }
            this.reservedPackIds.delete(podcastId);
        } else {
            const pack = await documentsService.packRepository.get(packId);
            if (!pack) {
                // deleted behind our back
                await this.forgetPack(podcastId);
                return;
            }
            await pack.save({
                title: story.title,
                description: story.description,
                subtitle: story.subtitle,
                keywords: story.keywords,
                size: getFileOrFolderSize(folder.path),
                extra: { ...pack.extra, episodeCount: story.episodeCount, language: story.language }
            });
        }
    }

    private async removeLinkedPack(podcast: Podcast) {
        this.reservedPackIds.delete(podcast.id);
        if (!podcast.packId) {
            return;
        }
        const pack = await documentsService.packRepository.get(podcast.packId);
        // forget it first so that the delete event is a noop for us
        await this.repository.setPodcastPackId(podcast.id, null);
        if (pack) {
            await importService.deletePacks([pack], true);
        }
    }
}

export const podcastService = new PodcastService();
