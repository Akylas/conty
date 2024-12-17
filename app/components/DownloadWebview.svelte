<script context="module" lang="ts">
    import { lc } from '@nativescript-community/l';
    import { alert } from '@nativescript-community/ui-material-dialogs';
    import { closeBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { closeModal } from 'svelte-native';
    import { colors } from '~/variables';
    import IconButton from './common/IconButton.svelte';
    import { openUrl } from '@nativescript/core/utils';
    import { showError } from '@shared/utils/showError';
</script>

<script lang="ts">
    let colorSurfaceContainer = $colors.colorSurfaceContainer;
    // technique for only specific properties to get updated on store change
    $: ({ colorSurfaceContainer } = $colors);
    export let url = null;
    let blobUrl;
    let currentUrl = url;

    function onShouldOverrideUrlLoading(args: { url; httpMethod; cancel }) {
        DEV_LOG && console.log('onShouldOverrideUrlLoading', url.endsWith('.zip'), args.url);
        if (!args.url.startsWith('about:')) {
            currentUrl = args.url;
            // if (args.url.startsWith('blob:http')) {
            //     // if (__ANDROID__) {
            //     args.cancel = true;
            //     closeBottomSheet(currentUrl);
            //     // } else {
            //     //     blobUrl = currentUrl;
            //     // }
            // } else
            if (currentUrl.endsWith('.zip')) {
                args.cancel = true;
                closeBottomSheet(currentUrl);
            }
        }
    }
    function onLoadFinished({ url }) {
        DEV_LOG && console.log('onLoadFinished', url);
        if (__IOS__ && blobUrl) {
            closeBottomSheet(blobUrl);
        }
    }
    async function openInExternal() {
        try {
            openUrl(currentUrl);
        } catch (error) {
            showError(error);
        }
    }
</script>

<gesturerootview {...$$restProps} height={400} rows="auto,*">
    <label fontSize={16} margin="10 40 10 40" text={lc('download_webview_description')} textAlignment="center" />
    <IconButton horizontalAlignment="right" text="mdi-open-in-new" on:tap={openInExternal} />
    <webview domStorage={true} row={1} src={url} userAgent="desktop" on:shouldOverrideUrlLoading={onShouldOverrideUrlLoading} on:loadFinished={onLoadFinished} />
</gesturerootview>
