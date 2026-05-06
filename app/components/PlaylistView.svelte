<!-- <svelte:options accessors /> -->

<script context="module" lang="ts">
    import { lc } from '@nativescript-community/l';
    import { closeBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { Color, Screen } from '@nativescript/core';
    import { Template } from '@nativescript-community/svelte-native/components';
    import ListItemAutoSize from '~/components/common/ListItemAutoSize.svelte';
    import { PlaylistItem } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
    import { onDestroy, onMount } from 'svelte';
    import { getBGServiceInstance } from '~/services/BgService';
    import { colors } from '~/variables';
</script>

<script lang="ts">
    const playlist = getBGServiceInstance().storyHandler.playlist;
    export let showBorders = true;
    export let backgroundColor = null;
    export let borderRadius = 8;
    export let rowHeight = 70;
    export let width: string | number = '*';
    export let containerColumns: string = '*';
    export let fontWeight = 'bold';
    export let onClose = null;
    export let height: number | string = Math.min(playlist.length * rowHeight + 50, Screen.mainScreen.heightDIPs * 0.7);
    export let fontSize = 16;
    export let iconFontSize = 24;

    // DEV_LOG && console.log('options', options);

    // technique for only specific properties to get updated on store change
    let { colorError, colorOnBackground, colorOnError } = $colors;
    $: ({ colorError, colorOnBackground, colorOnError } = $colors);

    function close(value) {
        (onClose || closeBottomSheet)(value);
    }
    async function onTap(item: PlaylistItem, event) {}

    function onDataPopulated(event) {
        // if (selectedIndex !== undefined) {
        //     if (onlyOneSelected) {
        //         currentlyCheckedItem = options instanceof ObservableArray ? options.getItem(selectedIndex) : options[selectedIndex];
        //     }
        //     if (selectedIndex > 0) {
        //         event.object.scrollToIndex(selectedIndex, false);
        //     }
        // }
    }
    async function deletePlaylistItem(item: PlaylistItem) {
        const index = playlist.findIndex((d) => item === d);
        if (index !== -1) {
            if (index === 0) {
                await getBGServiceInstance().storyHandler.handleOnPlayingEndPlaylist();
                //refresh first item
                const firstItem = playlist.getItem(0);
                playlist.setItem(0, firstItem);
            } else {
                playlist.splice(index, 1);
            }
        }
        // if (selectedIndex !== undefined) {
        //     if (onlyOneSelected) {
        //         currentlyCheckedItem = options instanceof ObservableArray ? options.getItem(selectedIndex) : options[selectedIndex];
        //     }
        //     if (selectedIndex > 0) {
        //         event.object.scrollToIndex(selectedIndex, false);
        //     }
        // }
    }
    function drawerTranslationFunction(side, width, value, delta, progress) {
        const result = {
            mainContent: {
                translateX: -delta
            },
            rightDrawer: {
                translateX: width - delta
            },
            backDrop: {
                translateX: -delta,
                opacity: progress * 0.1
            }
        } as any;

        return result;
    }
</script>

<gesturerootview columns={containerColumns} rows="auto">
    <gridlayout {backgroundColor} {borderRadius} columns={`${width}`} {height} rows="auto,*" {...$$restProps}>
        <label class="actionBarTitle" fontWeight="bold" margin="10 10 0 10" text={lc('playlist')} />
        <collectionView items={playlist} row={1} {rowHeight} on:dataPopulated={onDataPopulated} ios:contentInsetAdjustmentBehavior={2}>
            <Template let:index let:item>
                <swipemenu
                    gestureHandlerOptions={{
                        failOffsetYStart: -40,
                        failOffsetYEnd: 40,
                        minDist: 50
                    }}
                    rightSwipeDistance={0}
                    rows="*"
                    startingSide={item.startingSide}
                    translationFunction={drawerTranslationFunction}>
                    <ListItemAutoSize
                        {borderRadius}
                        prop:mainContent
                        columns="auto,*,auto"
                        {fontSize}
                        {fontWeight}
                        {iconFontSize}
                        item={{
                            rightValue: item.rightValue,
                            title: item.pack?.title || item.story.name,
                            subtitle: item.story ? formatDuration(item.story.duration) : null
                        }}
                        mainCol={1}
                        showBottomLine={showBorders}
                        on:tap={(event) => onTap(item, event)}>
                        <image borderRadius={4} col={0} height={45} marginRight={10} src={item.story?.thumbnail || (item.pack || item.story.pack).getThumbnail()} />
                        <label
                            class="mdi"
                            col={2}
                            color={colorOnBackground}
                            fontSize={20}
                            padding={16}
                            text="mdi-poll"
                            verticalAlignment="center"
                            visibility={item === playlist.getItem(0) ? 'visible' : 'hidden'} />
                    </ListItemAutoSize>
                    <label
                        class="mdi"
                        backgroundColor={colorError}
                        color={colorOnError}
                        prop:rightDrawer
                        fontSize={24}
                        rippleColor={colorOnError}
                        text="mdi-trash-can"
                        textAlignment="center"
                        verticalTextAlignment="middle"
                        width={80}
                        on:tap={(e) => deletePlaylistItem(item)} />
                </swipemenu>
            </Template>
        </collectionView>
    </gridlayout>
</gesturerootview>
