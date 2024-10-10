<!-- <svelte:options accessors /> -->

<script context="module" lang="ts">
    import { lc } from '@nativescript-community/l';
    import { closeBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { Screen } from '@nativescript/core';
    import { Template } from 'svelte-native/components';
    import ListItemAutoSize from '~/components/common/ListItemAutoSize.svelte';
    import { PlaylistItem } from '~/handlers/StoryHandler';
    import { formatDuration } from '~/helpers/formatter';
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
    let { colorBackground, colorOnBackground } = $colors;
    $: ({ colorBackground, colorOnBackground } = $colors);

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
</script>

<gesturerootview columns={containerColumns} rows="auto">
    <gridlayout {backgroundColor} {borderRadius} columns={`${width}`} {height} rows="auto,*" {...$$restProps}>
        <label class="actionBarTitle" fontWeight="bold" margin="10 10 0 10" text={lc('playlist')} />
        <collectionView items={playlist} row={1} {rowHeight} on:dataPopulated={onDataPopulated} ios:contentInsetAdjustmentBehavior={2}>
            <Template let:index let:item>
                <ListItemAutoSize
                    {borderRadius}
                    columns="auto,*"
                    {fontSize}
                    {fontWeight}
                    {iconFontSize}
                    mainCol={1}
                    rightValue={item.rightValue}
                    showBottomLine={showBorders}
                    subtitle={item.story ? formatDuration(item.story.duration) : null}
                    title={item.pack?.title || item.story.name}
                    on:tap={(event) => onTap(item, event)}>
                    <image borderRadius={4} col={0} height={45} marginRight={10} src={item.story?.thumbnail || (item.pack || item.story.pack).getThumbnail()} />
                    <label
                        class="mdi"
                        color={colorOnBackground}
                        fontSize={20}
                        horizontalAlignment="right"
                        paddingBottom={15}
                        paddingRight={15}
                        text="mdi-poll"
                        verticalAlignment="bottom"
                        visibility={index === 0 ? 'visible' : 'hidden'} />
                </ListItemAutoSize>
            </Template>
        </collectionView>
    </gridlayout>
</gesturerootview>
