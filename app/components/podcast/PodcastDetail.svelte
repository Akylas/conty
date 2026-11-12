<script context="module" lang="ts">
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { confirm } from '@nativescript-community/ui-dialogs';
    import { VerticalPosition } from '@nativescript-community/ui-popover';
    import { ObservableArray } from '@nativescript/core';
    import { Template } from '@nativescript-community/svelte-native/components';
    import { NativeViewElementNode } from '@nativescript-community/svelte-native/dom';
    import ActionBarSearch from '@shared/components/ActionBarSearch.svelte';
    import CActionBar from '@shared/components/CActionBar.svelte';
    import { showError } from '@shared/utils/showError';
    import { goBack } from '@shared/utils/svelte/ui';
    import { openUrl } from '@akylas/nativescript/utils';
    import { filesize } from 'filesize';
    import { onDestroy, onMount } from 'svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import { l, lc } from '~/helpers/locale';
    import { PodcastEpisode, PodcastWithCounts } from '~/services/podcast/podcastRepository';
    import { EVENT_PODCASTS_CHANGED, EVENT_PODCAST_DOWNLOAD_PROGRESS, PodcastDownloadProgressEventData, PodcastsChangedEventData, podcastService } from '~/services/podcasts';
    import { hideLoading, showLoading, showPopoverMenu } from '~/utils/ui';
    import { colors, fontScale, windowInset } from '~/variables';

    const CONFIRM_DOWNLOAD_THRESHOLD = 10;

    function formatDuration(duration: number) {
        if (!duration) {
            return '';
        }
        const totalMinutes = Math.round(duration / 60000);
        const hours = Math.floor(totalMinutes / 60);
        return hours > 0 ? `${hours}h${(totalMinutes % 60).toString().padStart(2, '0')}` : `${totalMinutes} min`;
    }
</script>

