<script context="module" lang="ts">
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { Color, Page, Screen, StackLayout } from '@nativescript/core';
    import { throttle } from '@nativescript/core/utils';
    import dayjs from 'dayjs';
    import { onDestroy, onMount } from 'svelte';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import { PackStartEvent, PackStopEvent, PlaybackEvent, PlaybackEventData, PlayingInfo, StoryHandler } from '~/handlers/StoryHandler';
    import { Template } from 'svelte-native/components';
    import { ControlSettings, Pack, Stage, stageCanGoHome } from '~/models/Pack';
    import { getBGServiceInstance } from '~/services/BgService';
    import { colors, windowInset } from '~/variables';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { showError } from '~/utils/showError';
    import { ALERT_OPTION_MAX_HEIGHT, COLORMATRIX_BLACK_TRANSPARENT, IMAGE_COLORMATRIX } from '~/utils/constants';
    import { formatDuration } from '~/helpers/formatter';
    import { goBack } from '~/utils/svelte/ui';
    import { showBottomsheetOptionSelect } from '~/utils/ui';

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
    let pack: Pack;
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
        handler.on('stagesChange', onStageChanged);
        handler.on(PackStartEvent, onPackStart);
        handler.on(PackStopEvent, onPackStop);

        DEV_LOG && console.log('onSetup', handler.selectedStageIndex, JSON.stringify(handler.currentStages), JSON.stringify(handler.currentPlayingInfo));
        pack = handler.pack;
        if (pack) {
            onStageChanged({ eventName: 'stagesChange', stages: handler.currentStages, selectedStageIndex: handler.selectedStageIndex, currentStage: handler.currentStageSelected() });
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
        handler?.off('stagesChange', onStageChanged);
        handler?.off(PackStartEvent, onPackStart);
        handler?.off(PackStopEvent, onPackStop);
    });

    function onPlayerProgressInterval() {
        currentTime = storyHandler?.playerCurrentTime || 0;
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

    function close() {
        goBack({
            transition: { name: 'slideBottom' }
        });
    }
    function onPackStop(event) {
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
        DEV_LOG && console.log('onStageChanged', currentStages.length, selectedStageIndex);
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
            storyHandler.pauseStory();
        } else {
            storyHandler.resumeStory();
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
        storyHandler?.setSelectedStage(e.value);
        selectedStageIndex = e.value;
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
            const stages = storyHandler.getAllPlayingStoriesFromPack();
            const data: any = await showBottomsheetOptionSelect({
                height: Math.min(stages.length * 56, ALERT_OPTION_MAX_HEIGHT),
                rowHeight: 56,
                options: stages.map((stage) => ({
                    type: 'image',
                    image: getImage(stage),
                    name: storyHandler.getStoryName(pack, stage),
                    stage
                }))
            });
            if (data?.stage) {
                storyHandler.setStage(data.stage);
            }
        } catch (error) {
            showError(error);
        }
    }
</script>

<page
    bind:this={page}
    actionBarHidden={true}
    backgroundColor={colorSecondaryContainer}
    navigationBarColor={colorSecondaryContainer}
    {statusBarStyle}
    on:navigatedFrom={onNavigatedFrom}>
    <gridlayout paddingBottom={$windowInset.bottom} rows="auto,*,auto, auto, auto,auto,auto">
        <label color={colorOnSecondaryContainer} fontSize={18} lineBreak="end" margin={10} maxLines={5} row={1} selectable={true} text={pack?.description || ' '} textAlignment="center" />
        <!-- <GridLayout row="2" verticalAlignment="center"> -->

        <gridlayout height={0.8 * screenWidth * 0.86} row={2}>
            <!-- <image id="image" backgroundColor="black" borderRadius={20} elevation={4} margin={10} src={currentImage} stretch="aspectFit" /> -->
            <pager items={currentStages} orientation="horizontal" peaking={PAGER_PEAKING} selectedIndex={selectedStageIndex} on:selectedIndexChange={onPagerChanged}>
                <Template let:item>
                    <gridlayout padding={PAGER_PAGE_PADDING - 10} on:tap={onOkButtonIfOption}>
                        <!-- <image backgroundColor={colorSecondary} borderRadius={20} colorMatrix={COLORMATRIX_BLACK_TRANSPARENT} elevation={4} margin="0 6 0 6" src={getImage(item)} stretch="aspectFit" /> -->
                        <image borderRadius={20} elevation={4} horizontalAlignment="center" src={getImage(item)} verticalAlignment="center" />
                    </gridlayout>
                </Template>
            </pager>
        </gridlayout>
        <!-- </GridLayout> -->
        <label color={colorOnSecondaryContainer} fontSize={20} fontWeight="bold" height={50} margin="0 10 0 10" maxLines={2} row={3} text={getStageName(currentStage)} textAlignment="center" />

        <slider maxValue=" 100" minValue="0" row="4" trackBackgroundColor={colorSurfaceContainerHigh} value={progress} verticalAlignment="bottom" on:valueChange={onSliderChange} />
        <canvaslabel color={colorOnSecondaryContainer} fontSize="14" height="18" margin="0 20 0 20" row={5}>
            <cspan text={formatDuration(currentTime, 'mm:ss')} verticalAlignment="bottom" />
            <cspan paddingRight="2" text={playingInfo && formatDuration(playingInfo.duration, 'mm:ss')} textAlignment="right" verticalAlignment="bottom" />
        </canvaslabel>
        <stacklayout horizontalAlignment="center" orientation="horizontal" row={6}>
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
            title={pack?.title}
            titleProps={{ fontWeight: 'bold' }}>
            <mdbutton class="actionBarButton" defaultVisualState="secondary" text="mdi-format-list-bulleted" variant="text" on:tap={showAllPlayableStories} />
        </CActionBar>
    </gridlayout>
</page>
