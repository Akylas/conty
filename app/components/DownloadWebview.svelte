<script context="module" lang="ts">
    import { lc } from '@nativescript-community/l';
    import { closeBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { closeModal } from 'svelte-native';
    import { colors } from '~/variables';
</script>

<script lang="ts">
    let colorSurfaceContainer = $colors.colorSurfaceContainer;
    // technique for only specific properties to get updated on store change
    $: ({ colorSurfaceContainer } = $colors);
    export let url = null;
    function onShouldOverrideUrlLoading(args: { url; httpMethod; cancel }) {
        DEV_LOG && console.log('onShouldOverrideUrlLoading', url.endsWith('.zip'), args.url);
        if (args.url.endsWith('.zip')) {
            args.cancel = true;
            closeBottomSheet(args.url);
        }
    }
</script>

<gesturerootview {...$$restProps} height={400} rows="auto,*">
    <label fontSize={16} margin={10} text={lc('download_webview_description')} textAlignment="center" />
    <awebview row={1} src={url} on:shouldOverrideUrlLoading={onShouldOverrideUrlLoading} />
</gesturerootview>
