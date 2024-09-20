<script context="module" lang="ts">
    import { GridLayout, Screen } from '@nativescript/core';
    import { onDestroy, onMount } from 'svelte';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import { PackStartEvent, PackStopEvent, PlaybackEvent, PlaybackEventData, PlayingInfo, StageEventData, StagesChangeEvent, StoryHandler } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
    import { ControlSettings, Pack, Stage, stageCanGoHome } from '~/models/Pack';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { IMAGE_COLORMATRIX } from '~/utils/constants';
    import { showError } from '~/utils/showError';
    import { showFullscreenPlayer } from '~/utils/ui';
    import { fonts } from '~/variables';
    const screenWidth = Screen.mainScreen.widthDIPs;
</script>

<script lang="ts">
    let state: 'play' | 'pause' | 'stopped' = 'stopped';
    let currentStages: Stage[] = [];
    let selectedStageIndex = 0;
    let currentStage: Stage;
    let currentTime = 0;
    let currentImage: any;
    let showReplay = false;
    let progress = 0;
    let playingInfo: PlayingInfo = null;
    let pack: Pack;
    // let visible = false;
    let storyHandler: StoryHandler;
    let playerStateInterval;
    let controlSettings: ControlSettings;
    $: currentStage = currentStages?.[selectedStageIndex];
    $: controlSettings = currentStage?.controlSettings;
    // $: storyHandler?.getStageImage(pack, currentStage).then((r) => (currentImage = r));
    // $: DEV_LOG && console.log('controlSettings', JSON.stringify(controlSettings));
    // $: DEV_LOG && console.log('currentStage', JSON.stringify(currentStage));
    // $: DEV_LOG && console.info('image', !!pack, currentImage);

    // function show() {
    //     if (visible) {
    //         return;
    //     }
    //     visible = true;
    //     gridLayout.nativeView.animate({
    //         translate: {
    //             x: 0,
    //             y: 0
    //         },
    //         duration: 200
    //     });
    // }
    // function hide() {
    //     if (!visible) {
    //         return;
    //     }
    //     visible = false;
    //     gridLayout.nativeView.animate({
    //         translate: {
    //             x: -screenWidth,
    //             y: 0
    //         },
    //         duration: 200
    //     });
    // }

    function getTimeFromProgress(progress: number) {
        return playingInfo ? (playingInfo.duration || 1) * progress : 0;
    }
    onMount(() => {});
    onDestroy(() => {
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

        pack = handler.pack;
        if (pack) {
            DEV_LOG && console.log('onSetup', selectedStageIndex, JSON.stringify(currentStages));
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
            onStageChanged({ eventName: StagesChangeEvent, stages: handler.currentStages, selectedStageIndex: handler.selectedStageIndex, currentStage: handler.currentStageSelected() });
        }
    });

    onUnsetup((handler) => {
        DEV_LOG && console.log('onUnsetup');
        storyHandler = null;
        handler?.off(PlaybackEvent, onPlayerState);
        handler?.off('selectedStageChange', onSelectedStageChanged);
        handler?.off(StagesChangeEvent, onStageChanged);
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
        pack = event.pack;
    }
    function onPackStop(event) {}
    function onPlayerState(event: PlaybackEventData) {
        DEV_LOG && console.log('onPlayerState', event.playingInfo?.name);
        playingInfo = event.playingInfo;
        if (event.state !== state) {
            state = event.state;
            if (state === 'play') {
                DEV_LOG && console.log('onPlayerState1', playingInfo?.name);
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
    }
    function onStageChanged(event: StageEventData) {
        try {
            currentStages = event.stages;
            selectedStageIndex = event.selectedStageIndex;
            showReplay = false;
            DEV_LOG && console.log('BarPlayer, onStageChanged');
            storyHandler?.getCurrentStageImage().then((r) => {
                currentImage = r;
                DEV_LOG && console.log('currentImage', r);
                return r;
            });
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

    function togglePlayState() {
        if (state === 'play') {
            storyHandler.pauseStory();
        } else {
            storyHandler.resumeStory();
        }
    }
    async function onOkButton() {
        storyHandler?.onStageOk();
    }
    async function onHomeButton() {
        storyHandler?.onStageHome();
    }

    function selectPreviousAction() {
        storyHandler?.setSelectedStage(Math.max(selectedStageIndex - 1, 0));
    }
    function selectNextAction() {
        storyHandler?.setSelectedStage(Math.min(selectedStageIndex + 1, currentStages.length - 1));
    }
</script>

<gridlayout {...$$restProps}>
    <gridlayout backgroundColor="#000000dd" borderRadius={4} columns="70,*">
        <image src={currentImage} stretch="aspectFill" on:tap={showFullscreenPlayer} />
        <label col={1} colSpan={2} color="white" fontSize={15} lineBreak="end" margin="0 3 0 3" maxLines={2} row={1} verticalTextAlignment="top">
            <span fontFamily={$fonts.mdi} text="mdi-music  " verticalAlignment="bottom" />
            <span text={playingInfo?.name || ''} />
        </label>
        <canvaslabel col={1} color="lightgray" fontSize={12} margin="0 10 4 10" verticalTextAlignment="bottom">
            <cspan text={formatDuration(currentTime, 'mm:ss')} verticalAlignment="bottom" />
            <cspan text={playingInfo && formatDuration(playingInfo.duration, 'mm:ss')} textalignment="right" verticalalignment="bottom" />
        </canvaslabel>
        <stacklayout col={1} horizontalAlignment="right" orientation="horizontal">
            <mdbutton class="whiteSmallActionBarButton" text="mdi-arrow-left-bold" variant="text" visibility={currentStages.length > 1 ? 'visible' : 'collapsed'} on:tap={selectPreviousAction} />
            <mdbutton class="whiteSmallActionBarButton" text="mdi-arrow-right-bold" variant="text" visibility={currentStages.length > 1 ? 'visible' : 'collapsed'} on:tap={selectNextAction} />
            <mdbutton class="whiteSmallActionBarButton" text="mdi-home" variant="text" visibility={stageCanGoHome(currentStage) ? 'visible' : 'collapsed'} on:tap={onHomeButton} />
            <mdbutton
                class="whiteSmallActionBarButton"
                text={state === 'play' ? 'mdi-pause' : showReplay ? 'mdi-replay' : 'mdi-play'}
                variant="text"
                visibility={currentStages.length ? 'visible' : 'hidden'}
                on:tap={togglePlayState} />
            <mdbutton class="whiteSmallActionBarButton" text="mdi-check" variant="text" visibility={!!controlSettings?.ok ? 'visible' : 'collapsed'} on:tap={onOkButton} />
            <mdbutton class="whiteSmallActionBarButton" text="mdi-close" variant="text" on:tap={stopPlayback} />
        </stacklayout>

        <mdprogress colSpan={4} color="white" margin={0} maxValue=" 100" padding={0} value={progress} verticalAlignment="bottom" />
    </gridlayout>
</gridlayout>
