<svelte:options accessors={true} />

<script context="module" lang="ts">
    import { conditionalEvent } from '~/utils/svelte/ui';
    import { colors, windowInset } from '~/variables';
</script>

<script lang="ts">
    export let longPress: Function = null;
    export let text: string = null;
    export let progress: number = null;

    export let translateY = 100;

    $: DEV_LOG && console.log('progress', progress);
    // technique for only specific properties to get updated on store change
    $: ({ colorOnSurface, colorSurfaceContainer } = $colors);
</script>

<gridlayout
    backgroundColor={colorSurfaceContainer}
    borderRadius={4}
    columns="*"
    elevation={4}
    margin={`0 24 ${$windowInset.bottom + 5} 24`}
    rows="46,4"
    {translateY}
    verticalAlignment="bottom"
    {...$$restProps}
    on:tap
    use:conditionalEvent={{ condition: !!longPress, event: 'longPress', callback: longPress }}>
    <label color={colorOnSurface} fontSize={14} fontWeight="500" maxLines={2} padding="10 12 10 12" rowSpan={2} {text} verticalTextAlignment="center" />
    <mdprogress backgroundColor="transparent" busy={progress === -1} indeterminate={progress === -1} row={1} value={progress} visibility={progress !== null ? 'visible' : 'collapse'} />
</gridlayout>
