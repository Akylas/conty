import { AdditiveTweening } from '@nativescript-community/additween';
import { TNSPlayer } from '@nativescript-community/audio';
import { lc } from '@nativescript-community/l';
import { Application, ApplicationSettings, EventData, ImageSource, Observable, ObservableArray } from '@nativescript/core';
import { Optional } from '@nativescript/core/utils/typescript-utils';
import { Action, Pack, Stage, Story, ignoreStageNameRegex } from '~/models/Pack';
import { getAudioDuration } from '~/utils';
import { showError } from '~/utils/showError';
import { Handler } from './Handler';
import { COLORMATRIX_INVERSED_BLACK_TRANSPARENT, DEFAULT_INVERSE_IMAGES, SETTINGS_INVERSE_IMAGES } from '~/utils/constants';
import { prefs } from '~/services/preferences';

export type PlayingState = 'stopped' | 'playing' | 'paused';

function shuffleArray(arr) {
    return arr.sort(() => Math.random() - 0.5);
}

function shuffle(array) {
    let currentIndex = array.length;

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
        // Pick a remaining element...
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
}

function getRandomFromArray(array) {
    return array[Math.floor(Math.random() * array.length)];
}
export const PlaybackEvent = 'playback';
export const PackStartEvent = 'packStart';
export const PackStopEvent = 'packStop';
export const StagesChangeEvent = 'stagesChange';
export const StoryStartEvent = 'storyStart';
export const StoryStopEvent = 'storyStop';

export interface PackStartEventData extends Optional<EventData<Observable>, 'object'> {
    pack?: Pack;
}
export interface StoryStartEventData extends Optional<EventData<Observable>, 'object'> {
    story?: Story;
}
export interface StageEventData extends PackStartEventData {
    playingInfo?: PlayingInfo;
    stages?: Stage[];
    selectedStageIndex?: number;
    currentStage?: Stage;
}
export interface PlaybackEventData extends StageEventData {
    state?: PlayingState;
    playingInfo?: PlayingInfo;
}

export interface PlayingInfo {
    pack: Pack;
    canPause?: boolean;
    canStop?: boolean;
    durations?: number[];
    duration: number;
    name: any;
    description?: any;
    cover?: () => string | ImageSource;
    // cover?: () => Promise<string | ImageSource>;
}

export interface PlaylistItem {
    pack?: Pack;
    story?: Story;
}
export type Playlist = ObservableArray<PlaylistItem>;

let inverseImagesColors = ApplicationSettings.getBoolean(SETTINGS_INVERSE_IMAGES, DEFAULT_INVERSE_IMAGES);
export let imagesMatrix: number[] = null;
prefs.on(`key:${SETTINGS_INVERSE_IMAGES}`, () => {
    inverseImagesColors = ApplicationSettings.getBoolean(SETTINGS_INVERSE_IMAGES);
    imagesMatrix = inverseImagesColors ? COLORMATRIX_INVERSED_BLACK_TRANSPARENT : null;
});

const TAG = '[Story]';
export class StoryHandler extends Handler {
    appExited = false;
    positionState: { [k: string]: any } = {};
    playingPack: Pack;
    playingStory: Story;
    selectedStageIndex: number = 0;
    currentStages: Stage[] = [];
    // stages: Stage[];
    // actions: Action[];
    mPlayer: TNSPlayer;

    isPlaying = false;
    isPlayingPaused = false;
    mCanStopStoryPlayback = false;

    playlist: Playlist = new ObservableArray();

    get playerCurrentTime() {
        return this.mPlayer?.currentTime || 0;
    }
    get pack() {
        return this.playingPack || this.playingStory?.pack;
    }
    playerState: PlayingState = 'stopped';

