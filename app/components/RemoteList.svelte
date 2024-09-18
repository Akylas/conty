<script context="module" lang="ts">
    import { debounce } from '@nativescript/core/utils';
    import { Canvas, CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { createNativeAttributedString } from '@nativescript-community/ui-label';
    import { showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { confirm } from '@nativescript-community/ui-material-dialogs';
    import { VerticalPosition } from '@nativescript-community/ui-popover';
    import { Application, ApplicationSettings, NavigatedData, ObservableArray, Page, StackLayout, Utils } from '@nativescript/core';
    import { AndroidActivityBackPressedEventData } from '@nativescript/core/application/application-interfaces';
    import { onDestroy, onMount } from 'svelte';
    import { Template } from 'svelte-native/components';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import { l, lc } from '~/helpers/locale';
    import { onThemeChanged } from '~/helpers/theme';
    import { RemoteContent, RemoteContentProvider } from '~/models/Pack';
    import { request } from '~/services/api';
    import { documentsService } from '~/services/documents';
    import { timeout } from '~/utils';
    import { showError } from '~/utils/showError';
    import { closeModal, fade } from '~/utils/svelte/ui';
    import { onBackButton, showPopoverMenu, showSettings } from '~/utils/ui';
    import { actionBarButtonHeight, colors, fontScale } from '~/variables';
    import { SETTINGS_REMOTE_SOURCES } from '~/utils/constants';

    const textPaint = new Paint();
    const IMAGE_DECODE_WIDTH = Utils.layout.toDevicePixels(200);
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    let { colorPrimaryContainer, colorOnBackground } = $colors;
    $: ({
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
        pack: RemoteContent;
        selected: boolean;
    }
    let packs: ObservableArray<Item> = null;
    let filteredPacks: ObservableArray<Item> = null;
    let filter: string = null;
    let nbPacks: number = 0;
    let showNoPack = false;
    let page: NativeViewElementNode<Page>;
    let collectionView: NativeViewElementNode<CollectionView>;
    let loading = false;
    let sources: RemoteContentProvider[] = JSON.parse(ApplicationSettings.getString(SETTINGS_REMOTE_SOURCES, '[]')) as RemoteContentProvider[];
    let currentRemoteSource: RemoteContentProvider = sources[0];

    const viewStyle: string = ApplicationSettings.getString('packs_list_view_style', 'normal');
    $: condensed = viewStyle === 'condensed';
    // let items: ObservableArray<{
    //     doc: Pack; selected: boolean
    // }> = null;

    function updateFiltered(filter: string) {
        if (filter) {
            const toFilter = filter.toLowerCase();
            filteredPacks = packs.filter((d) => d.pack.title.toLowerCase().indexOf(filter) !== -1 || d.pack.description.toLowerCase().indexOf(filter) !== -1);
        } else {
            filteredPacks = packs;
        }
    }
    const updateFilteredDebounce = debounce(updateFiltered, 500);

    $: updateFilteredDebounce(filter);

    onDestroy(() => {
        blurTextField();
    });
    function blurTextField() {
        Utils.dismissSoftInput();
    }

    async function refresh() {
        if (loading || !currentRemoteSource) {
            return;
        }
        loading = true;
        try {
            const r = await request({
                method: 'GET',
                url: 'https://gist.githubusercontent.com/DantSu/3aea4c1fe15070bcf394a40b89aec33e/raw/stories.json'
            });
            DEV_LOG && console.log('got remote packs', JSON.stringify(r));
            packs = new ObservableArray(
                r.data.map((pack) => ({
                    pack,
                    selected: false
                }))
            );
            updateFiltered(filter);
            updateNoPack();

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

    function updateNoPack() {
        nbPacks = packs?.length ?? 0;
        showNoPack = nbPacks === 0;
    }

    onMount(() => {
        DEV_LOG && console.log('RemoteList', 'onMount');
        refresh();
    });
    onDestroy(() => {
        DEV_LOG && console.log('RemoteList', 'onDestroy');
    });

    async function onNavigatedTo(e: NavigatedData) {
        sources = JSON.parse(ApplicationSettings.getString(SETTINGS_REMOTE_SOURCES, '[]')) as RemoteContentProvider[];
        currentRemoteSource = sources[0];
        DEV_LOG && console.log('onNavigatedTo', sources.length);
        if (!e.isBackNavigation) {
            if (documentsService.started) {
                refresh();
            } else {
                documentsService.once('started', refresh);
            }
        }
    }

    async function onItemTap(item: Item) {
        try {
            // console.log('onItemTap', event && event.ios && event.ios.state, selectedSessions.length);

            const component = (await import('~/components/DownloadWebview.svelte')).default;
            const actualUrl = await showBottomSheet({
                view: component,
                props: {
                    url: item.pack.download
                }
            });
            DEV_LOG && console.log('actualUrl', actualUrl);
            if (actualUrl) {
                item.pack.download = actualUrl;
                //wait a bit because closeModal would not work because of the precedent closeBottomSheet
                await timeout(500);
                closeModal(item.pack);
            }
            // await goToPackView(item.doc);
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
        return condensed ? 80 : 150;
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
        textPaint.color = colorOnBackground;
        const topText = createNativeAttributedString({
            spans: [
                {
                    fontSize: 16 * $fontScale,
                    fontWeight: 'bold',
                    lineBreak: 'end',
                    lineHeight: 18 * $fontScale,
                    text: item.pack.title
                },
                {
                    fontSize: 14 * $fontScale,
                    color: colorOnSurfaceVariant,
                    lineHeight: (condensed ? 14 : 20) * $fontScale,
                    text: '\n' + item.pack.description
                }
            ]
        });
        const staticLayout = new StaticLayout(topText, textPaint, w - dx, LayoutAlignment.ALIGN_NORMAL, 1, 0, true, 'end', w - dx, 100);
        canvas.translate(dx, (condensed ? 0 : 0) + 10);
        staticLayout.draw(canvas);
    }

    async function addSource() {
        try {
            await showSettings({
                subSettingsOptions: 'remote_sources'
            });
        } catch (error) {
            showError(error);
        }
    }
    async function selectSource(event) {
        try {
            // const OptionSelect = (await import('~/components/OptionSelect.svelte')).default;
            const options = sources.map((s) => ({
                ...s
            }));
            await showPopoverMenu({
                options,
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                props: {
                    width: event.object.getMeasuredWidth()
                },
                onClose: (value) => {
                    currentRemoteSource = value;
                    refresh();
                }
            });
            // await showPopover({
            //     backgroundColor: colorSurfaceContainer,
            //     view: OptionSelect,
            //     anchor: event.object,
            //     horizPos: HorizontalPosition.ALIGN_LEFT,
            //     vertPos: VerticalPosition.CENTER,
            //     props: {
            //         borderRadius: 10,
            //         elevation: 4,
            //         margin: 4,
            //         backgroundColor: colorSurfaceContainer,
            //         containerColumns: 'auto',
            //         rowHeight: 58 * $fontScale,
            //         height: Math.min(58 * options.length * $fontScale + 8, 300),
            //         width: 150,
            //         options,
            //         onClose: (item) => {
            //             closePopover();
            //             updateOption(option, valueTransformer ? valueTransformer(item.id) : item.id, fullRefresh);
            //         }
            //     }
            // });
        } catch (error) {
            showError(error);
        }
    }
</script>

<frame>
    <page bind:this={page} actionBarHidden={true} on:navigatedTo={onNavigatedTo}>
        <gridlayout rows="auto,auto,auto,*">
            <textfield
                editable={false}
                hint={lc('source')}
                margin={10}
                placeholder={lc('source')}
                row={1}
                text={currentRemoteSource?.name}
                variant="outline"
                visibility={currentRemoteSource ? 'visible' : 'collapsed'}
                on:tap={(e) => selectSource(e)} />
            <textfield
                autocapitalizationType="none"
                hint={lc('search')}
                margin={10}
                placeholder={lc('search')}
                returnKeyType="search"
                row={2}
                text={filter}
                on:returnPress={blurTextField}
                on:textChange={(e) => (filter = e['value'])} />
            <!-- {/if} -->
            <collectionView bind:this={collectionView} iosOverflowSafeArea={true} items={filteredPacks} row={3} rowHeight={getItemRowHeight(viewStyle) * $fontScale}>
                <Template let:item>
                    <canvasview
                        backgroundColor={colorSurfaceContainerHigh}
                        borderRadius={12}
                        fontSize={14 * $fontScale}
                        margin={8}
                        rippleColor={colorSurface}
                        on:tap={() => onItemTap(item)}
                        on:draw={(e) => onCanvasDraw(item, e)}>
                        <image
                            borderRadius={12}
                            decodeWidth={IMAGE_DECODE_WIDTH}
                            horizontalAlignment="left"
                            marginBottom={getImageMargin(viewStyle)}
                            marginLeft={10}
                            marginTop={getImageMargin(viewStyle)}
                            src={item.pack.thumbs.medium}
                            stretch="aspectFill"
                            width={getItemImageHeight(viewStyle)} />
                        <SelectedIndicator horizontalAlignment="left" margin={10} selected={item.selected} />
                    </canvasview>
                </Template>
            </collectionView>
            {#if showNoPack || !currentRemoteSource || loading}
                <flexlayout flexDirection="column" horizontalAlignment="center" paddingLeft={16} paddingRight={16} row={3} verticalAlignment="center" width="80%" transition:fade={{ duration: 200 }}>
                    <!-- <lottie
                    bind:this={lottieView}
                    async={true}
                    autoPlay={true}
                    flexShrink={2}
                    keyPathColors={{
                        'background|**': lottieDarkFColor,
                        'full|**': lottieLightColor,
                        'scanner|**': lottieLightColor,
                        'lines|**': lottieDarkFColor
                    }}
                    loop={true}
                    src="~/assets/lottie/scanning.lottie" /> -->
                    <image flexShrink={2} src="res://icon_star" visibility={!loading ? 'visible' : 'collapse'} />
                    <mdactivityindicator busy={loading} height={$actionBarButtonHeight} verticalAlignment="middle" visibility={loading ? 'visible' : 'collapse'} width={$actionBarButtonHeight} />

                    <label
                        color={colorOnSurfaceVariant}
                        flexShrink={0}
                        fontSize={19}
                        text={loading ? lc('loading') : !currentRemoteSource ? lc('no_remote_source') : lc('please_refresh')}
                        textAlignment="center"
                        textWrap={true} />
                    <mdbutton text={lc('add_source')} on:tap={addSource} />
                </flexlayout>
            {/if}

            <CActionBar modalWindow={true} title={l('download_packs')}>
                <mdbutton class="actionBarButton" text="mdi-cog" variant="text" on:tap={addSource} />
            </CActionBar>
        </gridlayout>
    </page>
</frame>
