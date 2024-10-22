<script lang="ts">
    import { Canvas, CanvasView } from '@nativescript-community/ui-canvas';
    import { createEventDispatcher } from '@shared/utils/svelte/ui';
    import { colors, fontScale, fonts } from '~/variables';
    import { ListItem } from './ListItem';
    $: ({ colorOnSurface, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors);
    const dispatch = createEventDispatcher();
    // technique for only specific properties to get updated on store change
    export let showBottomLine: boolean = false;
    export let extraPaddingLeft: number = 0;
    export let iconFontSize: number = 24;
    export let fontSize: number = 17;
    export let fontWeight: string | number = 500;
    export let subtitleFontSize: number = 14;
    export let columns: string = '*';
    export let mainCol = 0;
    export let leftIconFonFamily: string = $fonts.mdi;
    // export let color: string = colorOnSurface;
    // export let subtitleColor: string = null;
    export let item: ListItem;
    export let onDraw: (item: ListItem, event: { canvas: Canvas; object: CanvasView }) => void = null;
</script>

<canvasview {columns} padding="0 16 0 16" rippleColor={item.rippleColor || colorPrimary} on:tap={(event) => dispatch('tap', event)} {...$$restProps}>
    <canvaslabel
        col={mainCol}
        color={item.color || colorOnSurface}
        on:draw={(event) => {
            (item.onDraw || onDraw)?.(item, event);
        }}>
        <cgroup paddingBottom={item.subtitle ? 10 : 0} verticalAlignment="middle">
            <cspan
                fontFamily={leftIconFonFamily}
                fontSize={(item.iconFontSize || iconFontSize) * $fontScale}
                paddingLeft="10"
                text={item.icon}
                visibility={item.icon ? 'visible' : 'hidden'}
                width={(item.iconFontSize || iconFontSize) * 2} />
        </cgroup>
        <cgroup paddingLeft={(item.icon ? iconFontSize * 2 : 0) + extraPaddingLeft} textAlignment="left" verticalAlignment="middle">
            <cspan fontSize={(item.fontSize || fontSize) * $fontScale} {fontWeight} text={item.title || item.name} />
            <cspan
                color={item.subtitleColor || colorOnSurfaceVariant}
                fontSize={(item.subtitleFontSize || subtitleFontSize) * $fontScale}
                text={item.subtitle ? '\n' + item.subtitle : ''}
                visibility={item.subtitle ? 'visible' : 'hidden'} />
        </cgroup>
    </canvaslabel>
    <slot />
    {#if showBottomLine}
        <line color={colorOutlineVariant} height="1" startX="20" startY="0" stopX="100%" stopY="0" strokeWidth="1" verticalAlignment="bottom" />
    {/if}
</canvasview>
