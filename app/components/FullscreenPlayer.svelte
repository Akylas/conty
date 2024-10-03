<script context="module" lang="ts">
    import { showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { Pager } from '@nativescript-community/ui-pager';
    import { Color, Page, Screen } from '@nativescript/core';
    import { throttle } from '@nativescript/core/utils';
    import { onDestroy, onMount } from 'svelte';
    import { Template } from 'svelte-native/components';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import {
        PackStartEvent,
        PackStopEvent,
        PlaybackEvent,
        PlaybackEventData,
        PlayingInfo,
        PlayingState,
        Playlist,
        StagesChangeEvent,
        StoryHandler,
        StoryStartEvent,
        StoryStopEvent
    } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
    import { ControlSettings, Pack, Stage, Story, stageCanGoHome } from '~/models/Pack';
    import { getBGServiceInstance } from '~/services/BgService';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { ALERT_OPTION_MAX_HEIGHT, IMAGE_COLORMATRIX } from '~/utils/constants';
    import { showError } from '~/utils/showError';
    import { closeModal, goBack } from '~/utils/svelte/ui';
    import { openLink, showBottomsheetOptionSelect } from '~/utils/ui';
    import { colors, windowInset } from '~/variables';

    const PAGER_PEAKING = 30;
    const PAGER_PAGE_PADDING = 16;

    const IMAGE_ELEVATION = __ANDROID__ ? 0 : 0;
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    let { colorPrimary, colorSecondaryContainer, colorOnSecondaryContainer, colorSurfaceContainerHigh, colorOutline } = $colors;
    $: ({ colorPrimary, colorSecondaryContainer, colorOnSecondaryContainer, colorSurfaceContainerHigh, colorOutline } = $colors);
    let page: NativeViewElementNode<Page>;
    let pager: NativeViewElementNode<Pager>;
    const colorMatrix = IMAGE_COLORMATRIX;

    const statusBarStyle = new Color(colorOnSecondaryContainer).isDark() ? 'light' : 'dark';
    const screenWidth = Screen.mainScreen.widthDIPs;
    const screenHeight = Screen.mainScreen.heightDIPs;

    let state: PlayingState = 'stopped';
    let items: { stage: Stage; image: string }[] = [];
    let selectedStageIndex = 0;
    let currentTime = 0;
    let currentStage: Stage;
    let currentImage: any;
    let showReplay = false;
    let progress = 0;
    let playingInfo: PlayingInfo = null;
    let pack: Pack = null;
    let story: Story = null;
    let playerStateInterval;
    let hideOtherPageItems = false;
    let controlSettings: ControlSettings;
    $: currentStage = items[selectedStageIndex]?.stage;
    $: controlSettings = currentStage?.controlSettings;
    $: hideOtherPageItems = controlSettings?.wheel === false && items.length > 0;
    // $: storyHandler?.getStageImage(pack, currentStage).then((r) => (currentImage = r));
    // $: DEV_LOG && console.warn('currentStage', JSON.stringify(currentStage));
    // $: DEV_LOG && console.warn('selectedStageIndex', selectedStageIndex);

    function getTimeFromProgress(progress: number) {
        return playingInfo ? (playingInfo.duration || 1) * progress : 0;
    }
    let storyHandler: StoryHandler;
    onMount(() => {});
    onDestroy(() => {
        stopPlayerInterval();
        storyHandler?.off(PlaybackEvent, onPlayerState);
        storyHandler?.off(PackStartEvent, onPackStart);
        storyHandler?.off(PackStopEvent, onPackStop);
        storyHandler?.off(StoryStartEvent, onStoryStart);
        storyHandler?.off(StoryStopEvent, onStoryStop);
        state = 'stopped';
    });
    let playlist: Playlist;
    onSetup(async (handler) => {
        storyHandler = handler;
        playlist = getBGServiceInstance().storyHandler.playlist;
        handler.on(PlaybackEvent, onPlayerState);
        handler.on('selectedStageChange', onSelectedStageChanged);
        handler.on(StagesChangeEvent, onStageChanged);
        handler.on(PackStartEvent, onPackStart);
        handler.on(PackStopEvent, onPackStop);
        handler.on(StoryStartEvent, onStoryStart);
        handler.on(StoryStopEvent, onStoryStop);

        pack = handler.playingPack;
        story = handler.playingStory;
        DEV_LOG && console.log('onSetup', handler.selectedStageIndex, JSON.stringify(handler.currentStages), JSON.stringify(handler.currentPlayingInfo), !!pack, !!story);
        if (pack) {
            onStageChanged({
                eventName: StagesChangeEvent,
                stages: handler.currentStages,
                selectedStageIndex: handler.selectedStageIndex,
                currentStage: handler.currentStageSelected(),
                currentStatesChanged: true
            });
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
        } else if (story) {
            onStoryStart({ story });
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
        } else {
            close();
        }
    });

    onUnsetup((handler) => {
        DEV_LOG && console.log('onUnsetup', !!handler);
        storyHandler = null;
        handler?.off(PlaybackEvent, onPlayerState);
        handler?.off('selectedStageChange', onSelectedStageChanged);
        handler?.off(StagesChangeEvent, onStageChanged);
        handler?.off(PackStartEvent, onPackStart);
        handler?.off(PackStopEvent, onPackStop);
        handler?.off(StoryStartEvent, onStoryStart);
        handler?.off(StoryStopEvent, onStoryStop);
    });

    function onPlayerProgressInterval() {
        if (story) {
            currentTime = storyHandler?.playerCurrentTime || 0 + playingInfo.durations.splice(0, storyHandler?.currentStoryAudioIndex).reduce((acc, d) => acc + d, 0);
        } else {
            currentTime = storyHandler?.playerCurrentTime || 0;
        }
        progress = playingInfo ? (currentTime / (playingInfo.duration || 1)) * 100 : 0;
    }
    function startPlayerInterval() {
        if (!playerStateInterval) {
            playerStateInterval = setInterval(onPlayerProgressInterval.bind(this), 1000);
        }
        onPlayerProgressInterval();
    }
    function stopPlayerInterval() {
        if (playerStateInterval) {
            clearInterval(playerStateInterval);
            playerStateInterval = null;
        }
    }

    function onPackStart(event) {
        // state = 'play';
        pack = event.pack;
        progress = 0;
        currentTime = 0;
        showReplay = false;
        DEV_LOG && console.log('onPackStart', JSON.stringify(playingInfo));
    }
    function onStoryStart(event) {
        // state = 'play';
        story = event.story;
        progress = 0;
        currentTime = 0;
        showReplay = false;
        story.pack.getThumbnail().then((r) => (currentImage = r));
        DEV_LOG && console.log('onStoryStart', JSON.stringify(playingInfo));
    }

    function close() {
        try {
            if (__IOS__) {
                closeModal();
            } else {
                goBack();
            }
        } catch (error) {
            showError(error);
        }
    }
    function onPackStop(event) {
        pack = null;
        currentImage = null;
        controlSettings = null;
        currentStage = null;
        items = [];
        selectedStageIndex = 0;
        showReplay = false;
        DEV_LOG && console.log('onPackStop', !!event.closeFullscreenPlayer);
        if (!!event.closeFullscreenPlayer) {
            close();
        }
    }
    function onStoryStop(event) {
        DEV_LOG && console.log('onStoryStop', event.closeFullscreenPlayer);
        currentImage = null;
        story = null;
        if (!!event.closeFullscreenPlayer) {
            close();
        }
    }
    function onPlayerState(event: PlaybackEventData) {
        playingInfo = event.playingInfo;
        state = event.state;
        // DEV_LOG && console.warn('onPlayerState', state, playingInfo.duration);
        if (state === 'playing') {
            startPlayerInterval();
        } else {
            stopPlayerInterval();
        }
        if (state === 'stopped') {
            progress = 0;
            currentTime = 0;
            showReplay = true;
        }
    }
    async function getItem(stage: Stage) {
        return {
            stage,
            image: await getImage(stage)
        };
    }
    async function onStageChanged(event) {
        try {
            DEV_LOG && console.warn('FullScreen', 'onStageChanged', event.selectedStageIndex, event.currentStatesChanged, event.stages.length);
            if (event.currentStatesChanged) {
                items = await Promise.all(
                    event.stages.map(async (stage) => ({
                        stage,
                        image: await getImage(stage)
                    }))
                );
                //     items = event.stages.map((stage) => ({
                //     stage,
                //     image: getImage(stage)
                // }));
            }
            selectedStageIndex = event.selectedStageIndex;
            // if (pager?.nativeElement) {
            //     pager.nativeElement.selectedIndex = event.selectedStageIndex;
            //     pager.nativeElement.scrollToIndexAnimated(event.selectedStageIndex, false);

            // }
            // DEV_LOG &&
            //     console.warn(
            //         'FullScreen',
            //         'onStageChanged1',
            //         items.map((i) => i.image)
            //     );

            // changing pager selectedIndex is animated by default
            showReplay = false;
            storyHandler?.getCurrentStageImage().then((r) => (currentImage = r));
        } catch (error) {
            showError(error);
        }
    }
    function onSelectedStageChanged(event) {
        selectedStageIndex = event.selectedStageIndex;
        showReplay = false;
    }

    function stopPlayback() {
        storyHandler.stopPlaying({ fade: true });
    }

    const onSliderChange = throttle((e) => {
        const value = e.value;
        const actualProgress = Math.round(getTimeFromProgress(value / 100));
        if (Math.floor(value) === Math.floor(progress)) {
            return;
        }
        storyHandler.setPlayerTimestamp(actualProgress);

        onPlayerProgressInterval();
    }, 500);

    function togglePlayState() {
        storyHandler?.handleAction('play');
    }
    async function onOkButton() {
        if (story && playlist.length > 1) {
            storyHandler.stopPlaying({ updatePlaylist: true, closeFullscreenPlayer: true });
        } else {
            storyHandler?.handleAction('ok');
        }
    }
    async function onOkButtonIfOption() {
        if (!controlSettings?.ok || items.length <= 1) {
            return;
        }
        storyHandler?.handleAction('ok');
    }
    async function onHomeButton() {
        storyHandler?.handleAction('home');
    }
    async function onPagerChanged(e) {
        DEV_LOG && console.log('onPagerChanged', !!pack, selectedStageIndex, e.value);
        if (pack && selectedStageIndex !== e.value) {
            selectedStageIndex = e.value;
            storyHandler?.setSelectedStage(selectedStageIndex);
        }
    }
    async function getImage(stage: Stage) {
        return storyHandler?.getStageImage(pack, stage);
    }

    function getStageName(stage: Stage) {
        return storyHandler?.getStageName(pack, stage) || ' ';
    }

    function onNavigatedFrom(args): void {
        stopPlayerInterval();
    }
    async function showAllPlayableStories() {
        try {
            const thePack = pack || story?.pack;
            const stories = await storyHandler.findAllStories(thePack);
            const thumbnail = await thePack.getThumbnail();
            const rowHeight = 60;
            const data: any = await showBottomsheetOptionSelect({
                height: Math.min(stories.length * rowHeight, Screen.mainScreen.heightDIPs * 0.7),
                rowHeight,
                options: stories.map((story) => ({
                    type: 'image',
                    image: thumbnail,
                    name: story.name,
                    subtitle: formatDuration(story.duration),
                    story
                }))
            });
            if (data?.story) {
                const index = stories.findIndex((s) => s.id === data.story.id);
                storyHandler.playStory(data?.story as Story, false);
                storyHandler.playlist.splice(0, storyHandler.playlist.length, ...stories.slice(index).map((s) => ({ story: s })));
            }
        } catch (error) {
            showError(error);
        }
    }
    function onLinkTap(e) {
        openLink(e.link);
    }
    async function showPlaylist() {
        try {
            const component = (await import('~/components/PlaylistView.svelte')).default;
            await showBottomSheet({
                view: component as any,
                props: {
                    trackingScrollView: 'collectionView'
                }
            });
        } catch (error) {
            showError(error);
        }
    }
</script>

<page
    bind:this={page}
    id="fullscreen"
    actionBarHidden={true}
    backgroundColor={colorSecondaryContainer}
    navigationBarColor={colorSecondaryContainer}
    {statusBarStyle}
    on:navigatedFrom={onNavigatedFrom}>
    <gridlayout paddingBottom={$windowInset.bottom} paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,*,auto, auto, auto,auto">
        <flexlayout flexDirection="column" row={1}>
            <label
                color={colorOnSecondaryContainer}
                flexGrow={0}
                flexShrink={5}
                fontSize={18}
                html={pack?.description || pack?.subtitle || story?.pack?.description || ' '}
                lineBreak="end"
                linkColor={colorPrimary}
                margin={10}
                maxLines={5}
                selectable={true}
                textAlignment="center"
                on:linkTap={onLinkTap} />
            <!-- <GridLayout row="2" verticalAlignment="center"> -->

            <gridlayout flexGrow={1} flexShrink={0} height={0.8 * screenWidth * 0.86} row={2}>
                {#if __IOS__ || pack}
                    <pager
                        bind:this={pager}
                        {items}
                        marginLeft={hideOtherPageItems ? PAGER_PEAKING : 0}
                        marginRight={hideOtherPageItems ? PAGER_PEAKING : 0}
                        orientation="horizontal"
                        peaking={hideOtherPageItems ? 0 : PAGER_PEAKING}
                        preserveIndexOnItemsChange={true}
                        selectedIndex={selectedStageIndex}
                        visibility={pack ? 'visible' : 'hidden'}
                        on:selectedIndexChange={onPagerChanged}>
                        <Template let:index let:item>
                            <gridlayout padding={PAGER_PAGE_PADDING - 10} on:tap={onOkButtonIfOption}>
                                <!-- we need another gridlayout because elevation does not work on Image on iOS -->
                                <gridlayout borderRadius={20} elevation={IMAGE_ELEVATION} horizontalAlignment="center" verticalAlignment="center">
                                    <image id={`image_${index}`} borderRadius={20} sharedTransitionTag={index === 0 ? 'cover' : null} src={item.image} />
                                </gridlayout>
                            </gridlayout>
                        </Template>
                    </pager>
                {/if}
                <!-- we need another gridlayout because elevation does not work on Image on iOS -->
                {#if __IOS__ || story}
                    <gridlayout marginLeft={PAGER_PEAKING} marginRight={PAGER_PEAKING} visibility={pack ? 'hidden' : 'visible'} on:tap={onOkButtonIfOption}>
                        <gridlayout
                            borderRadius={20}
                            elevation={IMAGE_ELEVATION}
                            horizontalAlignment="center"
                            margin={PAGER_PAGE_PADDING - 10}
                            verticalAlignment="center"
                            visibility={pack ? 'hidden' : 'visible'}>
                            <image borderRadius={20} sharedTransitionTag="cover" src={currentImage} />
                            <stacklayout
                                height={50}
                                horizontalAlignment="center"
                                marginBottom={5}
                                orientation="horizontal"
                                verticalAlignment="bottom"
                                visibility={story?.images?.length ? 'visible' : 'hidden'}>
                                {#if story}
                                    {#each story.images as image}
                                        <gridlayout borderColor={colorOutline} borderRadius={10} borderWidth={1} horizontalAlignment="center" margin={3} verticalAlignment="center">
                                            <image borderRadius={10} opacity={0.6} src={story.pack.getImage(image)} />
                                        </gridlayout>
                                    {/each}
                                {/if}
                            </stacklayout>
                        </gridlayout>
                    </gridlayout>
                    <!-- <collectionview
                        backgroundColor="red"
                        colWidth={60}
                        height={60}
                        items={story.images}
                        orientation="horizontal"
                        verticalAlignment="top"
                        visibility={story?.images?.length ? 'visible' : 'hidden'}>
                        <Template let:item>
                            <gridlayout borderRadius={10} horizontalAlignment="center" verticalAlignment="center">
                                <image borderRadius={10} sharedTransitionTag="cover" src={story.pack.getImage(item)} />
                            </gridlayout>
                        </Template>
                    </collectionview> -->
                {/if}
            </gridlayout>
        </flexlayout>

        <!-- </GridLayout> -->
        <label
            color={colorOnSecondaryContainer}
            fontSize={20}
            fontWeight="bold"
            height={50}
            margin="0 10 0 10"
            maxLines={2}
            row={2}
            text={(pack ? getStageName(currentStage) : story?.names?.filter((s) => !!s).join(' / ')) || ' '}
            textAlignment="center" />

        <slider margin="0 10 0 10" maxValue=" 100" minValue="0" row="3" trackBackgroundColor={colorSurfaceContainerHigh} value={progress} verticalAlignment="bottom" on:valueChange={onSliderChange} />
        <canvaslabel color={colorOnSecondaryContainer} fontSize="14" height="18" margin="0 20 0 20" row={4}>
            <cspan text={formatDuration(currentTime, 'mm:ss')} verticalAlignment="bottom" />
            <cspan paddingRight="2" text={playingInfo && formatDuration(playingInfo.duration, 'mm:ss')} textAlignment="right" verticalAlignment="bottom" />
        </canvaslabel>
        <stacklayout horizontalAlignment="center" orientation="horizontal" row={5}>
            <mdbutton
                class="playerButton"
                horizontalAlignment="right"
                text={pack ? 'mdi-home' : 'mdi-skip-previous'}
                verticalAlignment="center"
                visibility={stageCanGoHome(currentStage) ? 'visible' : 'hidden'}
                on:tap={onHomeButton} />
            <mdbutton
                class="playerButton"
                horizontalAlignment="right"
                text={state === 'playing' ? 'mdi-pause' : showReplay ? 'mdi-replay' : 'mdi-play'}
                verticalAlignment="center"
                on:tap={togglePlayState} />
            <mdbutton
                id="ok"
                class="playerButton"
                horizontalAlignment="right"
                text={pack ? 'mdi-check' : 'mdi-skip-next'}
                verticalAlignment="center"
                visibility={!PRODUCTION || (story && playlist.length > 1) || !!controlSettings?.ok ? 'visible' : 'hidden'}
                on:tap={onOkButton} />
        </stacklayout>
        <CActionBar
            backgroundColor="transparent"
            buttonsDefaultVisualState="secondary"
            labelsDefaultVisualState="secondary"
            modalWindow={true}
            onGoBack={close}
            showMenuIcon={true}
            textAlignment="center"
            title={pack?.title || story?.name}
            titleProps={{ fontWeight: 'bold', autoFontSize: true, sharedTransitionTag: 'title' }}>
            <mdbutton class="actionBarButton" defaultVisualState="secondary" text="mdi-playlist-music-outline" variant="text" on:tap={showPlaylist} />
            <mdbutton class="actionBarButton" defaultVisualState="secondary" text="mdi-folder-music-outline" variant="text" on:tap={showAllPlayableStories} />
        </CActionBar>
    </gridlayout>
</page>