    currentPlayingInfo: PlayingInfo = null;
    currentStageImage: string = null;
    playingInfo(): PlayingInfo {
        if (this.isPlaying) {
            let pack = this.playingPack;
            if (pack) {
                const currentStage = this.currentStageSelected();
                const duration = this.mPlayer?.duration || 0;
                let name = pack.title;
                let description = pack.subtitle || pack.description;
                DEV_LOG && console.log();
                if (currentStage) {
                    if (duration > 10000 || pack.stageIsStory(currentStage)) {
                        name = this.getStoryName(pack, currentStage) || name;
                        if (name !== pack.title) {
                            description = name;
                        }
                    } else if (pack.isMenuStage(currentStage)) {
                        description = name;
                        name = pack.cleanupStageName(currentStage);
                    }
                }
                DEV_LOG && console.log('updating playing info', currentStage.uuid, currentStage.image, duration, name);

                return {
                    pack,
                    canPause: pack.canPause(currentStage),
                    duration,
                    name,
                    description,
                    cover: () => this.getStageImage(pack, currentStage)
                };
            } else if (this.playingStory) {
                pack = this.playingStory.pack;
                // we need to get the total duration
                return {
                    pack,
                    canPause: true,
                    durations: this.playingStory.durations,
                    duration: this.playingStory.duration,
                    name: this.playingStory.name,
                    description: pack.title,
                    cover: () => this.playingStory?.thumbnail || pack.getThumbnail()
                };
            }
        }
        return { duration: 0, name: null, pack: null };
    }

    async stop() {
        DEV_LOG && console.log(TAG, 'stop');
        await this.stopPlaying();
        DEV_LOG && console.log(TAG, 'stop done');
    }
    async start() {
        try {
            DEV_LOG && console.log(TAG, 'start');
        } catch (err) {
            console.error('dbHandler', 'start error', err, err.stack);
            return Promise.reject(err);
        }
    }

    clearPlayer() {
        // ensure current player is stopped
        DEV_LOG && console.info('clearPlayer');
        const oldPlayer = this.mPlayer;
        oldPlayer?.stop();
        this.mPlayer = new TNSPlayer();
        oldPlayer?.dispose();
    }
    playingAudioPromise: Promise<any> = null;

