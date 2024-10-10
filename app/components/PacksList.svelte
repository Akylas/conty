<script context="module" lang="ts">
    import SqlQuery from '@akylas/kiss-orm/dist/Queries/SqlQuery';
    import { Canvas, CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { openFilePicker } from '@nativescript-community/ui-document-picker';
    import { Img } from '@nativescript-community/ui-image';
    import { createNativeAttributedString } from '@nativescript-community/ui-label';
    import { confirm } from '@nativescript-community/ui-material-dialogs';
    import { VerticalPosition } from '@nativescript-community/ui-popover';
    import { AnimationDefinition, Application, ApplicationSettings, EventData, NavigatedData, ObservableArray, Page, Screen, StackLayout, Utils } from '@nativescript/core';
    import { AndroidActivityBackPressedEventData } from '@nativescript/core/application/application-interfaces';
    import { SDK_VERSION, throttle } from '@nativescript/core/utils';
    import { filesize } from 'filesize';
    import { onDestroy, onMount } from 'svelte';
    import { Template } from 'svelte-native/components';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import { l, lc } from '~/helpers/locale';
    import { colorTheme, onThemeChanged } from '~/helpers/theme';
    import { Pack, RemoteContent, Story } from '~/models/Pack';
    import { downloadStories } from '~/services/api';
    import { PackAddedEventData, PackDeletedEventData, PackUpdatedEventData, documentsService } from '~/services/documents';
    import { BOTTOM_BUTTON_OFFSET, EVENT_PACK_ADDED, EVENT_PACK_DELETED, EVENT_PACK_UPDATED } from '~/utils/constants';
    import { showError } from '~/utils/showError';
    import { fade, showModal } from '~/utils/svelte/ui';
    import { hideBarPlayer, hideLoading, onBackButton, playPack, playStory, showBarPlayer, showBottomsheetOptionSelect, showLoading, showPopoverMenu, showSettings } from '~/utils/ui';
    import { colors, fontScale, fonts, onPodcastModeChanged, podcastMode, windowInset } from '~/variables';

    const textPaint = new Paint();
    const iconPaint = new Paint();
    iconPaint.color = '#ffffffcc';
    const IMAGE_DECODE_WIDTH = Utils.layout.toDevicePixels(200);
    type ViewStyle = 'expanded' | 'condensed' | 'card';
</script>

<script lang="ts">
    import { request } from '@nativescript-community/perms';
    import { PackStartEvent, PackStopEvent, StoryStartEvent, StoryStopEvent } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
    import { getBGServiceInstance } from '~/services/BgService';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { importService } from '~/services/importservice';
    import ActionBarSearch from './common/ActionBarSearch.svelte';
    import IconButton from './common/IconButton.svelte';
    import { transcode } from 'buffer';
    import { getRealPath, requestManagePermission } from '~/utils';

    // technique for only specific properties to get updated on store change
    const { mdi } = $fonts;
    let {
        colorOutlineVariant,
        colorBackground,
        colorTertiaryContainer,
        colorOnTertiaryContainer,
        colorSurfaceContainerHigh,
        colorOnBackground,
        colorOnSurfaceVariant,
        colorSurface,
        colorPrimaryContainer,
        colorError
    } = $colors;
    $: ({
        colorOutlineVariant,
        colorBackground,
        colorTertiaryContainer,
        colorOnTertiaryContainer,
        colorSurfaceContainerHigh,
        colorOnBackground,
        colorOnSurfaceVariant,
        colorSurface,
        colorPrimaryContainer,
        colorError
    } = $colors);
    iconPaint.fontFamily = mdi;
    const screenWidth = Screen.mainScreen.widthDIPs;

    interface Item {
        pack: Pack;
        selected: boolean;
    }
    let packs: ObservableArray<Item> = null;
    let nbPacks: number = 0;
    let showNoPack = false;
    let page: NativeViewElementNode<Page>;
    let collectionView: NativeViewElementNode<CollectionView>;
    let fabHolder: NativeViewElementNode<StackLayout>;
    let search: ActionBarSearch;

    let stepIndex = 1;

    let showSearch = false;
    let lastRefreshFilter = null;

    let loading = false;

    let colWidth = null;
    let viewStyle: ViewStyle = ApplicationSettings.getString('packs_list_view_style', 'expanded') as ViewStyle;

    $: if (nbSelected > 0) search.unfocusSearch();
    $: condensed = viewStyle === 'condensed';
    $: colWidth = viewStyle === 'card' ? '50%' : '100%';

    async function refresh(force = true, filter?: string) {
        if (loading || (!force && lastRefreshFilter === filter)) {
            return;
        }
        lastRefreshFilter = filter;
        loading = true;
        try {
            DEV_LOG && console.log('refresh', filter);
            const whereQuery = filter ? `title LIKE '%${filter}%' or description LIKE '%${filter}%' or keywords LIKE '%${filter}%'` : undefined;
            const r = await documentsService.packRepository.search({
                orderBy: SqlQuery.createFromTemplateString`importedDate DESC`,
                // , postfix: SqlQuery.createFromTemplateString`LIMIT 50`
                ...(filter
                    ? {
                          where: new SqlQuery([whereQuery])
                      }
                    : {})
            });
            // DEV_LOG &&
            //     console.log(
            //         'r',
            //         r.map((p) => p.colors)
            //     );
            DEV_LOG && console.log('refresh done', filter, r.length);
            packs = new ObservableArray(
                r.map((pack) => ({
                    pack,
                    selected: false
                }))
            );
            updateNoPack();

            // if (packs.length) {
            // await playPack(packs.getItem(0).pack);
            // }

            // if (DEV_LOG) {
            //     const component = (await import('~/components/PDFPreview.svelte')).default;
            //     await showModal({
            //         page: component,
            //         animated: true,
            //         fullscreen: true,
            //         props: {
            //             packs: [packs.getItem(0).doc]
            //         }
            //     });
            // }
            // await Promise.all(r.map((d) => d.pages[0]?.imagePath));
        } catch (error) {
            showError(error);
        } finally {
            loading = false;
        }
    }
    const refreshSimple = () => refresh();

    function updateNoPack() {
        nbPacks = packs?.length ?? 0;
        showNoPack = nbPacks === 0;
    }
    function onPackAdded(event: PackAddedEventData) {
        DEV_LOG && console.log('onPackAdded', nbPacks, JSON.stringify(event.pack));
        packs?.unshift({
            pack: event.pack,
            selected: false
        } as Item);
        updateNoPack();
        collectionView?.nativeElement.scrollToIndex(0, false);
    }
    function onPackUpdated(event: PackUpdatedEventData) {
        let index = -1;
        packs?.some((d, i) => {
            if (d.pack.id === event.pack.id) {
                index = i;
                return true;
            }
        });
        DEV_LOG && console.log('onPackUpdated', event.pack.id, index);
        if (index >= 0) {
            const item = packs?.getItem(index);
            if (item) {
                item.pack = event.pack;
                packs.setItem(index, item);
            }
        }
    }
    function onPacksDeleted(event: PackDeletedEventData) {
        for (let i = 0; i < event.packIds.length; i++) {
            const id = event.packIds[i];
            const index = packs.findIndex((item) => item.pack.id === id);
            if (index !== -1) {
                packs.splice(index, 1);
                nbSelected -= 1;
            }
        }
        updateNoPack();
    }
    function getImageView(index: number) {
        const view = collectionView?.nativeView?.getViewForItemAtIndex(index);
        return view?.getViewById<Img>('imageView');
    }

    function onPackPageUpdated(event: EventData & { pageIndex: number; imageUpdated: boolean }) {
        // let index = -1;
        const pack = event.object as Pack;
        const index = packs.findIndex((d) => d.pack.id === pack.id);
        if (index >= 0) {
            const item = packs?.getItem(index);
            if (item) {
                item.pack = pack;
                packs.setItem(index, item);
            }
        }
    }

    let bottomOffset = 0;
    function onBottomOffsetAnimation({ animationArgs, offset }: EventData & { animationArgs: AnimationDefinition[]; offset }) {
        // DEV_LOG && console.log('onBottomOffsetAnimation', !!fabHolder, offset);
        bottomOffset = offset;
        if (fabHolder) {
            animationArgs.push({
                target: fabHolder.nativeView,
                translate: { y: -offset, x: 0 },
                duration: animationArgs[0].duration
            });
        }
    }

    onMount(async () => {
        DEV_LOG && console.log('PackList', 'onMount');
        Application.on('bottomOffsetAnimation', onBottomOffsetAnimation);
        if (__ANDROID__) {
            Application.android.on(Application.android.activityBackPressedEvent, onAndroidBackButton);
            // Application.android.on(Application.android.activityNewIntentEvent, onAndroidNewItent);
            // const intent = Application.android['startIntent'];
            // if (intent) {
            //     onAndroidNewItent({ intent } as any);
            // }
        }
        documentsService.on(EVENT_PACK_ADDED, onPackAdded);
        documentsService.on(EVENT_PACK_UPDATED, onPackUpdated);
        documentsService.on(EVENT_PACK_DELETED, onPacksDeleted);

        const permResult = await request('notification');
        DEV_LOG && console.log('permResult', permResult);
    });
    onDestroy(() => {
        DEV_LOG && console.log('PackList', 'onDestroy');
        Application.off('bottomOffsetAnimation', onBottomOffsetAnimation);
        if (__ANDROID__) {
            Application.android.off(Application.android.activityBackPressedEvent, onAndroidBackButton);
            // Application.android.off(Application.android.activityNewIntentEvent, onAndroidNewItent);
        }
        documentsService.off(EVENT_PACK_UPDATED, onPackUpdated);
        documentsService.off(EVENT_PACK_ADDED, onPackAdded);
        documentsService.off(EVENT_PACK_DELETED, onPacksDeleted);
    });

    async function importPack(importPDFs = true) {
        DEV_LOG && console.log('importPack', importPDFs);
        try {
            const pickerResult = await openFilePicker({
                extensions: ['zip'],
                multipleSelection: true,
                pickerMode: 0,
                forceSAF: true
            });
            const files = pickerResult?.files;
            if (files?.length) {
                const confirmed = await confirm({
                    title: lc('import_files'),
                    message: lc('confirm_copy_file_import'),
                    okButtonText: lc('ok'),
                    cancelButtonText: lc('cancel')
                });
                if (confirmed) {
                    showLoading('loading');
                    DEV_LOG && console.log('importContentFromFiles', files);
                    await importService.importContentFromFiles(files.map((f) => getRealPath(f)));
                }
            }
        } catch (error) {
            showError(error);
        } finally {
            hideLoading();
        }
    }
    async function downloadPack() {
        DEV_LOG && console.log('downloadPack');
        try {
            const component = (await import('~/components/RemoteList.svelte')).default;
            const toDownload: RemoteContent = await showModal({
                page: component,
                fullscreen: true
            });
            DEV_LOG && console.log('toDownload', toDownload);
            if (toDownload) {
                await downloadStories(toDownload);
            }
        } catch (error) {
            showError(error);
        }
    }

    async function onNavigatedTo(e: NavigatedData) {
        try {
            if (!e.isBackNavigation) {
                const showFirstPresentation = ApplicationSettings.getBoolean('showFirstPresentation', true);
                if (showFirstPresentation) {
                    const result = await confirm({
                        title: lc('welcome'),
                        message: lc('first_presentation'),
                        okButtonText: lc('add_source'),
                        cancelButtonText: lc('cancel')
                    });
                    if (result) {
                        // ApplicationSettings.remove(SETTINGS_REMOTE_SOURCES);
                        await showSettings({
                            subSettingsOptions: 'remote_sources'
                        });
                    }
                    ApplicationSettings.setBoolean('showFirstPresentation', false);
                }

                if (!(await requestManagePermission())) {
                    throw new Error(lc('missing_manage_permission'));
                }
                await request('storage');

                if (documentsService.started) {
                    refresh();
                } else {
                    documentsService.once('started', refreshSimple);
                }
            }
        } catch (error) {
            showError(error);
        }
    }
    let nbSelected = 0;
    function selectItem(item: Item) {
        if (!item.selected) {
            packs.some((d, index) => {
                if (d === item) {
                    nbSelected++;
                    d.selected = true;
                    packs.setItem(index, d);
                    return true;
                }
            });
        }
    }
    function unselectItem(item: Item) {
        if (item.selected) {
            packs.some((d, index) => {
                if (d === item) {
                    nbSelected--;
                    d.selected = false;
                    packs.setItem(index, d);
                    return true;
                }
            });
        }
    }
    function unselectAll() {
        if (packs) {
            nbSelected = 0;
            packs.splice(0, packs.length, ...packs.map((i) => ({ pack: i.pack, selected: false })));
        }
        // packs?.forEach((d, index) => {
        //         d.selected = false;
        //         packs.setItem(index, d);
        //     });
        // refresh();
    }
    let ignoreTap = false;
    function onItemLongPress(item: Item, event?) {
        // if (event && event.ios && event.ios.state !== 1) {
        //     return;
        // }
        // if (event && event.ios) {
        //     ignoreTap = true;
        // }
        // console.log('onItemLongPress', item, Object.keys(event));
        if (item.selected) {
            unselectItem(item);
        } else {
            selectItem(item);
        }
    }
    async function onItemTap(item: Item) {
        try {
            if (ignoreTap) {
                ignoreTap = false;
                return;
            }
            // console.log('onItemTap', event && event.ios && event.ios.state, selectedSessions.length);
            if (nbSelected > 0) {
                onItemLongPress(item);
            } else {
                if ($podcastMode && item.pack.extra.podcast === true) {
                    await showAllPodcastStories(item);
                } else {
                    await playPack(item.pack);
                }
            }
        } catch (error) {
            showError(error);
        }
    }
    const onAndroidBackButton = (data: AndroidActivityBackPressedEventData) =>
        onBackButton(page?.nativeView, () => {
            if (nbSelected > 0) {
                data.cancel = true;
                unselectAll();
            }
        });

    function getSelectedPacks() {
        const selected: Pack[] = [];
        packs.forEach((d, index) => {
            if (d.selected) {
                selected.push(d.pack);
            }
        });
        return selected;
    }

    async function deleteSelectedPacks() {
        if (nbSelected > 0) {
            try {
                const result = await confirm({
                    title: lc('delete'),
                    message: lc('confirm_delete_packs', nbSelected),
                    okButtonText: lc('delete'),
                    cancelButtonText: lc('cancel')
                });
                if (result) {
                    const storyHandler = getBGServiceInstance().storyHandler;
                    const currentPack = storyHandler?.getPlayingPack();
                    const selectedPacks = getSelectedPacks();
                    if (currentPack && selectedPacks.findIndex((d) => d.id === currentPack.id)) {
                        storyHandler?.stopPlaying();
                    }
                    await importService.deletePacks(selectedPacks.map((s) => s.id));
                }
            } catch (error) {
                showError(error);
            }
        }
    }
    async function selectViewStyle(event) {
        try {
            // const options = Object.keys(OPTIONS[option]).map((k) => ({ ...OPTIONS[option][k], id: k }));
            await showPopoverMenu({
                options: [
                    { id: 'default', name: lc('expanded') },
                    { id: 'condensed', name: lc('condensed') },
                    { id: 'card', name: lc('card') }
                ] as { id: ViewStyle; name: string }[],
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                onClose: (item) => {
                    viewStyle = item.id;
                    ApplicationSettings.setString('packs_list_view_style', viewStyle);
                }
            });
        } catch (error) {
            showError(error);
        }
    }

    function refreshCollectionView() {
        collectionView?.nativeView?.refresh();
    }
    onThemeChanged(refreshCollectionView);
    onPodcastModeChanged(refreshCollectionView);

    // let lottieLightColor = new Color(colorPrimaryContainer);
    // const
    // let lottieDarkFColor;
    // let lottieLightColor;
    // $: {
    //     if (colorPrimaryContainer) {
    //         lottieDarkFColor = new Color(colorPrimaryContainer);
    //         const realTheme = getRealTheme();
    //         if (realTheme === 'light') {
    //             lottieLightColor = new Color(colorPrimaryContainer).darken(10);
    //         } else {
    //             lottieLightColor = new Color(colorPrimaryContainer).lighten(10);
    //         }
    //     }
    // }
    function getItemImageWidth(viewStyle) {
        switch (viewStyle) {
            case 'condensed':
                return 54 * $fontScale;
            case 'card':
                return null;
            default:
                return 94 * $fontScale;
        }
    }
    function getItemRowHeight(viewStyle) {
        switch (viewStyle) {
            case 'condensed':
                return 100;
            case 'card':
                return screenWidth / 2;
            default:
                return 150;
        }
    }
    function getImageMargin(viewStyle) {
        switch (viewStyle) {
            case 'card':
                return 0;
            default:
                return 10;
        }
    }
    function getImageHorizontalAlignment(viewStyle) {
        switch (viewStyle) {
            case 'card':
                return 'stretch';
            default:
                return 'left';
        }
    }

    function getItemTitle(item: Item, viewStyle) {
        switch (viewStyle) {
            case 'card':
                return item.pack.title;
            default:
                return null;
        }
    }

    $: textPaint.color = colorOnBackground || 'black';
    $: textPaint.textSize = (condensed ? 11 : 14) * $fontScale;

    function onCanvasDraw(item: Item, { canvas, object }: { canvas: Canvas; object: CanvasView }) {
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        const dx = 10 + getItemImageWidth(viewStyle) + 10;

        // iconPaint.textSize = h / 2;

        if (viewStyle === 'card') {
            // canvas.drawText('mdi-play-outline', w / 4, (6 * h) / 9, iconPaint);
            return;
        }
        // canvas.drawText('mdi-play-outline', (1 * dx) / 4, (6 * h) / 9, iconPaint);

        textPaint.color = colorOnSurfaceVariant;

        const topText = createNativeAttributedString({
            spans: [
                {
                    fontSize: 16 * $fontScale,
                    fontWeight: 'bold',
                    lineBreak: 'end',
                    color: colorOnBackground,
                    lineHeight: 18 * $fontScale,
                    text: item.pack.title
                }
            ].concat(
                item.pack.description
                    ? [
                          {
                              fontSize: 14 * $fontScale,
                              lineHeight: (condensed ? 14 : 20) * $fontScale,
                              text: '\n' + item.pack.description
                          }
                      ]
                    : ([] as any)
            )
        });
        canvas.save();
        let staticLayout = new StaticLayout(topText, textPaint, w - dx - 10, LayoutAlignment.ALIGN_NORMAL, 1, 0, true, 'end', w - dx - 10, h - 20 - 20);
        canvas.translate(dx, (condensed ? 0 : 0) + 10);
        staticLayout.draw(canvas);
        canvas.restore();
        // textPaint.textSize = 14 * $fontScale;

        if (item.pack.size && !isNaN(item.pack.size)) {
            canvas.drawText(filesize(item.pack.size, { output: 'string', round: 0 }), dx, h - 13, textPaint);
        }
        if (item.pack.age) {
            textPaint.color = colorOnTertiaryContainer;
            staticLayout = new StaticLayout(' ' + item.pack.age + '+ ', textPaint, w - dx, LayoutAlignment.ALIGN_NORMAL, 1, 0, false);
            const width = staticLayout.getLineWidth(0);
            const height = staticLayout.getHeight();
            canvas.translate(dx + 60, h - height - 10);
            textPaint.setColor(colorTertiaryContainer);
            canvas.drawRoundRect(-4, -1, width + 4, height + 1, height / 2, height / 2, textPaint);
            textPaint.color = colorOnTertiaryContainer;
            staticLayout.draw(canvas);
        }
        if (item.pack.extra?.episodeCount) {
            textPaint.color = colorOnTertiaryContainer;
            staticLayout = new StaticLayout(' ' + lc('episodes', item.pack.extra?.episodeCount) + ' ', textPaint, w - dx, LayoutAlignment.ALIGN_NORMAL, 1, 0, false);
            const width = staticLayout.getLineWidth(0);
            const height = staticLayout.getHeight();
            canvas.translate(dx + 60, h - height - 10);
            textPaint.setColor(colorTertiaryContainer);
            canvas.drawRoundRect(-4, -1, width + 4, height + 1, height / 2, height / 2, textPaint);
            textPaint.color = colorOnTertiaryContainer;
            staticLayout.draw(canvas);
        }
    }

    async function showSelectedOptions(event) {
        const options = new ObservableArray([{ id: 'delete', name: lc('delete'), icon: 'mdi-delete', color: colorError }] as any);
        return showPopoverMenu({
            options,
            anchor: event.object,
            vertPos: VerticalPosition.BELOW,

            onClose: async (item) => {
                switch (item.id) {
                    case 'delete':
                        deleteSelectedPacks();
                        break;
                }
            }
        });
    }

    function showPlayer() {
        showBarPlayer();
        stepIndex = 2;
    }
    function hidePlayer() {
        hideBarPlayer();
        DEV_LOG && console.log('hidePlayer', stepIndex);
        stepIndex = 1;
    }

    onSetup((storyHandler) => {
        DEV_LOG && console.info('home onSetup', stepIndex, storyHandler.isPlaying, !!storyHandler.playingPack);
        storyHandler.on(StoryStartEvent, showPlayer);
        storyHandler.on(PackStartEvent, showPlayer);
        storyHandler.on(PackStopEvent, hidePlayer);
        storyHandler.on(StoryStopEvent, hidePlayer);

        if (storyHandler.pack) {
            showPlayer();
        } else {
            hidePlayer();
        }
    });

    onUnsetup((storyHandler) => {
        DEV_LOG && console.info('home onUnsetup', stepIndex, !!storyHandler);
        storyHandler.off(StoryStartEvent, showPlayer);
        storyHandler.off(PackStartEvent, showPlayer);
        storyHandler.off(PackStopEvent, hidePlayer);
        storyHandler.off(StoryStopEvent, hidePlayer);
    });

    async function showAllPodcastStories(item: Item) {
        try {
            const thePack = item.pack;
            const storyHandler = getBGServiceInstance().storyHandler;
            const stories = await storyHandler.findAllStories(thePack, true);
            const rowHeight = 80;
            const showFilter = stories.length > 6;
            const data: any = await showBottomsheetOptionSelect({
                height: Math.min(stories.length * rowHeight + (showFilter ? 110 : 40), Screen.mainScreen.heightDIPs * 0.7),
                rowHeight,
                fontSize: 18,
                showFilter,
                title: thePack.title,
                options: stories.map((story) => ({
                    type: 'image',
                    image: story.thumbnail,
                    name: story.name,
                    subtitle: formatDuration(story.duration),
                    story
                }))
            });
            if (data?.story) {
                const index = stories.findIndex((s) => s.id === data.story.id);
                storyHandler.playlist.splice(0, storyHandler.playlist.length, ...stories.slice(index).map((s) => ({ story: s })));
                playStory(data?.story as Story, true, false);
            }
        } catch (error) {
            showError(error);
        }
    }
</script>

<page bind:this={page} id="packList" actionBarHidden={true} on:navigatedTo={onNavigatedTo} on:navigatingFrom={() => search.unfocusSearch()}>
    <gridlayout paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,*,auto">
        <!-- {/if} -->
        <!-- <bottomsheet gestureEnabled={false} row={1} {stepIndex} steps={[0, 90, 90 + BAR_AUDIO_PLAYER_HEIGHT]}> -->
        <collectionView
            bind:this={collectionView}
            {colWidth}
            height="100%"
            iosOverflowSafeArea={true}
            items={packs}
            paddingBottom={Math.max($windowInset.bottom, BOTTOM_BUTTON_OFFSET) + bottomOffset}
            row={1}
            rowHeight={getItemRowHeight(viewStyle) * $fontScale}
            width="100%">
            <Template let:item>
                <canvasview
                    class="card"
                    borderWidth={viewStyle === 'card' || colorTheme === 'eink' ? 1 : 0}
                    fontSize={14 * $fontScale}
                    on:tap={() => onItemTap(item)}
                    on:longPress={(e) => onItemLongPress(item, e)}
                    on:draw={(e) => onCanvasDraw(item, e)}>
                    <image
                        backgroundColor={item.pack.extra?.colors?.[0]}
                        borderRadius={12}
                        decodeWidth={IMAGE_DECODE_WIDTH}
                        failureImageUri="res://icon_not_found"
                        horizontalAlignment={getImageHorizontalAlignment(viewStyle)}
                        margin={getImageMargin(viewStyle)}
                        rippleColor={colorSurface}
                        src={item.pack.getThumbnail()}
                        stretch="aspectFit"
                        width={getItemImageWidth(viewStyle)} />
                    <label class="cardLabel" row={1} text={getItemTitle(item, viewStyle)} verticalAlignment="bottom" visibility={viewStyle === 'card' ? 'visible' : 'hidden'} />
                    <SelectedIndicator horizontalAlignment="left" margin={10} selected={item.selected} />
                    <IconButton
                        horizontalAlignment="right"
                        size={40}
                        text="mdi-podcast"
                        verticalAlignment="bottom"
                        visibility={item.pack.extra?.podcast ? 'visible' : 'hidden'}
                        on:tap={() => showAllPodcastStories(item)} />
                </canvasview>
            </Template>
        </collectionView>
        <mdprogress backgroundColor="transparent" busy={true} indeterminate={true} row={1} verticalAlignment="top" visibility={loading ? 'visible' : 'hidden'} />

        <!-- <gridlayout prop:bottomSheet rows={`90,${BAR_AUDIO_PLAYER_HEIGHT}`} width="100%"> -->
        <stacklayout bind:this={fabHolder} horizontalAlignment="right" marginBottom={Math.min(60, $windowInset.bottom)} orientation="horizontal" row={1} verticalAlignment="bottom">
            <mdbutton class="small-fab" horizontalAlignment="center" text="mdi-file-document-plus-outline" verticalAlignment="center" on:tap={throttle(() => importPack(), 500)} />
            <mdbutton class="fab" horizontalAlignment="center" text="mdi-cloud-download-outline" verticalAlignment="center" on:tap={throttle(() => downloadPack(), 500)} />
        </stacklayout>
        <!-- <BarAudioPlayerWidget padding={2} row={1} /> -->
        <!-- </gridlayout> -->
        <!-- </bottomsheet> -->

        {#if showNoPack}
            <flexlayout
                flexDirection="column"
                horizontalAlignment="center"
                marginBottom="10%"
                paddingLeft={16}
                paddingRight={16}
                row={1}
                rowSpan={2}
                verticalAlignment="center"
                width="80%"
                transition:fade={{ duration: 200 }}>
                <nimage flexShrink={2} src="res://icon_star" />
                <label color={colorOnSurfaceVariant} flexShrink={0} fontSize={19} text={lc('no_pack_yet')} textAlignment="center" textWrap={true} />
            </flexlayout>
        {/if}

        <CActionBar title={l('packs')}>
            <mdbutton class="actionBarButton" text="mdi-magnify" variant="text" on:tap={() => search.showSearchTF()} />
            <mdbutton class="actionBarButton" text="mdi-view-dashboard" variant="text" on:tap={selectViewStyle} />
            <mdbutton class="actionBarButton" accessibilityValue="settingsBtn" text="mdi-cogs" variant="text" on:tap={() => showSettings()} />
            <ActionBarSearch bind:this={search} slot="center" {refresh} bind:visible={showSearch} />
        </CActionBar>
        <!-- {#if nbSelected > 0} -->
        {#if nbSelected > 0}
            <CActionBar forceCanGoBack={true} onGoBack={unselectAll} title={l('selected', nbSelected)} titleProps={{ maxLines: 1, autoFontSize: true }}>
                <!-- <mdbutton class="actionBarButton" text="mdi-share-variant" variant="text" visibility={nbSelected ? 'visible' : 'collapse'} on:tap={showImageExportPopover} /> -->
                <mdbutton class="actionBarButton" text="mdi-dots-vertical" variant="text" on:tap={showSelectedOptions} />
            </CActionBar>
        {/if}
        {#if __IOS__}
            <absolutelayout backgroundColor={colorBackground} height={$windowInset.bottom} row={1} verticalAlignment="bottom" />
        {/if}
        <absolutelayout row={2} />
    </gridlayout>
</page>
