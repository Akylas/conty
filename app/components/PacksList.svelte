<script context="module" lang="ts">
    import SqlQuery from '@akylas/kiss-orm/dist/Queries/SqlQuery';
    import { Canvas, CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { Img, getImagePipeline } from '@nativescript-community/ui-image';
    import { createNativeAttributedString } from '@nativescript-community/ui-label';
    import { confirm } from '@nativescript-community/ui-material-dialogs';
    import { VerticalPosition } from '@nativescript-community/ui-popover';
    import { AnimationDefinition, Application, ApplicationSettings, Color, EventData, NavigatedData, ObservableArray, Page, StackLayout, Utils } from '@nativescript/core';
    import { AndroidActivityBackPressedEventData } from '@nativescript/core/application/application-interfaces';
    import { throttle } from '@nativescript/core/utils';
    import dayjs from 'dayjs';
    import { filesize } from 'filesize';
    import { onDestroy, onMount } from 'svelte';
    import { Template } from 'svelte-native/components';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import { l, lc } from '~/helpers/locale';
    import { getRealTheme, onThemeChanged } from '~/helpers/theme';
    import { Pack, RemoteContent } from '~/models/Pack';
    import { downloadStories } from '~/services/api';
    import { PackAddedEventData, PackDeletedEventData, PackUpdatedEventData, documentsService } from '~/services/documents';
    import { EVENT_PACK_ADDED, EVENT_PACK_DELETED, EVENT_PACK_UPDATED, SETTINGS_REMOTE_SOURCES } from '~/utils/constants';
    import { showError } from '~/utils/showError';
    import { fade, navigate, showModal } from '~/utils/svelte/ui';
    import { onBackButton, playPack, showPopoverMenu, showSettings } from '~/utils/ui';
    import { colors, fontScale, windowInset } from '~/variables';

    const textPaint = new Paint();
    const IMAGE_DECODE_WIDTH = Utils.layout.toDevicePixels(200);
</script>

<script lang="ts">
    import BarAudioPlayerWidget from './BarAudioPlayerWidget.svelte';
    import { onSetup, onUnsetup } from '~/services/BgService.common';
    import { PackStartEvent, PackStopEvent, PlaybackEvent } from '~/handlers/StoryHandler';
    import { getBGServiceInstance } from '~/services/BgService.android';
    import { request } from '@nativescript-community/perms';

    // technique for only specific properties to get updated on store change
    let { colorPrimaryContainer, colorTertiaryContainer, colorOnTertiaryContainer, colorOnBackground } = $colors;
    $: ({
        colorTertiaryContainer,
        colorOnTertiaryContainer,
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

    let stepIndex = 1;

    let viewStyle: string = ApplicationSettings.getString('packs_list_view_style', 'expanded');
    $: condensed = viewStyle === 'condensed';
    // let items: ObservableArray<{
    //     doc: Pack; selected: boolean
    // }> = null;

    async function refresh() {
        try {
            const r = await documentsService.packRepository.search({
                orderBy: SqlQuery.createFromTemplateString`id DESC`
                // , postfix: SqlQuery.createFromTemplateString`LIMIT 50`
            });
            DEV_LOG && console.log(JSON.stringify(r));
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
        }
    }

    function updateNoPack() {
        nbPacks = packs?.length ?? 0;
        showNoPack = nbPacks === 0;
    }
    function onPackAdded(event: PackAddedEventData) {
        DEV_LOG && console.log('onPackAdded', nbPacks);
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
        for (let index = packs.length - 1; index >= 0; index--) {
            if (event.packs.indexOf(packs.getItem(index).pack) !== -1) {
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

    function onSnackMessageAnimation({ animationArgs }: EventData & { animationArgs: AnimationDefinition[] }) {
        if (fabHolder) {
            const snackAnimation = animationArgs[0];
            animationArgs.push({
                target: fabHolder.nativeView,
                translate: { x: 0, y: snackAnimation.translate.y === 0 ? -70 : 0 },
                duration: snackAnimation.duration
            });
        }
    }

    onMount(async () => {
        DEV_LOG && console.log('PackList', 'onMount');
        Application.on('snackMessageAnimation', onSnackMessageAnimation);
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
        // refresh();

        const permResult = await request('notification');
        DEV_LOG && console.log('permResult', permResult);
    });
    onDestroy(() => {
        DEV_LOG && console.log('PackList', 'onDestroy');
        Application.off('snackMessageAnimation', onSnackMessageAnimation);
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
            // await importAndScanImage(null, importPDFs);
        } catch (error) {
            showError(error);
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
                if (documentsService.started) {
                    refresh();
                } else {
                    documentsService.once('started', refresh);
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
                await playPack(item.pack);
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
        const selected = [];
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
                    await documentsService.deletePacks(getSelectedPacks());
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
                    { id: 'condensed', name: lc('condensed') }
                ],
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

    function getItemImageHeight(viewStyle) {
        return (condensed ? 44 : 94) * $fontScale;
    }
    function getItemRowHeight(viewStyle) {
        return condensed ? 80 : 170;
    }
    function getImageMargin(viewStyle) {
        return 10;
        // switch (viewStyle) {
        //     case 'condensed':
        //         return 10;
        //     default:
        //         return 10;
        // }
    }

    $: textPaint.color = colorOnBackground || 'black';
    $: textPaint.textSize = (condensed ? 11 : 14) * $fontScale;

    function onCanvasDraw(item: Item, { canvas, object }: { canvas: Canvas; object: CanvasView }) {
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        // const w2 = w / 2;
        // const h2 = h / 2;
        const dx = 10 + getItemImageHeight(viewStyle) + 16;
        textPaint.color = colorOnSurfaceVariant;
        // canvas.drawText(
        //     filesize(
        //         item.doc.pages.reduce((acc, v) => acc + v.size, 0),
        //         { output: 'string' }
        //     ),
        //     dx,
        //     h - (condensed ? 0 : 16) - 10,
        //     textPaint
        // );
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
                },
                {
                    fontSize: 14 * $fontScale,
                    lineHeight: (condensed ? 14 : 20) * $fontScale,
                    text: '\n' + item.pack.description
                }
            ]
        });
        canvas.save();
        let staticLayout = new StaticLayout(topText, textPaint, w - dx, LayoutAlignment.ALIGN_NORMAL, 1, 0, true, 'end', w - dx, 100);
        canvas.translate(dx, (condensed ? 0 : 0) + 10);
        staticLayout.draw(canvas);
        canvas.restore();

        canvas.drawText(filesize(item.pack.size, { output: 'string' }), dx, h - 13, textPaint);

        if (item.pack.age) {
            textPaint.color = colorOnTertiaryContainer;
            staticLayout = new StaticLayout(' ' + lc('age', item.pack.age) + ' ', textPaint, w - dx, LayoutAlignment.ALIGN_NORMAL, 1, 0, false);
            const width = staticLayout.getLineWidth(0);
            const height = staticLayout.getHeight();
            canvas.translate(w - width - 20, h - height - 10);
            textPaint.setColor(colorTertiaryContainer);
            canvas.drawRoundRect(-4, -1, width + 4, height + 1, height / 2, height / 2, textPaint);
            textPaint.color = colorOnTertiaryContainer;
            staticLayout.draw(canvas);
        }
    }

    async function showOptions(event) {
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

    function onPackStart() {
        stepIndex = 2;
    }
    function onPackStop() {
        DEV_LOG && console.log('home onPackStop');
        stepIndex = 1;
    }

    onSetup((storyHandler) => {
        DEV_LOG && console.info('home onSetup', stepIndex, storyHandler.isPlaying, !!storyHandler.pack);
        storyHandler.on(PackStartEvent, onPackStart);
        storyHandler.on(PackStopEvent, onPackStop);
        if (storyHandler.pack) {
            onPackStart();
        } else {
            onPackStop();
        }
    });

    onUnsetup((storyHandler) => {
        DEV_LOG && console.info('home onUnsetup', stepIndex, !!storyHandler);
        storyHandler.off(PackStartEvent, onPackStart);
        storyHandler.off(PackStopEvent, onPackStop);
    });
</script>

<page bind:this={page} id="packList" actionBarHidden={true} on:navigatedTo={onNavigatedTo}>
    <gridlayout rows="auto,*">
        <!-- {/if} -->
        <bottomsheet gestureEnabled={false} marginBottom={$windowInset.bottom} row={1} {stepIndex} steps={[0, 90, 168]}>
            <collectionView bind:this={collectionView} iosOverflowSafeArea={true} items={packs} paddingBottom={100} rowHeight={getItemRowHeight(viewStyle) * $fontScale} width="100%">
                <Template let:item>
                    <canvasview
                        backgroundColor={colorSurfaceContainerHigh}
                        borderRadius={12}
                        fontSize={14 * $fontScale}
                        margin={8}
                        rippleColor={colorSurface}
                        on:tap={() => onItemTap(item)}
                        on:longPress={(e) => onItemLongPress(item, e)}
                        on:draw={(e) => onCanvasDraw(item, e)}>
                        <image
                            borderRadius={12}
                            decodeWidth={IMAGE_DECODE_WIDTH}
                            failureImageUri="res://icon_not_found"
                            horizontalAlignment="left"
                            marginBottom={getImageMargin(viewStyle)}
                            marginLeft={10}
                            marginTop={getImageMargin(viewStyle)}
                            src={item.pack.getThumbnail()}
                            stretch="aspectFill"
                            width={getItemImageHeight(viewStyle)} />
                        <SelectedIndicator horizontalAlignment="left" margin={10} selected={item.selected} />
                    </canvasview>
                </Template>
            </collectionView>
            <gridlayout prop:bottomSheet rows="90,78" width="100%">
                <stacklayout bind:this={fabHolder} horizontalAlignment="right" orientation="horizontal" verticalAlignment="bottom">
                    <!-- <mdbutton class="small-fab" horizontalAlignment="center" text="mdi-file-document-plus-outline" verticalAlignment="center" on:tap={throttle(() => importPack(), 500)} /> -->
                    <mdbutton class="fab" horizontalAlignment="center" text="mdi-cloud-download-outline" verticalAlignment="center" on:tap={throttle(() => downloadPack(), 500)} />
                </stacklayout>
                <BarAudioPlayerWidget padding={2} row={1} />
            </gridlayout>
        </bottomsheet>

        {#if showNoPack}
            <flexlayout
                flexDirection="column"
                horizontalAlignment="center"
                marginBottom="30%"
                paddingLeft={16}
                paddingRight={16}
                row={1}
                verticalAlignment="center"
                width="80%"
                transition:fade={{ duration: 200 }}>
                <image flexShrink={2} src="res://icon_star" />
                <label color={colorOnSurfaceVariant} flexShrink={0} fontSize={19} text={lc('no_pack_yet')} textAlignment="center" textWrap={true} />
            </flexlayout>
        {/if}

        <CActionBar title={l('packs')}>
            <mdbutton class="actionBarButton" text="mdi-view-dashboard" variant="text" on:tap={selectViewStyle} />
            <mdbutton class="actionBarButton" accessibilityValue="settingsBtn" text="mdi-cogs" variant="text" on:tap={() => showSettings()} />
        </CActionBar>
        <!-- {#if nbSelected > 0} -->
        {#if nbSelected > 0}
            <CActionBar forceCanGoBack={true} onGoBack={unselectAll} title={l('selected', nbSelected)} titleProps={{ maxLines: 1, autoFontSize: true }}>
                <!-- <mdbutton class="actionBarButton" text="mdi-share-variant" variant="text" visibility={nbSelected ? 'visible' : 'collapse'} on:tap={showImageExportPopover} /> -->
                <mdbutton class="actionBarButton" text="mdi-dots-vertical" variant="text" on:tap={showOptions} />
            </CActionBar>
        {/if}
    </gridlayout>
</page>