<script lang="ts">
    let { colorError, colorOnSurfaceVariant, colorPrimary, colorPrimaryContainer, colorSurfaceContainer } = $colors;
    $: ({ colorError, colorOnSurfaceVariant, colorPrimary, colorPrimaryContainer, colorSurfaceContainer } = $colors);

    interface Item {
        episode: PodcastEpisode;
        selected: boolean;
        /** 0-100 while queued/downloading, undefined otherwise */
        progress?: number;
    }

    export let podcastId: number;
    let podcast: PodcastWithCounts = null;
    let episodes: ObservableArray<Item> = null;
    let nbSelected = 0;
    let showSearch = false;
    let search: ActionBarSearch;
    let filter: string = null;
    let refreshing = false;
    let showFullDescription = false;
    let collectionView: NativeViewElementNode<CollectionView>;

    async function load() {
        const selectedIds = new Set(getSelectedEpisodes().map((episode) => episode.id));
        podcast = await podcastService.getPodcast(podcastId);
        const list = await podcastService.listEpisodes(podcastId, filter);
        episodes = new ObservableArray(
            list.map((episode) => ({
                episode,
                selected: selectedIds.has(episode.id),
                progress: podcastService.getDownloadProgress(episode.id)
            }))
        );
        updateSelected();
    }
    async function safeLoad() {
        try {
            await load();
        } catch (error) {
            showError(error);
        }
    }
    // search is done by the database
    function onSearch(force?: boolean, newFilter?: string) {
        filter = newFilter;
        safeLoad();
    }

    let reloadTimer;
    function onPodcastsChanged(event: PodcastsChangedEventData) {
        if (event.podcastId === podcastId) {
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(safeLoad, 300);
        }
    }
    function onDownloadProgress(event: PodcastDownloadProgressEventData) {
        if (event.podcastId !== podcastId || !episodes) {
            return;
        }
        const index = episodes.findIndex((item) => item.episode.id === event.episodeId);
        if (index >= 0) {
            const item = episodes.getItem(index);
            item.progress = event.progress >= 0 ? event.progress : undefined;
            episodes.setItem(index, item);
        }
    }
    onMount(() => {
        podcastService.on(EVENT_PODCASTS_CHANGED, onPodcastsChanged);
        podcastService.on(EVENT_PODCAST_DOWNLOAD_PROGRESS, onDownloadProgress);
        safeLoad();
    });
    onDestroy(() => {
        clearTimeout(reloadTimer);
        podcastService.off(EVENT_PODCASTS_CHANGED, onPodcastsChanged);
        podcastService.off(EVENT_PODCAST_DOWNLOAD_PROGRESS, onDownloadProgress);
    });

    function updateSelected() {
        nbSelected = getSelectedEpisodes().length;
    }
    function toggleSelect(item: Item) {
        item.selected = !item.selected;
        episodes.setItem(episodes.indexOf(item), item);
        updateSelected();
    }
    function setAllSelected(selected: boolean) {
        episodes.forEach((item, index) => {
            if (item.selected !== selected) {
                item.selected = selected;
                episodes.setItem(index, item);
            }
        });
        updateSelected();
    }
    const unselectAll = () => setAllSelected(false);
    function getSelectedEpisodes() {
        const selected: PodcastEpisode[] = [];
        episodes?.forEach((item) => {
            if (item.selected) {
                selected.push(item.episode);
            }
        });
        return selected;
    }

    async function confirmDownload(count: number) {
        if (count <= CONFIRM_DOWNLOAD_THRESHOLD) {
            return true;
        }
        return confirm({ message: lc('download_episodes_confirm', count), okButtonText: lc('download'), cancelButtonText: lc('cancel') });
    }
    async function downloadEpisodes(list: PodcastEpisode[]) {
        const missing = list.filter((episode) => !episode.file);
        if (missing.length && (await confirmDownload(missing.length))) {
            await podcastService.downloadEpisodes(
                podcastId,
                missing.map((episode) => episode.id)
            );
        }
    }
    async function downloadAll() {
        await downloadEpisodes(await podcastService.listEpisodes(podcastId));
    }
    async function downloadSelected() {
        await downloadEpisodes(getSelectedEpisodes());
        unselectAll();
    }
    /** asks for confirmation then deletes the downloaded files, with a loading to prevent further taps */
    async function removeEpisodes(list: PodcastEpisode[]) {
        const downloaded = list.filter((episode) => !!episode.file);
        if (!downloaded.length) {
            return false;
        }
        const result = await confirm({ message: lc('delete_episodes_confirm', downloaded.length), okButtonText: lc('delete'), cancelButtonText: lc('cancel') });
        if (!result) {
            return false;
        }
        showLoading(lc('deleting'));
        try {
            await podcastService.deleteEpisodes(
                podcastId,
                downloaded.map((episode) => episode.id)
            );
        } finally {
            hideLoading();
        }
        return true;
    }
    async function removeSelected() {
        if (await removeEpisodes(getSelectedEpisodes())) {
            unselectAll();
        }
    }
    async function onEpisodeButton(item: Item) {
        try {
            if (item.episode.file) {
                await removeEpisodes([item.episode]);
            } else if (item.progress === undefined) {
                await podcastService.downloadEpisodes(podcastId, [item.episode.id]);
            }
        } catch (error) {
            showError(error);
        }
    }

    async function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        try {
            await podcastService.refresh(podcastId);
            await load();
        } catch (error) {
            showError(error);
        } finally {
            refreshing = false;
        }
    }

    async function showOptions(event) {
        try {
            await showPopoverMenu({
                options: [
                    { id: 'download_all', name: lc('download_all'), icon: 'mdi-download-multiple' },
                    { id: 'download_missing', name: lc('download_missing'), icon: 'mdi-download', visible: podcast?.downloadedCount > 0 },
                    { id: 'select_all', name: lc('select_all'), icon: 'mdi-select-all' },
                    { id: 'open_link', name: lc('open_website'), icon: 'mdi-web', visible: /^https?:\/\//i.test(podcast?.link ?? '') }
                ].filter((option) => option.visible !== false),
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                props: { width: 240 * $fontScale },
                onClose: async (item) => {
                    try {
                        switch (item.id) {
                            case 'download_all':
                            case 'download_missing':
                                // both only download what we do not have yet
                                await downloadAll();
                                break;
                            case 'select_all':
                                setAllSelected(true);
                                break;
                            case 'open_link':
                                openLink();
                                break;
                        }
                    } catch (error) {
                        showError(error);
                    }
                }
            });
        } catch (error) {
            showError(error);
        }
    }
    async function showSelectedOptions(event) {
        try {
            await showPopoverMenu({
                options: [
                    { id: 'select_all', name: lc('select_all'), icon: 'mdi-select-all' },
                    { id: 'download', name: lc('download_selected'), icon: 'mdi-download' },
                    { id: 'remove', name: lc('delete_selected'), icon: 'mdi-delete', color: colorError }
                ],
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                props: { width: 240 * $fontScale },
                onClose: async (item) => {
                    try {
                        switch (item.id) {
                            case 'select_all':
                                setAllSelected(true);
                                break;
                            case 'download':
                                await downloadSelected();
                                break;
                            case 'remove':
                                await removeSelected();
                                break;
                        }
                    } catch (error) {
                        showError(error);
                    }
                }
            });
        } catch (error) {
            showError(error);
        }
    }

    function openLink() {
        // the link comes from the feed: only open web urls
        if (/^https?:\/\//i.test(podcast?.link ?? '')) {
            try {
                openUrl(podcast.link);
            } catch (error) {
                // e.g. no browser installed
                showError(error);
            }
        }
    }
    function onGoBack() {
        if (showSearch) {
            search.hideSearch();
        } else if (nbSelected > 0) {
            unselectAll();
        } else {
            goBack();
        }
    }
    function getSubtitle(episode: PodcastEpisode) {
        return [episode.pubDate ? new Date(episode.pubDate).toLocaleDateString() : '', formatDuration(episode.duration), episode.size ? filesize(episode.size, { output: 'string' }) : '']
            .filter((part) => part.length > 0)
            .join(' · ');
    }
</script>

<page actionBarHidden={true} on:navigatingFrom={() => search?.unfocusSearch()}>
    <gridlayout paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,auto,*">
        <gridlayout columns="96,*" margin={10} row={1} visibility={podcast ? 'visible' : 'collapsed'}>
            <image borderRadius={10} decodeWidth={300} height={96} src={podcast?.image} stretch="aspectFill" verticalAlignment="top" width={96} />
            <stacklayout col={1} marginLeft={12} on:tap={() => (showFullDescription = !showFullDescription)}>
                <label fontSize={18 * $fontScale} fontWeight="bold" lineBreak="end" maxLines={2} text={podcast?.title} />
                <label color={colorOnSurfaceVariant} fontSize={14 * $fontScale} lineBreak="end" maxLines={1} text={podcast?.author} visibility={podcast?.author ? 'visible' : 'collapsed'} />
                <label color={colorPrimary} fontSize={13 * $fontScale} text={podcast ? lc('podcast_counts', podcast.episodeCount - podcast.downloadedCount, podcast.downloadedCount) : ''} />
                <label color={colorOnSurfaceVariant} fontSize={13 * $fontScale} lineBreak="end" maxLines={showFullDescription ? 1000 : 3} text={podcast?.description} />
            </stacklayout>
        </gridlayout>
        <collectionView bind:this={collectionView} iosOverflowSafeArea={true} items={episodes} row={2} rowHeight={84 * $fontScale} android:paddingBottom={$windowInset.bottom}>
            <Template let:item>
                <gridlayout
                    backgroundColor={item.selected ? colorPrimaryContainer : colorSurfaceContainer}
                    borderRadius={12}
                    columns="*,auto"
                    margin="3 10 3 10"
                    padding="8 4 8 12"
                    on:tap={() => toggleSelect(item)}
                    on:longPress={() => toggleSelect(item)}>
                    <stacklayout verticalAlignment="center">
                        <label fontSize={15 * $fontScale} fontWeight="bold" lineBreak="end" maxLines={2} text={item.episode.title} />
                        <label color={colorOnSurfaceVariant} fontSize={12 * $fontScale} lineBreak="end" maxLines={1} text={getSubtitle(item.episode)} />
                    </stacklayout>
                    <SelectedIndicator horizontalAlignment="right" margin={0} selected={item.selected} verticalAlignment="top" />
                    {#if item.progress !== undefined}
                        <!-- circular determinate mode props are not in the svelte typings -->
                        <activityindicator busy={true} col={1} height={36} margin="0 10 0 10" width={36} {...{ indeterminate: item.progress === 0, maxValue: 100, value: item.progress }} />
                    {:else}
                        <mdbutton
                            class="actionBarButton"
                            col={1}
                            color={item.episode.file ? colorPrimary : colorOnSurfaceVariant}
                            text={item.episode.file ? 'mdi-check-circle' : 'mdi-download-outline'}
                            variant="text"
                            on:tap={() => onEpisodeButton(item)} />
                    {/if}
                </gridlayout>
            </Template>
        </collectionView>
        <CActionBar {onGoBack} title={podcast?.title || l('podcasts')}>
            <mdbutton class="actionBarButton" text="mdi-magnify" variant="text" on:tap={() => search.showSearch()} />
            <mdbutton class="actionBarButton" isEnabled={!refreshing} text="mdi-refresh" variant="text" on:tap={refresh} />
            <mdbutton class="actionBarButton" text="mdi-dots-vertical" variant="text" on:tap={showOptions} />
            <ActionBarSearch bind:this={search} slot="center" refresh={onSearch} bind:visible={showSearch} />
        </CActionBar>
        {#if nbSelected > 0}
            <CActionBar forceCanGoBack={true} onGoBack={unselectAll} title={l('selected', nbSelected)} titleProps={{ maxLines: 1, autoFontSize: true }}>
                <mdbutton class="actionBarButton" text="mdi-dots-vertical" variant="text" on:tap={showSelectedOptions} />
            </CActionBar>
        {/if}
    </gridlayout>
</page>
