<script context="module" lang="ts">
    import { lc } from '@nativescript-community/l';
    import { showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { Pager } from '@nativescript-community/ui-pager';
    import { Color, EventData, GridLayout, Image, Page, Screen, View } from '@nativescript/core';
    import { debounce } from '@nativescript/core/utils';
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
        StageEventData,
        StagesChangeEvent,
        StoryHandler,
        StoryStartEvent,
        StoryStopEvent,
        imagesMatrix,
        onlyInverseLuniiTypeImages
    } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
    import { colorTheme, isEInk } from '~/helpers/theme';
    import { Pack, Stage, Story } from '~/models/Pack';
    import { getBGServiceInstance } from '~/services/BgService';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { showError } from '@shared/utils/showError';
    import { closeModal } from '@shared/utils/svelte/ui';
    import { openLink, playStory, showAllPlayablePackStories, showBottomsheetOptionSelect } from '~/utils/ui';
    import { colors, coverSharedTransitionTag, fontScale, isLandscape, screenWidthDips, windowInset } from '~/variables';
    import { CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CARD_RATIO } from '~/utils/constants';
    import { alert } from '@nativescript-community/ui-material-dialogs';
    import { createView } from '@shared/utils/ui';
    import { Label } from '@nativescript-community/ui-label';

    const PAGER_PAGE_PADDING = 16;

    const textPaint = new Paint();
    interface Item {
        stage: Stage;
        image: string;
    }
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    let { colorOnSecondaryContainer, colorOnTertiaryContainer, colorOutline, colorOutlineVariant, colorPrimary, colorSecondaryContainer, colorSurfaceContainerHigh, colorTertiaryContainer } = $colors;
    $: ({ colorOnSecondaryContainer, colorOnTertiaryContainer, colorOutline, colorOutlineVariant, colorPrimary, colorSecondaryContainer, colorSurfaceContainerHigh, colorTertiaryContainer } = $colors);
    let page: NativeViewElementNode<Page>;
    let pager: NativeViewElementNode<Pager>;
    let storyCoverImage: NativeViewElementNode<Image>;
    let storyCanvas: NativeViewElementNode<CanvasView>;
    let colorMatrix = imagesMatrix;

    const statusBarStyle = new Color(colorOnSecondaryContainer).isDark() ? 'light' : 'dark';
    $: textPaint.textSize = 16 * $fontScale;
    let state: PlayingState = 'stopped';
    let items: Item[] = [];
    let selectedStageIndex = 0;
    let currentTime = 0;
    let currentStage: Stage;
    let currentImage: any;
    let showReplay = false;
    let progress = 0;
    let playingInfo: PlayingInfo = null;
    let pack: Pack = null;
    let packHasStories = false;
    let story: Story = null;
    let playerStateInterval;
    let hideOtherPageItems = false;
    // let controlSettings: ControlSettings;
    $: currentStage = items[selectedStageIndex]?.stage;
    $: hideOtherPageItems = !pack?.isMenuStage(currentStage) && items.length > 1;

    let pagerPeaking = 30;
    // $: pagerPeaking = $isLandscape ? 180 : 30;
    // $: DEV_LOG && console.log('isLandscape', $isLandscape);
    // $: storyHandler?.getStageImage(pack, currentStage).then((r) => (currentImage = r));
    // $: DEV_LOG && console.warn('currentImage', currentImage);
    // $: DEV_LOG && console.error('hideOtherPageItems', hideOtherPageItems);

    function getTimeFromProgress(progress: number) {
        return playingInfo ? (playingInfo.duration || 1) * progress : 0;
    }
    let storyHandler: StoryHandler;

    onMount(() => {});
    onDestroy(() => {
        stopPlayerInterval();
        storyHandler?.off(PlaybackEvent, onPlayerState);
        storyHandler?.off(PackStartEvent, onPackStart);
        storyHandler?.off(StagesChangeEvent, onStageChanged);
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
        handler.on(StagesChangeEvent, onStageChanged);
        handler.on(PackStartEvent, onPackStart);
        handler.on(PackStopEvent, onPackStop);
        handler.on(StoryStartEvent, onStoryStart);
        handler.on(StoryStopEvent, onStoryStop);

        pack = handler.playingPack;
        story = handler.playingStory;
        // DEV_LOG && console.log('onSetup', handler.selectedStageIndex, JSON.stringify(handler.currentStages), JSON.stringify(handler.currentPlayingInfo), !!pack, !!story);
        if (pack) {
            onPackStart({ pack });
            onStageChanged({
                eventName: StagesChangeEvent,
                stages: handler.currentStages,
                selectedStageIndex: handler.selectedStageIndex,
                currentStage: handler.currentStageSelected(),
                currentStatesChanged: true,
                playingInfo: handler.currentPlayingInfo
            });
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
        } else if (story) {
            onStoryStart({ story });
            onPlayerState({ eventName: PlaybackEvent, state: handler.playerState, playingInfo: handler.currentPlayingInfo });
        } else if (!closed) {
            close();
        }
    });

    onUnsetup((handler) => {
        DEV_LOG && console.log('onUnsetup', !!handler);
        storyHandler = null;
        handler?.off(PlaybackEvent, onPlayerState);
        handler?.off(StagesChangeEvent, onStageChanged);
        handler?.off(PackStartEvent, onPackStart);
        handler?.off(PackStopEvent, onPackStop);
        handler?.off(StoryStartEvent, onStoryStart);
        handler?.off(StoryStopEvent, onStoryStop);
    });

    function onPlayerProgressInterval() {
        if (story) {
            currentTime = (storyHandler?.playerCurrentTime || 0) + (playingInfo?.durations?.splice(0, storyHandler?.currentStoryAudioIndex).reduce((acc, d) => acc + d, 0) || 0);
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

    function packDescription(pack: Pack, story: Story) {
        DEV_LOG && console.log('packDescription', !!pack, !!story);
        const thePack = pack || story?.pack;
        return thePack?.description || thePack?.subtitle || ' ';
    }

    function onPackStart(event) {
        // state = 'play';
        pack = event.pack;
        packHasStories = pack.hasStories();
        progress = 0;
        currentTime = 0;
        showReplay = false;
        DEV_LOG && console.log('Fullscreen', 'onPackStart', packHasStories, JSON.stringify(playingInfo));
    }
    function onStoryStart(event) {
        // state = 'play';
        story = event.story;
        storyCanvas?.nativeView?.redraw();
        progress = 0;
        currentTime = 0;
        showReplay = false;
        // story.pack.getThumbnail().then((r) => (currentImage = r));
        currentImage = story.thumbnail;
        colorMatrix = null;
        DEV_LOG && console.log('Fullscreen', 'onStoryStart', !!story, currentImage, JSON.stringify(playingInfo));
    }

    let closed = false;
    function close() {
        if (closed) {
            return;
        }
        try {
            closed = true;
            closeModal();
        } catch (error) {
            showError(error);
        }
    }
    function onPackStop(event) {
        pack = null;
        currentImage = null;
        currentStage = null;
        items = [];
        selectedStageIndex = 0;
        showReplay = false;
        stopPlayerInterval();
        DEV_LOG && console.log('Fullscreen', 'onPackStop', !!event.closeFullscreenPlayer);
        if (!!event.closeFullscreenPlayer) {
            close();
        }
    }
    function onStoryStop(event) {
        DEV_LOG && console.log('Fullscreen', 'onStoryStop', event.closeFullscreenPlayer);
        currentImage = null;
        story = null;
        stopPlayerInterval();
        if (!!event.closeFullscreenPlayer) {
            close();
        }
    }
    function onPlayerState(event: PlaybackEventData) {
        playingInfo = event.playingInfo;
        // DEV_LOG && console.log('onPlayerState', JSON.stringify(playingInfo));
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
        } else if (state === 'paused') {
            onPlayerProgressInterval();
        }
    }
    async function getItem(stage: Stage) {
        return {
            stage,
            image: getImage(stage)
        };
    }
    function onStageChanged(event: StageEventData) {
        try {
            DEV_LOG && console.log('FullScreen', 'onStageChanged', selectedStageIndex, event.selectedStageIndex, event.currentStatesChanged, event.stages.length);
            if (event.currentStatesChanged) {
                // if (event.stages.length === 1) {
                //     currentImage = getImage(event.stages[0]);
                //     items = [];
                // } else {
                items = event.stages.map((stage) => {
                    const image = getImage(stage);
                    const inverseColors =
                        !onlyInverseLuniiTypeImages ||
                        (image !== pack.getThumbnail() &&
                            (pack.stageIsStory(stage)
                                ? pack.extra?.podcast !== true || stage['episode'] === undefined
                                : pack.extra?.podcast !== true || pack.nextStageFrom(stage)[0]?.['episode'] === undefined));
                    return {
                        stage,
                        imageMatrix: inverseColors ? imagesMatrix : null,
                        image
                    } as Item;
                });
                currentImage = null;
                // }
                // items = await Promise.all(
                //     event.stages.map(async (stage) => ({
                //         stage,
                //         image: await getImage(stage)
                //     }))
                // );
            } else {
                currentImage = event.playingInfo.cover;
                DEV_LOG && console.warn('currentImage', currentImage, event.playingInfo.inverseImageColors);
                colorMatrix = event.playingInfo.inverseImageColors ? imagesMatrix : null;
            }
            // we dont want stage change to be animated if event.currentStatesChanged
            if (selectedStageIndex !== event.selectedStageIndex) {
                if (pager?.nativeElement) {
                    pager.nativeElement.scrollToIndexAnimated(event.selectedStageIndex, !isEInk && !event.currentStatesChanged, !event.currentStatesChanged);
                } else {
                    selectedStageIndex = event.selectedStageIndex;
                }
            }
            playingInfo = event.playingInfo;
            // if (pager?.nativeElement) {
            //     pager.nativeElement.selectedIndex = event.selectedStageIndex;
            //     pager.nativeElement.scrollToIndexAnimated(event.selectedStageIndex, false);

            // }
            // DEV_LOG &&
            //     console.log(
            //         'FullScreen',
            //         'onStageChanged1',
            //         items[selectedStageIndex].image,
            //         items.map((i) => i.image)
            //     );

            // changing pager selectedIndex is animated by default
            showReplay = false;
            // storyHandler?.getCurrentStageImage().then((r) => (currentImage = r));
        } catch (error) {
            showError(error);
        }
    }

    const onSliderChange = debounce((e) => {
        const value = e.value;
        const actualProgress = Math.round(getTimeFromProgress(value / 100));
        if (Math.floor(value) === Math.floor(progress)) {
            return;
        }
        storyHandler?.setPlayerTimestamp(actualProgress);

        onPlayerProgressInterval();
    }, 50);

    function togglePlayState() {
        storyHandler?.handleAction('play');
    }
    async function onOkButton() {
        storyHandler?.handleAction('ok');
    }
    async function onOkButtonIfOption() {
        if (!pack?.canOk(currentStage) || items.length <= 1) {
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
            $coverSharedTransitionTag = `cover_${selectedStageIndex}`;
            storyHandler?.setSelectedStage(selectedStageIndex);
        }
    }
    function getImage(stage: Stage) {
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
            const data = await showAllPlayablePackStories(pack || story?.pack, true);
            if (data?.story) {
                const index = data.stories.findIndex((s) => s.id === data.story.id);
                storyHandler.playlist.splice(0, storyHandler.playlist.length, ...data.stories.slice(index).map((s) => ({ story: s })));
                playStory(data?.story as Story, false, false);
            }
        } catch (error) {
            showError(error);
        }
    }
    async function onLinkTap(e) {
        try {
            openLink(e.link);
        } catch (error) {
            showError(error);
        }
    }
    async function onDescriptionTap(e) {
        try {
            await alert({
                okButtonText: lc('ok'),
                view: createView(Label, {
                    padding: '10 20 0 20',
                    textWrap: true,
                    html: e.object.html
                }),
                iosForceClosePresentedViewController: true //ensure error popup is always showing
            });
        } catch (error) {
            showError(error);
        }
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

    function onSharedElement(event: EventData & { views?: View[] }) {
        try {
            event.views.push(page.nativeView?.getViewById('actionBarTitle'));
            let view: View;
            if (story) {
                view = storyCoverImage?.nativeView;
            } else {
            }
            view = pager?.nativeView?.getViewForItemAtIndex(selectedStageIndex)?.getViewById('cover');
            if (view) {
                event.views.push(view);
            }
        } catch (error) {
            console.error(error, error.stack);
        }
    }

    function onStoryDraw(event: { canvas: Canvas; object: CanvasView }) {
        if (story?.episode && story?.pack.extra?.episodeCount) {
            textPaint.color = colorOnTertiaryContainer;
            textPaint.fontWeight = 'bold';
            const canvas = event.canvas;
            const h = canvas.getHeight();
            const w = canvas.getWidth();
            const staticLayout = new StaticLayout(` ${story.episode}/${story?.pack.extra?.episodeCount} `, textPaint, w, LayoutAlignment.ALIGN_NORMAL, 1, 0, false);
            const width = staticLayout.getLineWidth(0);
            const height = staticLayout.getHeight();
            canvas.translate(24, h - height - 10);
            textPaint.setColor(colorTertiaryContainer);
            canvas.drawRoundRect(-4, -1, width + 4, height + 1, height / 2, height / 2, textPaint);
            textPaint.color = colorOnTertiaryContainer;
            staticLayout.draw(canvas);
        }
    }
    function onPagerHolderLayoutChanged({ object }: EventData<View>) {
        if ($isLandscape) {
            pagerPeaking = (object.getMeasuredWidth() - object.getMeasuredHeight() / CARD_RATIO) / 2;
        } else {
            pagerPeaking = 30;
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
    on:navigatedFrom={onNavigatedFrom}
    on:sharedElementTo={onSharedElement}
    on:sharedElementFrom={onSharedElement}>
    <gridlayout paddingBottom={$windowInset.bottom} paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,*,auto, auto, auto,auto">
        <flexlayout flexDirection="column" row={1}>
            <label
                color={colorOnSecondaryContainer}
                flexGrow={0}
                flexShrink={5}
                fontSize={16}
                html={packDescription(pack, story)}
                lineBreak="end"
                linkColor={colorPrimary}
                margin={10}
                maxLines={5}
                selectable={true}
                textAlignment="center"
                on:linkTap={onLinkTap}
                on:tap={onDescriptionTap} />
            <!-- <GridLayout row="2" verticalAlignment="center"> -->

            <gridlayout flexGrow={1} flexShrink={0} height={0.8 * screenWidthDips * 0.86} row={2} on:layoutChanged={onPagerHolderLayoutChanged}>
                <!-- {#if __IOS__ || pack} -->
                <pager
                    bind:this={pager}
                    disableAnimation={isEInk}
                    {items}
                    marginLeft={hideOtherPageItems ? pagerPeaking : 0}
                    marginRight={hideOtherPageItems ? pagerPeaking : 0}
                    orientation="horizontal"
                    peaking={hideOtherPageItems ? 0 : pagerPeaking}
                    preserveIndexOnItemsChange={true}
                    selectedIndex={selectedStageIndex}
                    visibility={!!pack ? 'visible' : 'collapse'}
                    on:selectedIndexChange={onPagerChanged}>
                    <Template let:index let:item>
                        <gridlayout padding={PAGER_PAGE_PADDING - 10} on:tap={onOkButtonIfOption}>
                            <!-- we need another gridlayout because elevation does not work on Image on iOS -->
                            <gridlayout class="einkBordered" borderRadius={20} horizontalAlignment="center" verticalAlignment="center">
                                <image id="cover" borderRadius={20} colorMatrix={item.imageMatrix} sharedTransitionTag={`cover_${index}`} src={item.image} />
                            </gridlayout>
                        </gridlayout>
                    </Template>
                </pager>
                <!-- {/if} -->
                <!-- we need another gridlayout because elevation does not work on Image on iOS -->
                <!-- {#if __IOS__ || story} -->
                <gridlayout marginLeft={pagerPeaking} marginRight={pagerPeaking} visibility={story ? 'visible' : 'collapse'} on:tap={onOkButtonIfOption}>
                    <canvasview
                        bind:this={storyCanvas}
                        class="einkBordered"
                        borderRadius={20}
                        horizontalAlignment="center"
                        margin={PAGER_PAGE_PADDING - 10}
                        verticalAlignment="center"
                        on:draw={onStoryDraw}>
                        <image bind:this={storyCoverImage} borderRadius={20} {colorMatrix} sharedTransitionTag={$coverSharedTransitionTag} src={currentImage} />
                        {#if story?.images?.length > 1}
                            <stacklayout
                                height={50}
                                horizontalAlignment="center"
                                marginBottom={5}
                                orientation="horizontal"
                                verticalAlignment="bottom"
                                visibility={story.images?.length ? 'visible' : 'hidden'}>
                                {#each story.images as image}
                                    <gridlayout borderColor={colorOutline} borderRadius={10} borderWidth={1} horizontalAlignment="center" margin={3} verticalAlignment="center">
                                        <image borderRadius={10} {colorMatrix} opacity={0.6} src={story.pack.getImage(image)} />
                                    </gridlayout>
                                {/each}
                            </stacklayout>
                        {/if}
                    </canvasview>
                </gridlayout>
                <!-- {/if} -->
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
            </gridlayout>
        </flexlayout>

        <!-- </GridLayout> -->
        <label
            autoFontSize={true}
            color={colorOnSecondaryContainer}
            fontSize={20}
            fontWeight="bold"
            height={50}
            margin="0 10 0 10"
            maxFontSize={20}
            maxLines={2}
            row={2}
            text={(pack ? getStageName(currentStage) : story?.names?.filter((s) => !!s).join(' / ')) || story?.name || ' '}
            textAlignment="center" />

        <slider margin="0 10 0 10" maxValue=" 100" minValue={0} row={3} trackBackgroundColor={colorSurfaceContainerHigh} value={progress} verticalAlignment="bottom" on:valueChange={onSliderChange} />
        <canvaslabel color={colorOnSecondaryContainer} fontSize={14} height={18} margin="0 20 0 20" row={4}>
            <cspan text={formatDuration(currentTime, 'mm:ss')} verticalAlignment="bottom" />
            <cspan paddingRight={2} text={playingInfo && formatDuration(playingInfo.duration, 'mm:ss')} textAlignment="right" verticalAlignment="bottom" />
        </canvaslabel>
        <stacklayout horizontalAlignment="center" orientation="horizontal" row={5}>
            <mdbutton
                class="playerButton"
                horizontalAlignment="right"
                text={!!pack ? 'mdi-home' : 'mdi-skip-previous'}
                verticalAlignment="center"
                visibility={playingInfo?.canHome ? 'visible' : 'hidden'}
                on:tap={onHomeButton} />
            <mdbutton
                class="playerButton"
                horizontalAlignment="right"
                text={state === 'playing' ? 'mdi-pause' : pack && showReplay ? 'mdi-replay' : 'mdi-play'}
                verticalAlignment="center"
                on:tap={togglePlayState} />
            <mdbutton
                id="ok"
                class="playerButton"
                horizontalAlignment="right"
                text={!!pack ? 'mdi-check' : 'mdi-skip-next'}
                verticalAlignment="center"
                visibility={(story && playingInfo?.canNext) || (pack && playingInfo?.canOk) ? 'visible' : 'hidden'}
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
            titleProps={{ id: 'actionBarTitle', autoFontSize: true, sharedTransitionTag: 'title' }}>
            <mdbutton class="actionBarButton" defaultVisualState="secondary" text="mdi-playlist-music-outline" variant="text" on:tap={showPlaylist} />
            <mdbutton
                class="actionBarButton"
                defaultVisualState="secondary"
                text="mdi-folder-music-outline"
                variant="text"
                visibility={packHasStories ? 'visible' : 'collapse'}
                on:tap={showAllPlayableStories} />
        </CActionBar>
    </gridlayout>
</page>
