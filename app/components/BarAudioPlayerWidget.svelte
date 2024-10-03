<script context="module" lang="ts">
    import { GridLayout, Screen } from '@nativescript/core';
    import { onDestroy, onMount } from 'svelte';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import {
        PackStartEvent,
        PackStopEvent,
        PlaybackEvent,
        PlaybackEventData,
        PlayingInfo,
        PlayingState,
        StageEventData,
        StagesChangeEvent,
        StoryHandler,
        StoryStartEvent,
        StoryStopEvent
    } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
    import { ControlSettings, Pack, Stage, Story, stageCanGoHome } from '~/models/Pack';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { IMAGE_COLORMATRIX } from '~/utils/constants';
    import { showError } from '~/utils/showError';
    import { showFullscreenPlayer } from '~/utils/ui';
    import { fonts } from '~/variables';
    const screenWidth = Screen.mainScreen.widthDIPs;
</script>

<script lang="ts">
    let state: PlayingState = 'stopped';
    let currentStages: Stage[] = [];
    let selectedStageIndex = 0;
    let currentStage: Stage;
    let currentTime = 0;
    let currentImage: any;
    let showReplay = false;
    let progress = 0;
    let playingInfo: PlayingInfo = null;
    let pack: Pack = null;
    let story: Story = null;
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

    function currentPack() {
        return pack || story?.pack;
    }

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
        handler.on(StoryStartEvent, onStoryStart);
        handler.on(StoryStopEvent, onStoryStop);

        pack = handler.playingPack;
        story = handler.playingStory;
        DEV_LOG && console.log('onSetup', selectedStageIndex);
        if (pack) {
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
            onStageChanged({ eventName: StagesChangeEvent, stages: handler.currentStages, selectedStageIndex: handler.selectedStageIndex, currentStage: handler.currentStageSelected() });
        }
        if (story) {
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
            // onStageChanged({ eventName: StagesChangeEvent, stages: handler.currentStages, selectedStageIndex: handler.selectedStageIndex, currentStage: handler.currentStageSelected() });
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
        story = null;
        pack = event.pack;
    }
    function onPackStop(event) {
        currentImage = null;
        pack = null;
        controlSettings = null;
        currentStage = null;
        currentStages = [];
        selectedStageIndex = 0;
        showReplay = false;
    }

    function onStoryStart(event) {
        DEV_LOG && console.log('onStoryStart');
        pack = null;
        story = event.story;
        story.pack.getThumbnail().then((r) => (currentImage = r));
    }
    function onStoryStop(event) {
        DEV_LOG && console.log('onStoryStop');
        story = null;
        currentImage = null;
    }
    function onPlayerState(event: PlaybackEventData) {
        playingInfo = event.playingInfo;
        if (event.state !== state) {
            state = event.state;
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
    }
    function onStageChanged(event: StageEventData) {
        try {
            currentStages = event.stages;
            selectedStageIndex = event.selectedStageIndex;
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
        storyHandler?.handleAction('stop');
    }

    function togglePlayState() {
        storyHandler?.handleAction('play');
    }
    async function onOkButton() {
        storyHandler?.handleAction('ok');
    }
    async function onHomeButton() {
        storyHandler?.handleAction('home');
    }

    function selectPreviousAction() {
        storyHandler?.handleAction('previous');
    }
    function selectNextAction() {
        storyHandler?.handleAction('next');
    }
</script>

<gridlayout {...$$restProps} on:tap={() => {}}>
    <gridlayout backgroundColor="#000000dd" borderRadius={4} columns="70,*" rows="*">
        <image backgroundColor={currentPack()?.extra?.colors?.[0]} sharedTransitionTag="cover" src={currentImage} stretch="aspectFit" on:tap={showFullscreenPlayer} />
        <label col={1} color="white" fontSize={15} lineBreak="end" margin="3 3 0 10" maxLines={2} row={1} sharedTransitionTag="title" text={playingInfo?.name || ''} verticalAlignment="top"> </label>
        <canvaslabel col={1} color="lightgray" fontSize={12} margin="0 10 4 10" verticalTextAlignment="bottom">
            <cspan text={formatDuration(currentTime, 'mm:ss')} verticalAlignment="bottom" />
            <cspan text={playingInfo && formatDuration(playingInfo.duration, 'mm:ss')} textalignment="right" verticalalignment="bottom" />
        </canvaslabel>
        <gridlayout col={1} columns="auto,auto,auto,auto,auto,auto" horizontalAlignment="right" orientation="horizontal" verticalAlignment="center">
            <mdbutton class="whiteSmallActionBarButton" text="mdi-home" variant="text" visibility={stageCanGoHome(currentStage) ? 'visible' : 'collapsed'} on:tap={onHomeButton} />
            <mdbutton
                class="whiteSmallActionBarButton"
                col={1}
                text="mdi-arrow-left-bold"
                variant="text"
                visibility={currentStages.length > 1 ? 'visible' : 'collapsed'}
                on:tap={selectPreviousAction} />
            <mdbutton class="whiteSmallActionBarButton" col={2} text="mdi-arrow-right-bold" variant="text" visibility={currentStages.length > 1 ? 'visible' : 'collapsed'} on:tap={selectNextAction} />
            <mdbutton
                class="whiteSmallActionBarButton"
                col={3}
                text={state === 'playing' ? 'mdi-pause' : state !== 'paused' && showReplay ? 'mdi-replay' : 'mdi-play'}
                variant="text"
                visibility={story || currentStages?.length ? 'visible' : 'hidden'}
                on:tap={togglePlayState} />
            <mdbutton class="whiteSmallActionBarButton" col={4} text="mdi-check" variant="text" visibility={controlSettings && !!controlSettings?.ok ? 'visible' : 'collapsed'} on:tap={onOkButton} />
            <mdbutton class="whiteSmallActionBarButton" col={5} text="mdi-close" variant="text" on:tap={stopPlayback} />
        </gridlayout>

        <mdprogress colSpan={4} color="white" margin={0} maxValue=" 100" padding={0} value={progress} verticalAlignment="bottom" />
    </gridlayout>
</gridlayout>