    _setPlaybackState(state: PlayingState) {
        this.playerState = state;
        this.notify({ eventName: PlaybackEvent, state, playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
    }
    async playAudio({
        fileName,
        dataSource,
        loop = false,
        throwErrorUp = true,
        updatePlayingInfo = true
    }: {
        fileName: string;
        dataSource?: any;
        loop?: boolean;
        throwErrorUp?: boolean;
        updatePlayingInfo?: boolean;
    }) {
        DEV_LOG && console.info('playAudio', fileName, dataSource);
        try {
            await new Promise<void>(async (resolve, reject) => {
                try {
                    let resolved = false;
                    this.clearPlayer();
                    await this.mPlayer.playFromFile({
                        autoPlay: true,
                        audioFile: fileName,
                        dataSource,
                        loop,
                        ...(__IOS__
                            ? {
                                  sessionCategory: AVAudioSessionCategoryPlayback,
                                  active: true
                              }
                            : {}),
                        completeCallback: async () => {
                            DEV_LOG && console.log('completeCallback', fileName, loop, resolved);
                            // this.clearPlayer();
                            if (!loop && !resolved) {
                                resolved = true;
                                resolve();
                            }
                            this._setPlaybackState('stopped');
                        },
                        errorCallback: async (e) => {
                            DEV_LOG && console.log('errorCallback', fileName, e.error);
                            this._setPlaybackState('stopped');
                            if (!resolved) {
                                resolved = true;
                                if (throwErrorUp) {
                                    reject(e.error);
                                } else {
                                    resolve();
                                }
                            }
                        }
                    });
                    if (updatePlayingInfo) {
                        DEV_LOG && console.log('playAudio', 'updating playing info');
                        this.currentPlayingInfo = this.playingInfo();
                    }
                    DEV_LOG && console.log('playAudio', 'updated playing info', this.currentPlayingInfo.name);
                    this._setPlaybackState('playing');
                } catch (error) {
                    console.error('playAudio ', error, error.stack);
                    reject(error);
                }
            });
        } finally {
            DEV_LOG && console.log('playAudio', 'done');
        }
    }
    currentStoryAudioIndex = 0;
    async playAudios(audios: string[], updatePlayingInfo = true) {
        TEST_LOG && console.log('playAaudios', updatePlayingInfo);
        // try {
        // we use throwErrorUp to ensure the loops stop and we dont play other audios
        for (let index = 0; index < audios.length; index++) {
            if (!this.isPlaying) {
                break;
            }
            this.currentStoryAudioIndex = index;
            await this.playAudio({ fileName: audios[index], loop: false, throwErrorUp: true, updatePlayingInfo });
        }
        // } catch (err) {}
    }

    pausedStoryPlayTime = 0;
    async pausePlayback() {
        if (this.isPlaying) {
            this.mPlayer.pause();
            // this.lyric?.pause();
            this.isPlayingPaused = true;
            this.pausedStoryPlayTime = this.mPlayer.currentTime;
            DEV_LOG && console.log(TAG, 'pausePlayback', this.pausedStoryPlayTime);
            this._setPlaybackState('paused');
        }
    }
    async togglePlayState() {
        DEV_LOG && console.log('togglePlayState', this.isPlaying, this.isPlayingPaused, this.playerState);
        if (this.isPlaying) {
            if (this.playerState === 'playing') {
                this.pausePlayback();
            } else {
                this.resumePlayback();
            }
        }
    }
    async resumePlayback() {
        if (this.isPlaying) {
            this.mPlayer.resume();
            // this.lyric?.play(this.pausedStoryPlayTime);
            this.isPlayingPaused = false;
            DEV_LOG && console.log(TAG, 'resumeStory', this.pausedStoryPlayTime);
            this.pausedStoryPlayTime = 0;
            this._setPlaybackState('playing');
        }
    }
    async setPlayerTimestamp(playTime: number) {
        DEV_LOG && console.log(TAG, 'setStoryTimestamp', playTime, this.isPlaying, this.isPlayingPaused);
        if (this.isPlaying) {
            this.mPlayer.seekTo(playTime / 1000);
            if (this.isPlayingPaused) {
                this.pausedStoryPlayTime = playTime;
            } else {
                // this.lyric?.play(playTime);
            }
        }
    }
    nextStageFrom(stage?: Stage): Stage[] {
        // DEV_LOG && console.log('nextStageFrom', JSON.stringify(stage));
        return this.pack.nextStageFrom(stage);
    }
    homeStageFrom(stage?: Stage): Stage[] {
        return this.pack.homeStageFrom(stage);
    }
    currentStageSelected() {
        return this.currentStages?.[this.selectedStageIndex];
    }

    getStageImage(pack: Pack, stage: Stage): string | ImageSource {
        if (pack) {
            return pack.getCurrentStageImage(stage, this.currentStageSelected(), this.currentStageImage);
        }
    }
    getCurrentStageImage() {
        if (this.playingPack && this.currentStageImage) {
            return this.playingPack.getImage(this.currentStageImage) || this.playingPack.getThumbnail();
        }
        return this.playingStory.thumbnail || this.playingPack.getThumbnail();
    }
    getStageName(pack: Pack, stage: Stage) {
        if (pack && stage) {
            if (pack.stageIsStory(stage)) {
                return this.getStoryName(pack, stage);
            }
            return pack.cleanupStageName(stage);
        }
    }
    getStoryName(pack: Pack, stage: Stage) {
        if (pack) {
            return this.pack.getStoryName(stage);
        }
    }

    findStoryImage(s: Stage) {
        return this.pack.findStoryImage(s);
    }
    setSelectedStage(index: number) {
        if (this.selectedStageIndex !== index) {
            this.selectedStageIndex = index;
            this.notifyStageChange(false);
            this.runStage();
        }
    }
    selectPreviousStage() {
        this.setSelectedStage((this.selectedStageIndex - 1 + this.currentStages.length) % this.currentStages.length);
    }
    selectNextStage() {
        this.setSelectedStage((this.selectedStageIndex + 1) % this.currentStages.length);
    }
    handleAction(action: string) {
        switch (action) {
            case 'play':
            case 'pause':
                this.togglePlayState();
                break;
            case 'ok':
                this.onStageOk();
                break;
            case 'stop':
                this.stopPlaying();
                break;
            case 'home':
                this.onStageHome();
                break;
            case 'previous':
                this.selectPreviousStage();
                break;
            case 'next':
                this.selectNextStage();
                break;
        }
    }
    stageChangeEventData() {
        return { pack: this.playingPack, stages: this.currentStages, selectedStageIndex: this.selectedStageIndex, currentStage: this.currentStageSelected() };
    }
    async notifyStageChange(currentStatesChanged = true) {
        try {
            const stage = this.currentStageSelected();
            const pack = this.pack;
            this.currentStageImage = pack.stageIsStory(stage) ? undefined : stage?.image;
            // this.currentStageImage = stage?.image;
            this.currentPlayingInfo = this.playingInfo();
            DEV_LOG && console.info('notifyStageChange', stage.uuid, this.currentStages.length, this.selectedStageIndex, this.currentStageImage, this.currentPlayingInfo.cover);
            this.notify({ eventName: StagesChangeEvent, playingInfo: this.currentPlayingInfo, currentStatesChanged, ...this.stageChangeEventData() } as StageEventData);
        } catch (error) {
            showError(error);
        }
    }
    async onStageOk() {
        const pack = this.pack;
        const oldSelected = this.currentStageSelected();
        const oldSelectedIndex = this.selectedStageIndex;
        DEV_LOG && console.log('onStageOk', oldSelectedIndex, oldSelected.uuid);
        if (!pack.hasOkTransition(oldSelected)) {
            // should be packed ended
            this.stopPlaying({ updatePlaylist: true });
            return;
        }
        const nextStages = this.nextStageFrom(oldSelected) || [];
        DEV_LOG &&
            console.log(
                'nextStages',
                nextStages.map((s) => s.uuid),
                JSON.stringify(nextStages)
            );

        const optionIndex = pack.okTransitionIndex(this.currentStages[oldSelectedIndex]) ?? 0;

        this.currentStages = pack.mapOfStagesForOption(nextStages);
        DEV_LOG && console.log('this.currentStages', JSON.stringify(this.currentStages));
        this.selectedStageIndex = optionIndex !== undefined ? (optionIndex >= 0 ? optionIndex : Math.round(Math.random() * (this.currentStages.length - 1))) : 0;
        const currentStageSelected = this.currentStageSelected();
        DEV_LOG && console.log('optionIndex', optionIndex, this.selectedStageIndex, this.currentStages.length, currentStageSelected.uuid);
        if (pack.isMissingHome(currentStageSelected)) {
            // the json is missing the homeTransition. Let s fake it
            pack.buildMissingHome(currentStageSelected);
        }
        await this.notifyStageChange();
        this.runStage();
    }
    setStage(stage: Stage) {
        this.currentStages = [stage];
        this.selectedStageIndex = 0;
        this.notifyStageChange();
        this.runStage();
    }
    onStageHome() {
        const pack = this.pack;
        const selected = this.currentStageSelected();
        if (!pack.canHome(selected)) {
            return;
        }
        const nextStages = pack.homeStageFrom(selected) || [];

        // const optionIndex = homeTransition?.optionIndex;
        const optionIndex = pack.homeTransitionIndex(selected);
        this.selectedStageIndex = optionIndex !== undefined ? (optionIndex >= 0 ? optionIndex : Math.round(Math.random() * (this.currentStages.length - 1))) : 0;

        this.currentStages = pack.mapOfStagesForOption(nextStages);
        // for now we always reset to 0 as many stories have the wrong index set
        this.selectedStageIndex = optionIndex;
        // this.selectedStageIndex = optionIndex;
        this.notifyStageChange();
        this.runStage();
    }
    async runStage() {
        try {
            const pack = this.playingPack;
            if (!pack) {
                return;
            }
            const stage = this.currentStageSelected();
            // this.notify({ eventName: 'runStage', stage, selectedStageIndex: this.selectedStageIndex, stages: this.currentStages });
            DEV_LOG && console.info('runStage', JSON.stringify(stage), this.currentStages.length);
            if (stage.audio) {
                const compressed = this.playingPack.compressed;
                const fileName = this.playingPack.getAudio(stage.audio);
                const dataSource = compressed && __ANDROID__ ? new com.akylas.conty.ZipMediaDataSource(this.playingPack.zipPath, fileName.split('@').pop()) : undefined;
                await this.playAudio({ fileName, dataSource });
                if (pack.stageIsStory(stage) && this.appExited) {
                    this.stopPlaying();
                    return;
                }
            }
            DEV_LOG && console.log('runStage playAudio done', stage === this.currentStageSelected(), this.currentStages.length, pack.isAutoPlay(stage));
            if (stage === this.currentStageSelected() /*  && stage?.controlSettings?.autoplay === true */ && (this.currentStages.length === 1 || pack.isAutoPlay(stage))) {
                await this.onStageOk();
            }
        } catch (error) {
            if (error) {
                showError(error);
                this.stopPlaying();
            } else {
                //cancelled (could be on ok or home)
            }
        }
    }
    async playPack(pack: Pack, updatePlaylist = true) {
        TEST_LOG && console.log('playPack', pack.id, pack.title, this.isPlaying);
        if (this.isPlaying) {
            await this.stopPlaying({ closeFullscreenPlayer: false });
            // return new Promise<void>((resolve) => {
            //     this.toPlayNext = async () => {
            //         await this.playStory(pack);
            //         resolve();
            //     };
            // });
        }
        if (updatePlaylist) {
            this.playlist.splice(0, this.playlist.length, { pack });
        }
        try {
            this.isPlaying = true;
            this.playingPack = pack;
            await pack.initData();
            // this.actions = data.actions;
            // this.stages = data.stages;
            // DEV_LOG && console.log('this.actionNodes', JSON.stringify(this.actionNodes));
            // DEV_LOG && console.log('this.stageNodes', JSON.stringify(this.stageNodes));
            // DEV_LOG && console.log('playPack data', this.actionNodes.length, this.stageNodes.length);
            const startData = pack.startData();
            this.selectedStageIndex = startData.index;
            this.currentStages = startData.stages;
            this.notify({ eventName: PackStartEvent, ...this.stageChangeEventData() } as PackStartEventData);
            // DEV_LOG && console.log('playPack1', JSON.stringify(this.currentStages));
            // this.notify({ eventName: StagesChangeEvent, stages: this.currentStages, selectedStageIndex: this.selectedStageIndex });
            // this.notify({ eventName: PlaybackEvent, data: 'play' });
            // we call onStageOk directly to
            this.onStageOk();
            // mark story as played

            // this.playedStory(index + '', markAsPlayedOnMap);
            // this.notify({ eventName: PlaybackEvent, data: 'stopped' });
        } catch (error) {
            console.error(error, error.stack);
            throw error;
        } finally {
            // DEV_LOG && console.log('finished playing story');
            // this.pausedStoryPlayTime = 0;
        }
    }
    async playStory(story: Story, updatePlaylist = true) {
        TEST_LOG && console.log('playStory', this.isPlaying, story.name, JSON.stringify(story.audioFiles), JSON.stringify(story.images), JSON.stringify(story.names));

        if (this.isPlaying) {
            await this.stopPlaying({ closeFullscreenPlayer: false });
            // return new Promise<void>((resolve) => {
            //     this.toPlayNext = async () => {
            //         await this.playStory(pack);
            //         resolve();
            //     };
            // });
        }
        if (updatePlaylist) {
            this.playlist.splice(0, this.playlist.length, { story });
        }
        try {
            this.isPlaying = true;
            this.playingStory = story;
            this.currentPlayingInfo = this.playingInfo();
            this.notify({ eventName: StoryStartEvent, story } as StoryStartEventData);
            await this.playAudios(story.audioFiles, false);
        } catch (error) {
            showError(error);
        } finally {
            this.stopPlaying({ updatePlaylist: true });
        }
    }
    getPlayingPack() {
        return this.playingPack || this.playingStory?.pack;
    }
    handleOnPlayingEndPlaylist() {
        if (this.playlist.length > 0) {
            this.playlist.shift();
            if (this.playlist.length > 0) {
                const toPlay = this.playlist.getItem(0);
                if (toPlay.pack) {
                    this.playPack(toPlay.pack, false);
                } else if (toPlay.story) {
                    this.playStory(toPlay.story, false);
                }
            }
        }
    }
    async stopPlaying({ fade = false, closeFullscreenPlayer = true, updatePlaylist = false } = {}) {
        if (!this.isPlaying) {
            return;
        }
        TEST_LOG && console.log('stopPlaying', fade, this.isPlaying, new Error().stack);

        const onDone = async () => {
            try {
                this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: null, closeFullscreenPlayer, ...this.stageChangeEventData() } as PlaybackEventData);
                this.selectedStageIndex = 0;
                this.currentStages = [];
                this.isPlayingPaused = false;
                this.isPlaying = false;
                this.currentPlayingInfo = null;
                const currentPlayingPack = this.playingPack;
                const currentPlayingStory = this.playingStory;
                this.playingPack = null;
                this.playingStory = null;
                this.clearPlayer();
                if (currentPlayingPack) {
                    this.notify({ eventName: PackStopEvent, pack: currentPlayingPack, closeFullscreenPlayer: updatePlaylist ? this.playlist.length <= 1 : closeFullscreenPlayer });
                    if (updatePlaylist) {
                        this.handleOnPlayingEndPlaylist();
                    }

                    currentPlayingPack.close();
                } else if (currentPlayingStory) {
                    this.notify({
                        eventName: StoryStopEvent,
                        story: currentPlayingStory,
                        closeFullscreenPlayer: updatePlaylist ? this.playlist.length <= 1 : closeFullscreenPlayer
                    } as StoryStartEventData);
                    if (updatePlaylist) {
                        this.handleOnPlayingEndPlaylist();
                    }
                    currentPlayingStory.pack.close();
                }
            } catch (error) {
                showError(error);
            }

            TEST_LOG && console.warn('stopPlaying');
            // if (this.lyric) {
            //     this.lyric.pause();
            //     this.lyric = null;
            // }
            if (this.appExited) {
                Application.notify({ eventName: 'shouldStopBgService' });
            }
        };

        if (this.mPlayer?.isAudioPlaying()) {
            if (fade) {
                try {
                    await new Promise((resolve) => {
                        const anim = new AdditiveTweening({
                            onRender: (obj) => {
                                this.mPlayer.volume = obj.value;
                            },
                            onFinish: resolve
                        });
                        anim.tween({ value: 1 }, { value: 0 }, 500);
                    });
                } catch (error) {
                    console.error('audio fade tween', error, error.stack);
                } finally {
                    await onDone();
                }
            } else {
                await onDone();
            }
        } else {
            await onDone();
        }
    }
    async findAllStories(pack: Pack, podcastMode = false) {
        return pack.findAllStories(podcastMode);
    }

    canOverrideButtons() {
        return this.isPlaying && this.currentStages.length > 1;
    }
}
