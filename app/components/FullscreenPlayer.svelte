<script context="module" lang="ts">
    import { Color, Page, Screen } from '@nativescript/core';
    import { throttle } from '@nativescript/core/utils';
    import { onDestroy, onMount } from 'svelte';
    import { Template } from 'svelte-native/components';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import { PackStartEvent, PackStopEvent, PlaybackEvent, PlaybackEventData, PlayingInfo, StagesChangeEvent, StoryHandler, StoryStartEvent, StoryStopEvent } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
    import { ControlSettings, Pack, Stage, Story, stageCanGoHome } from '~/models/Pack';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { ALERT_OPTION_MAX_HEIGHT, IMAGE_COLORMATRIX } from '~/utils/constants';
    import { showError } from '~/utils/showError';
    import { goBack } from '~/utils/svelte/ui';
    import { openLink, showBottomsheetOptionSelect } from '~/utils/ui';
    import { colors, windowInset } from '~/variables';

    const PAGER_PEAKING = 30;
    const PAGER_PAGE_PADDING = 16;
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    let { colorSecondary, colorSecondaryContainer, colorOnSecondaryContainer, colorPrimaryContainer, colorOnBackground } = $colors;
    $: ({
        colorSecondary,
        colorSecondaryContainer,
        colorOnSecondaryContainer,
        colorSurfaceContainerHigh,
        colorOnBackground,
        colorSurfaceContainerLow,
        colorOnSecondary,
        colorSurfaceContainer,
        colorOnSurfaceVariant,
        colorOutline,
        colorOutlineVariant,
        colorSurface,
        colorPrimaryContainer,
        colorOnPrimaryContainer,
        colorError
    } = $colors);
    let page: NativeViewElementNode<Page>;
    const colorMatrix = IMAGE_COLORMATRIX;

    const statusBarStyle = new Color(colorSecondaryContainer).isDark() ? 'dark' : 'light';

    const screenWidth = Screen.mainScreen.widthDIPs;
    const screenHeight = Screen.mainScreen.heightDIPs;

    let state: 'play' | 'pause' | 'stopped' = 'stopped';
    let currentStages: Stage[] = [];
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
    let controlSettings: ControlSettings;
    $: controlSettings = currentStages?.[selectedStageIndex]?.controlSettings;
    $: currentStage = currentStages?.[selectedStageIndex];
    // $: storyHandler?.getStageImage(pack, currentStage).then((r) => (currentImage = r));
    // $: DEV_LOG && console.warn('currentStage', currentStage);

    function getTimeFromProgress(progress: number) {
        return playingInfo ? (playingInfo.duration || 1) * progress : 0;
    }
    let storyHandler: StoryHandler;
    onMount(() => {});
    onDestroy(() => {
        stopPlayerInterval();
        storyHandler?.off(PlaybackEvent, onPlayerState);
        storyHandler?.off(PackStartEvent, onPackStart);
        state = 'stopped';
    });

    onSetup(async (handler) => {
        storyHandler = handler;
        handler.on(PlaybackEvent, onPlayerState);
        handler.on('selectedStageChange', onSelectedStageChanged);
        handler.on(StagesChangeEvent, onStageChanged);
        handler.on(PackStartEvent, onPackStart);
        handler.on(PackStopEvent, onPackStop);
        handler.on(StoryStartEvent, onStoryStart);
        handler.on(StoryStopEvent, onStoryStop);

        DEV_LOG && console.log('onSetup', handler.selectedStageIndex, JSON.stringify(handler.currentStages), JSON.stringify(handler.currentPlayingInfo));
        pack = handler.playingPack;
        story = handler.playingStory;
        if (pack) {
            onStageChanged({ eventName: StagesChangeEvent, stages: handler.currentStages, selectedStageIndex: handler.selectedStageIndex, currentStage: handler.currentStageSelected() });
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
        } else if (story) {
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
        DEV_LOG && console.log('onPackStart', JSON.stringify(playingInfo));
    }
    function onStoryStart(event) {
        // state = 'play';
        story = event.story;
        story.pack.getThumbnail().then((r) => (currentImage = r));
        DEV_LOG && console.log('onStoryStart', JSON.stringify(playingInfo));
    }

    function close() {
        goBack({
            transition: { name: 'slideBottom' }
        });
    }
    function onPackStop(event) {
        pack = null;
        currentImage = null;
        controlSettings = null;
        currentStage = null;
        currentStages = [];
        selectedStageIndex = 0;
        showReplay = false;
        if (event.closeFullscreenPlayer) {
            close();
        }
    }
    function onStoryStop(event) {
        currentImage = null;
        story = null;
        close();
    }
    function onPlayerState(event: PlaybackEventData) {
        playingInfo = event.playingInfo;
        state = event.state;
        // DEV_LOG && console.warn('onPlayerState', state, playingInfo.duration);
        if (state === 'play') {
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
    function onStageChanged(event) {
        currentStages = event.stages;
        selectedStageIndex = event.selectedStageIndex;
        DEV_LOG && console.warn('FullScreen', 'onStageChanged', currentStages.length, selectedStageIndex, JSON.stringify(currentStages));
        showReplay = false;
        storyHandler?.getCurrentStageImage().then((r) => (currentImage = r));
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
        if (state === 'play') {
            storyHandler.pausePlayback();
        } else {
            storyHandler.resumePlayback();
        }
    }
    async function onOkButton() {
        if (!controlSettings?.ok) {
            return;
        }
        storyHandler?.onStageOk();
    }
    async function onOkButtonIfOption() {
        if (!controlSettings?.ok || currentStages.length <= 1) {
            return;
        }
        storyHandler?.onStageOk();
    }
    async function onHomeButton() {
        storyHandler?.onStageHome();
    }
    async function onPagerChanged(e) {
        if (pack) {
            storyHandler?.setSelectedStage(e.value);
            selectedStageIndex = e.value;
        }
    }
    async function getImage(stage: Stage) {
        DEV_LOG && console.log('getImage', stage.uuid);
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
            const stories = await storyHandler.findAllStories(pack);
            const data: any = await showBottomsheetOptionSelect({
                height: Math.min(stories.length * 56, ALERT_OPTION_MAX_HEIGHT),
                rowHeight: 56,
                options: stories.map((story) => ({
                    type: 'image',
                    image: pack.getThumbnail(),
                    name: story.name,
                    subtitle: formatDuration(story.duration),
                    story
                }))
            });
            if (data?.story) {
                storyHandler.playStory(data?.story as Story);
            }
        } catch (error) {
            showError(error);
        }
    }
    function onLinkTap(e) {
        openLink(e.link);
    }
</script>

<page bind:this={page} actionBarHidden={true} backgroundColor={colorSecondaryContainer} navigationBarColor={colorSecondaryContainer} {statusBarStyle} on:navigatedFrom={onNavigatedFrom}>
    <gridlayout paddingBottom={$windowInset.bottom} rows="auto,*,auto, auto, auto,auto,auto">
        <label
            color={colorOnSecondaryContainer}
            fontSize={18}
            html={pack?.description || pack?.subtitle || ' '}
            lineBreak="end"
            margin={10}
            maxLines={5}
            row={1}
            selectable={true}
            textAlignment="center"
            visibility={pack ? 'visible' : 'collapsed'}
            on:linkTap={onLinkTap} />
        <!-- <GridLayout row="2" verticalAlignment="center"> -->

        <gridlayout height={0.8 * screenWidth * 0.86} row={2}>
            <!-- <image id="image" backgroundColor="black" borderRadius={20} elevation={4} margin={10} src={currentImage} stretch="aspectFit" /> -->
            {#if pack}
                <pager items={currentStages} orientation="horizontal" peaking={PAGER_PEAKING} selectedIndex={selectedStageIndex} on:selectedIndexChange={onPagerChanged}>
                    <Template let:index let:item>
                        <gridlayout padding={PAGER_PAGE_PADDING - 10} on:tap={onOkButtonIfOption}>
                            <!-- <image backgroundColor={colorSecondary} borderRadius={20} colorMatrix={COLORMATRIX_BLACK_TRANSPARENT} elevation={4} margin="0 6 0 6" src={getImage(item)} stretch="aspectFit" /> -->
                            <image borderRadius={20} elevation={4} horizontalAlignment="center" sharedTransitionTag={index === 0 ? 'cover' : null} src={getImage(item)} verticalAlignment="center" />
                        </gridlayout>
                    </Template>
                </pager>
            {:else}
                <image
                    backgroundColor="red"
                    borderRadius={20}
                    elevation={4}
                    horizontalAlignment="center"
                    margin={PAGER_PAGE_PADDING - 10}
                    sharedTransitionTag="cover"
                    src={currentImage}
                    verticalAlignment="center" />
            {/if}
        </gridlayout>
        <!-- </GridLayout> -->
        <label color={colorOnSecondaryContainer} fontSize={20} fontWeight="bold" height={50} margin="0 10 0 10" maxLines={2} row={3} text={getStageName(currentStage)} textAlignment="center" />

        <slider maxValue=" 100" minValue="0" row="4" trackBackgroundColor={colorSurfaceContainerHigh} value={progress} verticalAlignment="bottom" on:valueChange={onSliderChange} />
        <canvaslabel color={colorOnSecondaryContainer} fontSize="14" height="18" margin="0 20 0 20" row={5}>
            <cspan text={formatDuration(currentTime, 'mm:ss')} verticalAlignment="bottom" />
            <cspan paddingRight="2" text={playingInfo && formatDuration(playingInfo.duration, 'mm:ss')} textAlignment="right" verticalAlignment="bottom" />
        </canvaslabel>
        <stacklayout horizontalAlignment="center" orientation="horizontal" row={6} visibility={pack ? 'visible' : 'hidden'}>
            <mdbutton
                class="playerButton"
                horizontalAlignment="right"
                text="mdi-home"
                verticalAlignment="center"
                visibility={stageCanGoHome(currentStage) ? 'visible' : 'hidden'}
                on:tap={onHomeButton} />
            <mdbutton
                class="playerButton"
                horizontalAlignment="right"
                text={state === 'play' ? 'mdi-pause' : showReplay ? 'mdi-replay' : 'mdi-play'}
                verticalAlignment="center"
                on:tap={togglePlayState} />
            <mdbutton
                id="ok"
                class="playerButton"
                horizontalAlignment="right"
                text="mdi-check"
                verticalAlignment="center"
                visibility={!!controlSettings?.ok ? 'visible' : 'hidden'}
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
            titleProps={{ fontWeight: 'bold' }}>
            <mdbutton class="actionBarButton" defaultVisualState="secondary" text="mdi-format-list-bulleted" variant="text" on:tap={showAllPlayableStories} />
        </CActionBar>
    </gridlayout>
</page>
