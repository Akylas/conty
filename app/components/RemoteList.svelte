<script context="module" lang="ts">
    import { Canvas, CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { createNativeAttributedString } from '@nativescript-community/ui-label';
    import { showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { VerticalPosition } from '@nativescript-community/ui-popover';
    import { ApplicationSettings, NavigatedData, ObservableArray, Page, Utils } from '@nativescript/core';
    import { showError } from '@shared/utils/showError';
    import { closeModal, fade } from '@shared/utils/svelte/ui';
    import { onDestroy, onMount } from 'svelte';
    import { Template } from 'svelte-native/components';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import { l, lc } from '~/helpers/locale';
    import { colorTheme, isEInk, onThemeChanged } from '~/helpers/theme';
    import { RemoteContent, RemoteContentProvider } from '~/models/Pack';
    import { request } from '~/services/api';
    import { documentsService } from '~/services/documents';
    import { SETTINGS_REMOTE_SOURCES } from '~/utils/constants';
    import { showPopoverMenu, showSettings } from '~/utils/ui';
    import { actionBarButtonHeight, colors, fontScale, windowInset } from '~/variables';
    import ActionBarSearch from './common/ActionBarSearch.svelte';
    import { openUrl } from '@akylas/nativescript/utils';
    import { confirm } from '@nativescript-community/ui-material-dialogs';

    const textPaint = new Paint();
    const IMAGE_DECODE_WIDTH = Utils.layout.toDevicePixels(200);
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    let { colorOnBackground, colorPrimaryContainer } = $colors;
    $: ({
        colorError,
        colorOnBackground,
        colorOnPrimaryContainer,
        colorOnSecondary,
        colorOnSurfaceVariant,
        colorOutline,
        colorOutlineVariant,
        colorPrimaryContainer,
        colorSurface,
        colorSurfaceContainer,
        colorSurfaceContainerHigh,
        colorSurfaceContainerLow
    } = $colors);

    interface Item {
        pack: RemoteContent;
        selected: boolean;
    }
    let packs: ObservableArray<Item> = null;
    let filteredPacks: ObservableArray<Item> = null;
    let nbPacks: number = 0;
    let showSearch = false;
    let lastRefreshFilter = null;
    let showNoPack = false;
    let page: NativeViewElementNode<Page>;
    let collectionView: NativeViewElementNode<CollectionView>;
    let search: ActionBarSearch;
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
            filteredPacks = packs?.filter((d) => d.pack.title.toLowerCase().indexOf(filter) !== -1 || d.pack.description.toLowerCase().indexOf(filter) !== -1);
        } else {
            filteredPacks = packs;
        }
    }

    async function refresh(force = true, filter?: string) {
        if (loading || !currentRemoteSource || (!force && lastRefreshFilter === filter)) {
            return;
        }
        lastRefreshFilter = filter;
        loading = true;
        try {
            if (force || !packs) {
                const r = await request({
                    method: 'GET',
                    url: currentRemoteSource.url
                });
                if (!r.data) {
                    throw new Error(lc('remote_source_wrong_format'));
                }
                DEV_LOG && console.log('got remote packs', r.data.length);
                packs = new ObservableArray(
                    r.data.map((pack) => ({
                        pack,
                        selected: false
                    }))
                );
            }
            loading = false;
            updateFiltered(filter);
            updateNoPack();
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

    onMount(() => {
        DEV_LOG && console.log('RemoteList', 'onMount');
        // refresh();
    });
    onDestroy(() => {
        DEV_LOG && console.log('RemoteList', 'onDestroy');
    });

    async function onNavigatedTo(e: NavigatedData) {
        DEV_LOG && console.log('onNavigatedTo', sources.length);
        sources = JSON.parse(ApplicationSettings.getString(SETTINGS_REMOTE_SOURCES, '[]')) as RemoteContentProvider[];
        currentRemoteSource = sources[0];
        if (documentsService.started) {
            refresh();
        } else {
            documentsService.once('started', refreshSimple);
        }
    }

    async function onItemTap(item: Item) {
        try {
            if (item.pack.download.startsWith('https://mega.nz/')) {
                const result = await confirm({
                    message: lc('need_download_browser'),
                    okButtonText: lc('open'),
                    cancelButtonText: lc('cancel')
                });
                if (result) {
                    openUrl(item.pack.download);
                }
                return;
            }
            if (!item.pack.download.endsWith('.zip')) {
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
                    // await timeout(1500);
                    closeModal(item.pack);
                }
            } else {
                closeModal(item.pack);
            }
        } catch (error) {
            showError(error);
        }
    }

    function refreshCollectionView() {
        collectionView?.nativeView?.refresh();
    }
    onThemeChanged(refreshCollectionView);

    function getItemImageHeight(viewStyle) {
        return (condensed ? 44 : 94) * $fontScale;
    }
    function getItemRowHeight(viewStyle) {
        return condensed ? 80 : 150;
    }
    function getImageMargin(viewStyle) {
        return 10;
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
        const staticLayout = new StaticLayout(topText, textPaint, w - dx - 10, LayoutAlignment.ALIGN_NORMAL, 1, 0, true, 'end', w - dx - 10, h - 20);
        canvas.translate(dx, (condensed ? 0 : 0) + 10);
        staticLayout.draw(canvas);
    }

    async function addSource() {
        try {
            await showSettings(
                {
                    subSettingsOptions: 'remote_sources'
                },
                {
                    frame: 'download'
                }
            );
        } catch (error) {
            showError(error);
        }
    }
    async function selectSource(event) {
        try {
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
        } catch (error) {
            showError(error);
        }
    }
    function onGoBack() {
        if (showSearch) {
            search.hideSearch();
        } else {
            closeModal();
        }
    }
</script>

<frame id="download">
    <page bind:this={page} id="remoteList" actionBarHidden={true} on:navigatedTo={onNavigatedTo} on:navigatingFrom={() => search.unfocusSearch()}>
        <gridlayout paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,auto,*,auto">
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
            <!-- {/if} -->
            <collectionView
                bind:this={collectionView}
                iosOverflowSafeArea={true}
                items={filteredPacks}
                row={2}
                rowHeight={getItemRowHeight(viewStyle) * $fontScale}
                android:paddingBottom={$windowInset.bottom}>
                <Template let:item>
                    <canvasview class="card" borderWidth={viewStyle === 'card' || isEInk ? 1 : 0} on:tap={() => onItemTap(item)} on:draw={(e) => onCanvasDraw(item, e)}>
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
                <flexlayout flexDirection="column" horizontalAlignment="center" paddingLeft={16} paddingRight={16} row={2} verticalAlignment="center" width="80%" transition:fade={{ duration: 200 }}>
                    <image flexShrink={2} src="res://icon_star" visibility={!loading ? 'visible' : 'collapse'} />
                    <activityindicator busy={loading} height={$actionBarButtonHeight} verticalAlignment="middle" visibility={loading ? 'visible' : 'collapse'} width={$actionBarButtonHeight} />
                    <label
                        color={colorOnSurfaceVariant}
                        flexShrink={0}
                        fontSize={19}
                        text={loading ? lc('loading') : !currentRemoteSource ? lc('no_remote_source') : lc('please_refresh')}
                        textAlignment="center"
                        textWrap={true} />
                    <mdbutton text={lc('add_source')} visibility={!currentRemoteSource ? 'visible' : 'collapse'} on:tap={addSource} />
                </flexlayout>
            {/if}

            <CActionBar modalWindow={true} {onGoBack} title={l('download_packs')}>
                <mdbutton class="actionBarButton" text="mdi-magnify" variant="text" on:tap={() => search.showSearch()} />
                <mdbutton class="actionBarButton" text="mdi-cog" variant="text" on:tap={addSource} />

                <ActionBarSearch bind:this={search} slot="center" {refresh} bind:visible={showSearch} />
            </CActionBar>
        </gridlayout>
    </page>
</frame>
