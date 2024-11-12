<script context="module" lang="ts">
    import { Canvas, CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { openFilePicker } from '@nativescript-community/ui-document-picker';
    import { createNativeAttributedString } from '@nativescript-community/ui-label';
    import { confirm } from '@nativescript-community/ui-material-dialogs';
    import { HorizontalPosition, VerticalPosition } from '@nativescript-community/ui-popover';
    import { closePopover, showPopover } from '@nativescript-community/ui-popover/svelte';
    import { AnimationDefinition, Application, ApplicationSettings, EventData, Frame, NavigatedData, ObservableArray, Page, Screen, StackLayout, Utils, View } from '@nativescript/core';
    import { AndroidActivityBackPressedEventData } from '@nativescript/core/application/application-interfaces';
    import { throttle } from '@nativescript/core/utils';
    import { showError } from '@shared/utils/showError';
    import { fade, goBack, showModal } from '@shared/utils/svelte/ui';
    import { filesize } from 'filesize';
    import { onDestroy, onMount } from 'svelte';
    import { Template } from 'svelte-native/components';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import { l, lc } from '~/helpers/locale';
    import { colorTheme, onThemeChanged } from '~/helpers/theme';
    import { Pack, PackFolder, RemoteContent, Story } from '~/models/Pack';
    import { downloadStories } from '~/services/api';
    import { FOLDER_COLOR_SEPARATOR, FolderUpdatedEventData, PackAddedEventData, PackDeletedEventData, PackMovedFolderEventData, PackUpdatedEventData, documentsService } from '~/services/documents';
    import { BOTTOM_BUTTON_OFFSET, EVENT_FOLDER_UPDATED, EVENT_PACK_ADDED, EVENT_PACK_DELETED, EVENT_PACK_MOVED_FOLDER, EVENT_PACK_UPDATED } from '~/utils/constants';
    import {
        currentBottomOffset,
        goToFolderView,
        hideBarPlayer,
        hideLoading,
        onBackButton,
        playPack,
        playStory,
        promptForFolderName,
        showBarPlayer,
        showBottomsheetOptionSelect,
        showLoading,
        showParentalGate,
        showPopoverMenu,
        showSettings
    } from '~/utils/ui';
    import { colors, folderBackgroundColor, fontScale, fonts, onFolderBackgroundColorChanged, onPodcastModeChanged, podcastMode, screenWidthDips, windowInset } from '~/variables';

    import { request } from '@nativescript-community/perms';
    import ActionBarSearch from '~/components/common/ActionBarSearch.svelte';
    import IconButton from '~/components/common/IconButton.svelte';
    import ListItemAutoSizeFull from '~/components/common/ListItemAutoSizeFull.svelte';
    import { OptionType } from '~/components/common/OptionSelect.svelte';
    import { getBGServiceInstance } from '~/services/BgService';
    import { importService } from '~/services/importservice';
    import { getRealPath, requestManagePermission } from '~/utils';
    import EditNameActionBar from '~/components/common/EditNameActionBar.svelte';
    import { formatDuration } from '~/helpers/formatter';

    const textPaint = new Paint();
    const IMAGE_DECODE_WIDTH = Utils.layout.toDevicePixels(200);
    type ViewStyle = 'expanded' | 'condensed' | 'card';

    interface Item {
        pack?: Pack;
        folder?: PackFolder;
        selected: boolean;
    }
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    const { mdi } = $fonts;
    let {
        colorBackground,
        colorError,
        colorOnBackground,
        colorOnSurfaceVariant,
        colorOnTertiaryContainer,
        colorOutline,
        colorSurface,
        colorSurfaceContainer,
        colorSurfaceContainerHigh,
        colorTertiaryContainer
    } = $colors;
    $: ({
        colorBackground,
        colorError,
        colorOnBackground,
        colorOnSurfaceVariant,
        colorOnTertiaryContainer,
        colorOutline,
        colorSurface,
        colorSurfaceContainer,
        colorSurfaceContainerHigh,
        colorTertiaryContainer
    } = $colors);
    const orientation = Application.orientation();
    const screenWidth = Math.round(screenWidthDips);

    export let folder: PackFolder = null;
    export let title = l('packs');
    let folders: PackFolder[] = [];

    $: if (folder) {
        DEV_LOG && console.log('updating folder title', folder);

        title = createNativeAttributedString({
            spans: [
                {
                    fontFamily: $fonts.mdi,
                    fontSize: 24,
                    color: folder.color || colorOutline,
                    text: 'mdi-folder  '
                },
                {
                    text: folder.name
                }
            ]
        });
    }

    let packs: ObservableArray<Item> = null;
    let folderItems: ObservableArray<Item> = null;
    let nbPacks: number = 0;
    let showNoPack = false;
    let page: NativeViewElementNode<Page>;
    let collectionView: NativeViewElementNode<CollectionView>;
    let fabHolder: NativeViewElementNode<StackLayout>;
    let search: ActionBarSearch;

    const stepIndex = 1;

    let showSearch = false;
    let lastRefreshFilter = null;
    let editingTitle = false;

    let loading = false;

    const colWidth = null;
    let viewStyle: ViewStyle = ApplicationSettings.getString('packs_list_view_style', 'expanded') as ViewStyle;

    $: if (nbSelected > 0) search.unfocusSearch();
    $: condensed = viewStyle === 'condensed';

    async function refresh(force = true, filter?: string) {
        if (loading || (!force && lastRefreshFilter === filter)) {
            return;
        }
        lastRefreshFilter = filter;
        loading = true;
        try {
            DEV_LOG && console.log('refresh', filter);
            const r = await documentsService.packRepository.findPacks({ filter, folder, omitThoseWithFolders: true });

            folders = filter?.length || folder ? [] : await documentsService.folderRepository.findFolders();

            folderItems = new ObservableArray(
                folders.map(
                    (folder) =>
                        ({
                            folder,
                            selected: false
                        }) as any
                )
            );
            packs = new ObservableArray(
                r.map(
                    (pack) =>
                        ({
                            pack,
                            selected: false
                        }) as any
                )
            );
            DEV_LOG && console.log('refresh done', filter, r.length);
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
        DEV_LOG && console.log('onPackAdded', nbPacks, folder, event.folder);
        if ((!event.folder && !folder) || folder?.name === event.folder?.name) {
            const index = packs?.findIndex((d) => !!d.pack);
            if (index !== -1) {
                packs?.splice(index, 0, {
                    pack: event.pack,
                    selected: false
                } as Item);
                collectionView?.nativeElement.scrollToIndex(index, false);
            } else {
                refresh();
            }
            updateNoPack();
        } else if (!folder && event.folder) {
            refresh();
        }
    }
    function onPackMovedFolder(event: PackMovedFolderEventData) {
        // TODO: for now we refresh otherwise the order might be lost
        DEV_LOG && console.log('onPackMovedFolder', folder?.id, event.folder?.id, event.oldFolderId);
        if (!folder && (!event.folder || !event.oldFolderId)) {
            // if (!event.folder) {
            //     const index = documents.findIndex(d=>d.doc && d.doc.id === event.object.id)
            //     if (index === -1) {
            //         documents.push
            //     }
            // }
            refresh();
        } else if (folder && (folder.id === event.folder?.id || folder.id === event.oldFolderId)) {
            refresh();
        }
    }
    function onPackUpdated(event: PackUpdatedEventData) {
        let index = -1;
        packs?.some((d, i) => {
            if (d.pack && d.pack.id === event.pack.id) {
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
    function onFolderUpdated(event: FolderUpdatedEventData) {
        DEV_LOG && console.log('onFolderUpdated', event.folder);
        if (event.folder && folder && event.folder.id === folder?.id) {
            folder = event.folder;
        }
        let index = -1;
        folderItems?.some((d, i) => {
            if (d.folder && d.folder.id === event.folder.id) {
                index = i;
                return true;
            }
        });
        DEV_LOG && console.log('onFolderUpdated', event.folder, index);
        if (index >= 0) {
            const item = folderItems?.getItem(index);
            if (item) {
                item.folder = event.folder;
                folderItems.setItem(index, item);
            }
        }
    }
    async function onPacksDeleted(event: PackDeletedEventData) {
        try {
            for (let i = 0; i < event.packIds.length; i++) {
                const id = event.packIds[i];
                const index = packs.findIndex((item) => item.pack && item.pack.id === id);
                if (index !== -1) {
                    packs.splice(index, 1);
                    nbSelected -= 1;
                }
            }
            if (!folder && event.folders?.length) {
                for (let i = 0; i < event.folders.length; i++) {
                    const name = event.folders[i].split(FOLDER_COLOR_SEPARATOR)[0];
                    const index = folderItems.findIndex((item) => item.folder && item.folder.name === name);
                    if (index !== -1) {
                        const item = folderItems.getItem(index);
                        const res = await documentsService.folderRepository.findFolder(name);
                        item.folder = res[0];
                        folderItems.setItem(index, folderItems.getItem(index));
                    }
                }
            }
            updateNoPack();
        } catch (error) {
            showError(error);
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
        // if (!folder) {
        bottomOffset = currentBottomOffset;
        DEV_LOG && console.log('PackList', 'onMount', currentBottomOffset);
        Application.on('bottomOffsetAnimation', onBottomOffsetAnimation);
        // }
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
        documentsService.on(EVENT_PACK_MOVED_FOLDER, onPackMovedFolder);
        documentsService.on(EVENT_FOLDER_UPDATED, onFolderUpdated);

        const permResult = await request('notification');
        DEV_LOG && console.log('permResult', permResult);
    });
    onDestroy(() => {
        DEV_LOG && console.log('PackList', 'onDestroy');
        // if (!folder) {
        Application.off('bottomOffsetAnimation', onBottomOffsetAnimation);
        // }
        if (__ANDROID__) {
            Application.android.off(Application.android.activityBackPressedEvent, onAndroidBackButton);
            // Application.android.off(Application.android.activityNewIntentEvent, onAndroidNewItent);
        }
        documentsService.off(EVENT_PACK_UPDATED, onPackUpdated);
        documentsService.off(EVENT_PACK_ADDED, onPackAdded);
        documentsService.off(EVENT_PACK_DELETED, onPacksDeleted);
        documentsService.off(EVENT_PACK_MOVED_FOLDER, onPackMovedFolder);
        documentsService.off(EVENT_FOLDER_UPDATED, onFolderUpdated);
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
                    await importService.importContentFromFiles(
                        files.map((f) => getRealPath(f)),
                        folder?.id
                    );
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
                await downloadStories(toDownload, folder?.name);
            }
        } catch (error) {
            showError(error);
        }
    }

    async function onNavigatedTo(e: NavigatedData) {
        try {
            if (!e.isBackNavigation) {
                if (!(await requestManagePermission())) {
                    throw new Error(lc('missing_manage_permission'));
                }
                await request('storage');
                const showFirstPresentation = ApplicationSettings.getBoolean('showFirstPresentation', true);
                if (showFirstPresentation) {
                    const result = await confirm({
                        title: lc('welcome'),
                        message: lc('first_presentation'),
                        okButtonText: lc('add_source'),
                        cancelButtonText: lc('cancel')
                    });
                    if (result) {
                        const parentalGate = await showParentalGate();
                        if (!parentalGate) {
                            return;
                        }
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
            if (item.folder) {
                folderItems?.some((d, index) => {
                    if (d === item) {
                        nbSelected += d.folder.count;
                        d.selected = true;
                        folderItems.setItem(index, d);
                        return true;
                    }
                });
            } else {
                packs?.some((d, index) => {
                    if (d === item) {
                        nbSelected += 1;
                        d.selected = true;
                        packs.setItem(index, d);
                        return true;
                    }
                });
            }
        }
    }

    function unselectItem(item: Item) {
        DEV_LOG && console.log('unselectItem', item);
        if (item.selected) {
            if (item.folder) {
                folderItems?.some((d, index) => {
                    if (d === item) {
                        nbSelected -= d.folder.count;
                        d.selected = false;
                        folderItems.setItem(index, d);
                        return true;
                    }
                });
            } else {
                packs?.some((d, index) => {
                    if (d === item) {
                        nbSelected -= 1;
                        d.selected = false;
                        packs.setItem(index, d);
                        return true;
                    }
                });
            }
        }
    }
    function unselectAll() {
        nbSelected = 0;
        if (packs) {
            packs.splice(0, packs.length, ...packs.map((i) => ({ ...i, selected: false })));
        }
        if (folderItems) {
            folderItems.splice(0, folderItems.length, ...folderItems.map((i) => ({ ...i, selected: false })));
        }
    }
    function selectAll() {
        let newCount = packs.length;
        if (packs) {
            packs.splice(0, packs.length, ...packs.map((i) => ({ ...i, selected: true })));
        }
        if (folderItems) {
            folderItems.splice(
                0,
                folderItems.length,
                ...folderItems.map((i) => {
                    newCount += i.folder.count;
                    return { ...i, selected: false };
                })
            );
        }
        nbSelected = newCount;
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
            } else if (item.folder) {
                await goToFolderView(item.folder);
            } else {
                if ($podcastMode && item.pack.extra?.podcast === true) {
                    await showAllPodcastStories(item);
                } else {
                    await playPack(item.pack);
                }
            }
        } catch (error) {
            showError(error);
        }
    }
    async function podcastButton(item: Item) {
        try {
            if ($podcastMode && item.pack.extra?.podcast === true) {
                await playPack(item.pack);
            } else {
                await showAllPodcastStories(item);
            }
        } catch (error) {
            showError(error);
        }
    }
    function onGoBack(data) {
        if (editingTitle) {
            if (data) {
                data.cancel = true;
            }
            editingTitle = false;
        }
    }
    function actionBarOnGoBack() {
        if (showSearch) {
            search.hideSearch();
        } else if (Frame.topmost().canGoBack()) {
            goBack();
        }
    }

    const onAndroidBackButton = (data: AndroidActivityBackPressedEventData) =>
        onBackButton(page?.nativeView, () => {
            if (nbSelected > 0) {
                data.cancel = true;
                unselectAll();
            } else {
                onGoBack(data);
            }
        });

    async function getSelectedPacks() {
        const selected: Pack[] = [];
        for (let index = 0; index < packs.length; index++) {
            const d = packs.getItem(index);
            if (d.selected) {
                if (d.pack) {
                    selected.push(d.pack);
                }
            }
        }
        for (let index = 0; index < folderItems.length; index++) {
            const d = folderItems.getItem(index);
            if (d.selected) {
                if (d.folder) {
                    selected.push(...(await documentsService.packRepository.findPacks({ folder: d.folder })));
                }
            }
        }
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
                    const selectedPacks = await getSelectedPacks();
                    if (currentPack && selectedPacks.findIndex((d) => d.id === currentPack.id)) {
                        storyHandler?.stopPlaying();
                    }
                    await importService.deletePacks(selectedPacks);
                }
            } catch (error) {
                showError(error);
            }
        }
    }
    async function selectViewStyle(event) {
        try {
            // const options = Object.keys(OPTIONS[option]).map((k) => ({ ...OPTIONS[option][k], id: k }));
            const options: OptionType[] = [
                { id: 'expanded', name: lc('expanded') },
                { id: 'condensed', name: lc('condensed') },
                { id: 'card', name: lc('card') }
            ].map((d) => ({
                ...d,
                boxType: 'circle',
                type: 'checkbox',
                value: d.id === viewStyle
            }));
            await showPopoverMenu({
                options,
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                onCheckBox: (item) => {
                    closePopover();
                    viewStyle = item.id;
                    refreshCollectionView();
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
    onFolderBackgroundColorChanged(refreshCollectionView);

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
    function getFolderRowHeight(viewStyle) {
        switch (viewStyle) {
            case 'card':
                return screenWidth / 2;
            default:
                return 70;
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
        const options = new ObservableArray([
            { icon: 'mdi-folder-swap', id: 'move_folder', name: lc('move_folder') },
            { id: 'delete', name: lc('delete'), icon: 'mdi-delete', color: colorError }
        ] as OptionType);
        return showPopoverMenu({
            options,
            anchor: event.object,
            vertPos: VerticalPosition.BELOW,

            onClose: async (item) => {
                try {
                    switch (item.id) {
                        case 'select_all':
                            selectAll();
                            break;
                        case 'move_folder':
                            const selected = await getSelectedPacks();
                            let defaultFolder;
                            const folderName = await promptForFolderName(
                                defaultFolder,
                                Object.values(folders).filter((g) => g.name !== 'none')
                            );
                            DEV_LOG && console.log('folderName', folderName, selected.length);
                            if (typeof folderName === 'string') {
                                for (let index = 0; index < selected.length; index++) {
                                    const doc = selected[index];
                                    await doc.setFolder({ folderName: folderName === 'none' ? undefined : folderName });
                                }
                                unselectAll();
                            }

                            break;
                        case 'delete':
                            deleteSelectedPacks();
                            break;
                    }
                } catch (error) {
                    showError(error);
                }
            }
        });
    }

    async function showAllPodcastStories(item: Item) {
        try {
            const thePack = item.pack;
            const storyHandler = getBGServiceInstance().storyHandler;
            const stories = await storyHandler.findAllStories(thePack, true);
            const rowHeight = 80;
            const showFilter = stories.length > 6;
            const data: any = await showBottomsheetOptionSelect(
                {
                    height: Math.min(stories.length * rowHeight + (showFilter ? 110 : 40), Screen.mainScreen.heightDIPs * 0.7),
                    rowHeight,
                    fontSize: 18,
                    showFilter,
                    title: thePack.title,
                    component: ListItemAutoSizeFull,
                    titleProps: {
                        maxLines: 2,
                        lineBreak: 'end'
                        // maxFontSize: 18,
                        // autoFontSize: true
                    },
                    titleHolderProps: {
                        paddingTop: 0,
                        paddingBottom: 0
                    },
                    options: stories.map((story) => ({
                        type: 'image',
                        image: story.thumbnail,
                        name: story.name,
                        episode: story.episode,
                        episodeCount: thePack.extra?.episodeCount,
                        subtitle: formatDuration(story.duration),
                        story,
                        onDraw: (item, event) => {
                            if (item.episode && item.episodeCount) {
                                textPaint.color = colorOnTertiaryContainer;
                                textPaint.fontWeight = 'bold';
                                const canvas = event.canvas;
                                const h = canvas.getHeight();
                                const w = canvas.getWidth();
                                const staticLayout = new StaticLayout(` ${item.episode}/${item.episodeCount} `, textPaint, w, LayoutAlignment.ALIGN_NORMAL, 1, 0, false);
                                const width = staticLayout.getLineWidth(0);
                                const height = staticLayout.getHeight();
                                canvas.translate(24, h - height - 10);
                                textPaint.setColor(colorTertiaryContainer);
                                canvas.drawRoundRect(-4, -1, width + 4, height + 1, height / 2, height / 2, textPaint);
                                textPaint.color = colorOnTertiaryContainer;
                                staticLayout.draw(canvas);
                            }
                        }
                    }))
                },
                {
                    skipCollapsedState: true
                }
            );
            if (data?.story) {
                const index = stories.findIndex((s) => s.id === data.story.id);
                storyHandler.playlist.splice(0, storyHandler.playlist.length, ...stories.slice(index).map((s) => ({ story: s })));
                playStory(data?.story as Story, true, false);
            }
        } catch (error) {
            showError(error);
        }
    }

    function itemTemplateSelector(item: Item, index, items) {
        if (item.folder) {
            return 'folder';
        }
        return 'default';
    }
    function itemTemplateSpanSize(item: Item, index, items) {
        if (item.folder || viewStyle === 'card') {
            return 1;
        }
        return 2;
    }

    async function pickFolderColor(event) {
        try {
            const ColorPickerView = (await import('~/components/common/ColorPickerView.svelte')).default;
            // const result: any = await showModal({ page: Settings, fullscreen: true, props: { position } });
            const anchorView = event.object as View;
            const color: string = await showPopover({
                backgroundColor: colorSurfaceContainer,
                vertPos: VerticalPosition.BELOW,
                horizPos: HorizontalPosition.RIGHT,
                view: ColorPickerView,
                anchor: anchorView,
                props: {
                    borderRadius: 10,
                    elevation: __ANDROID__ ? 3 : 0,
                    margin: 4,
                    width: screenWidthDips * 0.7,
                    backgroundColor: colorSurfaceContainer,
                    defaultColor: folder.color
                }
            });
            DEV_LOG && console.log('pickFolderColor', color);
            if (color) {
                await folder.save({ color });
                DEV_LOG && console.log('updating folder', folder);
                folder = folder; //for svelte to pick up change
            }
        } catch (error) {
            showError(error);
        }
    }

    function onFolderCanvasDraw(item: Item, { canvas, object }: { canvas: Canvas; object: CanvasView }) {
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        const dx = 10;
        const { folder } = item;
        textPaint.color = colorOnBackground;
        const topText = createNativeAttributedString({
            spans: [
                {
                    fontFamily: $fonts.mdi,
                    fontSize: 20 * $fontScale,
                    color: !$folderBackgroundColor && folder.color ? folder.color : colorOutline,
                    lineHeight: 24 * $fontScale,
                    text: 'mdi-folder '
                },
                {
                    fontSize: 16 * $fontScale,
                    fontWeight: 'bold',
                    lineBreak: 'end',
                    lineHeight: 18 * $fontScale,
                    text: folder.name
                },
                {
                    fontSize: 14 * $fontScale,
                    color: colorOutline,
                    lineHeight: (condensed ? 14 : 20) * $fontScale,
                    text: '\n' + lc('packs_count', item.folder.count)
                }
            ]
        });
        canvas.save();
        const staticLayout = new StaticLayout(topText, textPaint, w - dx, LayoutAlignment.ALIGN_NORMAL, 1, 0, true);
        canvas.translate(dx, h / 2 - staticLayout.getHeight() / 2);
        staticLayout.draw(canvas);
        canvas.restore();
    }
    let firstLayout = true;
    function onLayoutChanged() {
        if (firstLayout) {
            firstLayout = false;
            const storyHandler = getBGServiceInstance().storyHandler;
            if (storyHandler?.pack) {
                showBarPlayer();
            } else {
                hideBarPlayer();
            }
        }
    }
</script>

<page bind:this={page} id="packList" actionBarHidden={true} on:navigatedTo={onNavigatedTo} on:navigatingFrom={() => search.unfocusSearch()} on:layoutChanged={onLayoutChanged}>
    <gridlayout paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,auto,*,auto">
        <collectionView
            bind:this={collectionView}
            colWidth={150}
            height={70}
            items={folderItems}
            orientation="horizontal"
            row={1}
            rowHeight={70}
            ios:iosOverflowSafeArea={true}
            visibility={folders?.length ? 'visible' : 'collapsed'}>
            <Template let:item>
                <canvasview
                    backgroundColor={($folderBackgroundColor && item.folder.color) || colorSurfaceContainerHigh}
                    borderColor={colorOutline}
                    borderRadius={12}
                    borderWidth={1}
                    margin="0 8 0 8"
                    rippleColor={colorSurface}
                    on:tap={() => onItemTap(item)}
                    on:longPress={(e) => onItemLongPress(item, e)}
                    on:draw={(e) => onFolderCanvasDraw(item, e)}>
                    <SelectedIndicator horizontalAlignment="right" margin={10} selected={item.selected} verticalAlignment="top" />
                    <!-- <SyncIndicator synced={item.doc._synced} visible={syncEnabled} /> -->
                    <!-- <PageIndicator horizontalAlignment="right" margin={10} text={item.doc.pages.length} /> -->
                </canvasview>
            </Template>
        </collectionView>
        <collectionView
            bind:this={collectionView}
            colWidth="50%"
            height="100%"
            ios:iosOverflowSafeArea={true}
            {itemTemplateSelector}
            items={packs}
            paddingBottom={Math.max($windowInset.bottom, BOTTOM_BUTTON_OFFSET) + bottomOffset}
            row={2}
            spanSize={itemTemplateSpanSize}
            width="100%">
            <Template let:item>
                <canvasview
                    class="card"
                    borderWidth={viewStyle === 'card' || colorTheme === 'eink' ? 1 : 0}
                    height={getItemRowHeight(viewStyle) * $fontScale}
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
                        verticalAlignment={viewStyle === 'card' ? 'top' : 'bottom'}
                        visibility={item.pack.extra?.podcast ? 'visible' : 'hidden'}
                        on:tap={() => podcastButton(item)} />
                </canvasview>
            </Template>
        </collectionView>
        <progress backgroundColor="transparent" busy={true} indeterminate={true} row={2} verticalAlignment="top" visibility={loading ? 'visible' : 'hidden'} />

        <!-- <gridlayout prop:bottomSheet rows={`90,${BAR_AUDIO_PLAYER_HEIGHT}`} width="100%"> -->
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
                row={2}
                rowSpan={2}
                verticalAlignment="center"
                width="80%"
                transition:fade={{ duration: 200 }}>
                <nimage flexShrink={2} src="res://icon_star" />
                <label color={colorOnSurfaceVariant} flexShrink={0} fontSize={19} text={lc('no_pack_yet')} textAlignment="center" textWrap={true} />
            </flexlayout>
        {/if}

        <stacklayout
            bind:this={fabHolder}
            horizontalAlignment="right"
            marginBottom={Math.min(60, $windowInset.bottom)}
            orientation="horizontal"
            row={2}
            translateY={-bottomOffset}
            verticalAlignment="bottom">
            <mdbutton class="small-fab" horizontalAlignment="center" text="mdi-file-document-plus-outline" verticalAlignment="center" on:tap={throttle(() => importPack(), 500)} />
            <mdbutton class="fab" horizontalAlignment="center" text="mdi-cloud-download-outline" verticalAlignment="center" on:tap={throttle(() => downloadPack(), 500)} />
        </stacklayout>
        <CActionBar modalWindow={showSearch} onGoBack={actionBarOnGoBack} onTitleTap={folder ? () => (editingTitle = true) : null} {title}>
            <mdbutton class="actionBarButton" text="mdi-magnify" variant="text" on:tap={() => search.showSearch()} />
            <mdbutton class="actionBarButton" text="mdi-view-dashboard" variant="text" on:tap={selectViewStyle} />
            {#if folder}
                <mdbutton class="actionBarButton" accessibilityValue="settingsBtn" text="mdi-palette" variant="text" on:tap={pickFolderColor} />
            {:else}
                <mdbutton class="actionBarButton" accessibilityValue="settingsBtn" text="mdi-cogs" variant="text" on:tap={() => showSettings()} />
            {/if}
            <ActionBarSearch bind:this={search} slot="center" {refresh} bind:visible={showSearch} />
        </CActionBar>
        <!-- {#if nbSelected > 0} -->
        {#if nbSelected > 0}
            <CActionBar forceCanGoBack={true} onGoBack={unselectAll} title={l('selected', nbSelected)} titleProps={{ maxLines: 1, autoFontSize: true }}>
                <!-- <mdbutton class="actionBarButton" text="mdi-share-variant" variant="text" visibility={nbSelected ? 'visible' : 'collapse'} on:tap={showImageExportPopover} /> -->
                <mdbutton class="actionBarButton" text="mdi-dots-vertical" variant="text" on:tap={showSelectedOptions} />
            </CActionBar>
        {/if}
        {#if editingTitle}
            <EditNameActionBar {folder} bind:editingTitle />
        {/if}
        {#if __IOS__}
            <absolutelayout backgroundColor={colorBackground} height={$windowInset.bottom} row={2} verticalAlignment="bottom" />
        {/if}
    </gridlayout>
</page>
