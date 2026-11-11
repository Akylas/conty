<script context="module" lang="ts">
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { confirm, prompt } from '@nativescript-community/ui-material-dialogs';
    import { VerticalPosition } from '@nativescript-community/ui-popover';
    import { ObservableArray, Utils } from '@nativescript/core';
    import { Template } from '@nativescript-community/svelte-native/components';
    import { NativeViewElementNode } from '@nativescript-community/svelte-native/dom';
    import CActionBar from '@shared/components/CActionBar.svelte';
    import { showError } from '@shared/utils/showError';
    import { closeModal, fade, navigate } from '@shared/utils/svelte/ui';
    import { onDestroy, onMount } from 'svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import { l, lc } from '~/helpers/locale';
    import { PodcastWithCounts } from '~/services/podcast/podcastRepository';
    import { podcastSearchAvailable } from '~/services/podcast/podcastIndex';
    import { EVENT_PODCASTS_CHANGED, podcastService } from '~/services/podcasts';
    import { hideLoading, showLoading, showPopoverMenu } from '~/utils/ui';
    import { colors, fontScale, windowInset } from '~/variables';
</script>

<script lang="ts">
    let { colorError, colorOnSurfaceVariant, colorPrimary, colorPrimaryContainer, colorSurfaceContainer } = $colors;
    $: ({ colorError, colorOnSurfaceVariant, colorPrimary, colorPrimaryContainer, colorSurfaceContainer } = $colors);

    interface Item {
        podcast: PodcastWithCounts;
        selected: boolean;
    }
    let podcasts: ObservableArray<Item> = null;
    let nbSelected = 0;
    let loaded = false;
    let refreshing = false;
    let collectionView: NativeViewElementNode<CollectionView>;

    async function load() {
        const selectedIds = new Set(getSelected().map((podcast) => podcast.id));
        const list = await podcastService.listPodcasts();
        podcasts = new ObservableArray(list.map((podcast) => ({ podcast, selected: selectedIds.has(podcast.id) })));
        updateSelected();
        loaded = true;
    }
    function updateSelected() {
        nbSelected = getSelected().length;
    }
    async function safeLoad() {
        try {
            await load();
        } catch (error) {
            showError(error);
        }
    }

    // the service notifies on each episode download, no need to reload more than once in a while
    let reloadTimer;
    function onPodcastsChanged() {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(safeLoad, 300);
    }
    onMount(() => {
        podcastService.on(EVENT_PODCASTS_CHANGED, onPodcastsChanged);
        safeLoad();
    });
    onDestroy(() => {
        clearTimeout(reloadTimer);
        podcastService.off(EVENT_PODCASTS_CHANGED, onPodcastsChanged);
    });

    function toggleSelect(item: Item) {
        item.selected = !item.selected;
        podcasts.setItem(podcasts.indexOf(item), item);
        updateSelected();
    }
    function unselectAll() {
        podcasts.forEach((item, index) => {
            if (item.selected) {
                item.selected = false;
                podcasts.setItem(index, item);
            }
        });
        updateSelected();
    }
    function getSelected() {
        const selected: PodcastWithCounts[] = [];
        podcasts?.forEach((item) => {
            if (item.selected) {
                selected.push(item.podcast);
            }
        });
        return selected;
    }

    async function openPodcast(item: Item) {
        if (nbSelected > 0) {
            toggleSelect(item);
            return;
        }
        const PodcastDetail = (await import('~/components/podcast/PodcastDetail.svelte')).default;
        navigate({ page: PodcastDetail, frame: 'podcasts', props: { podcastId: item.podcast.id } });
    }

    async function addByUrl() {
        const result = await prompt({
            title: lc('add_podcast_url'),
            message: lc('add_podcast_url_desc'),
            okButtonText: lc('add'),
            cancelButtonText: lc('cancel'),
            autoFocus: true,
            textFieldProperties: { hint: 'https://', keyboardType: 'url', autocapitalizationType: 'none', autocorrect: false }
        });
        Utils.dismissSoftInput();
        if (result?.result && result.text?.trim().length) {
            showLoading(lc('loading'));
            try {
                await podcastService.addByUrl(result.text);
                await load();
            } finally {
                hideLoading();
            }
        }
    }
    async function searchPodcast() {
        const PodcastSearch = (await import('~/components/podcast/PodcastSearch.svelte')).default;
        navigate({ page: PodcastSearch, frame: 'podcasts' });
    }
    async function showAddOptions(event) {
        try {
            if (!podcastSearchAvailable) {
                return await addByUrl();
            }
            await showPopoverMenu({
                options: [
                    { id: 'search', name: lc('search_podcast'), icon: 'mdi-magnify' },
                    { id: 'url', name: lc('add_podcast_url'), icon: 'mdi-link' }
                ],
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                onClose: async (item) => {
                    try {
                        if (item.id === 'search') {
                            await searchPodcast();
                        } else {
                            await addByUrl();
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

    async function refreshAll() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        try {
            await podcastService.refreshAll();
            await load();
        } catch (error) {
            showError(error);
        } finally {
            refreshing = false;
        }
    }

    async function downloadSelected() {
        for (const podcast of getSelected()) {
            await podcastService.downloadMissing(podcast.id);
        }
        unselectAll();
    }
    async function deleteSelectedDownloads() {
        const result = await confirm({ message: lc('delete_downloads_confirm', nbSelected), okButtonText: lc('delete'), cancelButtonText: lc('cancel') });
        if (result) {
            showLoading(lc('deleting'));
            try {
                for (const podcast of getSelected()) {
                    await podcastService.deleteDownloads(podcast.id);
                }
                unselectAll();
                await load();
            } finally {
                hideLoading();
            }
        }
    }
    async function removeSelected() {
        const result = await confirm({ message: lc('remove_podcasts_confirm', nbSelected), okButtonText: lc('remove'), cancelButtonText: lc('cancel') });
        if (result) {
            showLoading(lc('deleting'));
            try {
                for (const podcast of getSelected()) {
                    await podcastService.removePodcast(podcast.id);
                }
                await load();
            } finally {
                hideLoading();
            }
        }
    }
    async function showSelectedOptions(event) {
        const selected = getSelected();
        const hasDownloaded = selected.some((podcast) => podcast.downloadedCount > 0);
        try {
            await showPopoverMenu({
                options: [
                    { id: 'download', name: hasDownloaded ? lc('download_missing') : lc('download_all'), icon: 'mdi-download' },
                    ...(hasDownloaded ? [{ id: 'delete_downloads', name: lc('delete_downloads'), icon: 'mdi-delete', color: colorError }] : []),
                    { id: 'remove', name: lc('remove_podcast'), icon: 'mdi-playlist-remove', color: colorError }
                ],
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                props: { width: 240 * $fontScale },
                onClose: async (item) => {
                    try {
                        switch (item.id) {
                            case 'download':
                                await downloadSelected();
                                break;
                            case 'delete_downloads':
                                await deleteSelectedDownloads();
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

    function onGoBack() {
        if (nbSelected > 0) {
            unselectAll();
        } else {
            closeModal();
        }
    }
    function getCountsText(podcast: PodcastWithCounts) {
        return lc('podcast_counts', podcast.episodeCount - podcast.downloadedCount, podcast.downloadedCount);
    }
</script>

<frame id="podcasts">
    <page actionBarHidden={true}>
        <gridlayout paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,*">
            <collectionView bind:this={collectionView} iosOverflowSafeArea={true} items={podcasts} row={1} rowHeight={96 * $fontScale} android:paddingBottom={$windowInset.bottom + 80}>
                <Template let:item>
                    <gridlayout
                        backgroundColor={item.selected ? colorPrimaryContainer : colorSurfaceContainer}
                        borderRadius={12}
                        columns="72,*"
                        margin="4 10 4 10"
                        padding={10}
                        on:tap={() => openPodcast(item)}
                        on:longPress={() => toggleSelect(item)}>
                        <image borderRadius={8} decodeWidth={200} height={72} src={item.podcast.image} stretch="aspectFill" width={72} />
                        <SelectedIndicator horizontalAlignment="left" margin={2} selected={item.selected} />
                        <stacklayout col={1} marginLeft={12} verticalAlignment="center">
                            <label fontSize={16 * $fontScale} fontWeight="bold" lineBreak="end" maxLines={2} text={item.podcast.title} />
                            <label
                                color={colorOnSurfaceVariant}
                                fontSize={13 * $fontScale}
                                lineBreak="end"
                                maxLines={1}
                                text={item.podcast.author}
                                visibility={item.podcast.author ? 'visible' : 'collapsed'} />
                            <label color={colorPrimary} fontSize={13 * $fontScale} text={getCountsText(item.podcast)} />
                        </stacklayout>
                    </gridlayout>
                </Template>
            </collectionView>
            {#if loaded && podcasts?.length === 0}
                <flexlayout flexDirection="column" horizontalAlignment="center" paddingLeft={16} paddingRight={16} row={1} verticalAlignment="center" width="80%" transition:fade={{ duration: 200 }}>
                    <label color={colorOnSurfaceVariant} fontSize={19} text={lc('no_podcast_yet')} textAlignment="center" textWrap={true} />
                </flexlayout>
            {/if}
            <mdbutton class="fab" horizontalAlignment="right" marginBottom={$windowInset.bottom + 16} row={1} text="mdi-plus" verticalAlignment="bottom" on:tap={showAddOptions} />
            <CActionBar modalWindow={true} {onGoBack} title={l('podcasts')}>
                <mdbutton class="actionBarButton" isEnabled={!refreshing} text="mdi-refresh" variant="text" on:tap={refreshAll} />
            </CActionBar>
            {#if nbSelected > 0}
                <CActionBar forceCanGoBack={true} onGoBack={unselectAll} title={l('selected', nbSelected)} titleProps={{ maxLines: 1, autoFontSize: true }}>
                    <mdbutton class="actionBarButton" text="mdi-dots-vertical" variant="text" on:tap={showSelectedOptions} />
                </CActionBar>
            {/if}
        </gridlayout>
    </page>
</frame>
