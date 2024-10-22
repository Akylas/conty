<script context="module" lang="ts">
    import { Canvas, CanvasView, Paint } from '@nativescript-community/ui-canvas';
    import { conditionalEvent, createEventDispatcher } from '@shared/utils/svelte/ui';
    import { colors, fontScale } from '~/variables';
    import { ListItem } from './ListItem';
    const linePaint = new Paint();
    linePaint.strokeWidth = 1;
</script>

<script lang="ts">
    const dispatch = createEventDispatcher();
    // technique for only specific properties to get updated on store change
    let { colorOnSurface, colorOnSurfaceDisabled, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors;
    $: ({ colorOnSurface, colorOnSurfaceDisabled, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors);

    $: linePaint.color = colorOutlineVariant;
    export let showBottomLine: boolean = false;
    // export let iconFontSize: number = 24;
    export let fontSize: number = 17;
    export let fontWeight: any = 'normal';
    export let subtitleFontSize: number = 14;
    export let titleColor: string = null;
    export let subtitleColor: string = null;
    export let columns: string = '*,auto';
    export let mainCol = 0;
    export let item: ListItem;
    export let onLinkTap: (event) => void = null;
    export let onDraw: (item: ListItem, event: { canvas: Canvas; object: CanvasView }) => void = null;

    function draw(event: { canvas: Canvas; object: CanvasView }) {
        const canvas = event.canvas;
        const h = canvas.getHeight();
        const w = canvas.getWidth();

        if (showBottomLine) {
            event.canvas.drawLine(20, h - 1, w, h - 1, linePaint);
        }
        (item.onDraw || onDraw)?.(item, event);
    }

    $: addedPadding = (item.subtitle?.length > 0 ? 6 : 10) + (__ANDROID__ ? 8 : 12);
</script>

<!-- <gridlayout>
    <gridlayout {columns} rippleColor={colorOnSurface} on:tap={(event) => dispatch('tap', event)} {...$$restProps} padding="10 16 10 16">
        <canvaslabel col={mainCol} color={titleColor} on:draw={onDraw}>
            <cgroup paddingBottom={subtitle ? 10 : 0} verticalAlignment="middle">
                <cspan
                    fontFamily={leftIconFonFamily}
                    fontSize={iconFontSize * $fontScale}
                    paddingLeft="10"
                    text={leftIcon}
                    visibility={leftIcon ? 'visible' : 'hidden'}
                    width={iconFontSize * 2} />
            </cgroup>
            <cgroup paddingLeft={(leftIcon ? iconFontSize * 2 : 0) + extraPaddingLeft} textAlignment="left" verticalAlignment="middle">
                <cspan fontSize={fontSize * $fontScale} {fontWeight} text={title} />
                <cspan color={subtitleColor} fontSize={subtitleFontSize * $fontScale} text={subtitle ? '\n' + subtitle : ''} visibility={subtitle ? 'visible' : 'hidden'} />
            </cgroup>
        </canvaslabel>
        <slot />
    </gridlayout>
</gridlayout> -->

<canvasview
    {columns}
    padding="0 16 0 16"
    rippleColor={item.rippleColor || item.color || colorOnSurface}
    on:tap={(event) => dispatch('tap', event)}
    on:longPress={(event) => dispatch('longPress', event)}
    on:draw={draw}
    {...$$restProps}>
    <!-- <label
        fontFamily={leftIconFonFamily}
        fontSize={iconFontSize}
        marginLeft="-10"
        text={leftIcon}
        verticalAlignment="middle"
        visibility={!!leftIcon ? 'visible' : 'collapse'}
        width={iconFontSize * 2} /> -->
    <stacklayout col={mainCol} paddingBottom={addedPadding} paddingTop={addedPadding} verticalAlignment="center" {...$$restProps?.titleHolderProps}>
        <label
            color={item.titleColor || item.color || titleColor || colorOnSurface}
            disableCss={true}
            fontSize={(item.fontSize || fontSize) * $fontScale}
            {fontWeight}
            html={item.html}
            text={item.text || item.title || item.name}
            textWrap={true}
            {...$$restProps?.titleProps}
            use:conditionalEvent={{ condition: !!onLinkTap, event: 'linkTap', callback: onLinkTap }}>
        </label>
        <label
            color={item.subtitleColor || subtitleColor || colorOnSurfaceVariant}
            disableCss={true}
            fontSize={(item.subtitleFontSize || subtitleFontSize) * $fontScale}
            text={item.subtitle}
            textWrap={true}
            use:conditionalEvent={{ condition: !!onLinkTap, event: 'linkTap', callback: onLinkTap }}
            {...$$restProps.subtitleProps || {}}>
        </label>
    </stacklayout>

    <!-- <label
        col={1}
        color={subtitleColor}
        disableCss={true}
        fontSize={subtitleFontSize * $fontScale}
        marginLeft={16}
        text={typeof item.rightValue === 'function' ? item.rightValue() : item.rightValue}
        textAlignment="right"
        verticalAlignment="middle"
        visibility={!!item.rightValue ? 'visible' : 'collapse'}
        on:tap={(event) => dispatch('rightIconTap', event)} /> -->
    <slot />
</canvasview>
