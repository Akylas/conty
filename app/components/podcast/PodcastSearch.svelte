<script context="module" lang="ts">
    import { ObservableArray } from '@nativescript/core';
    import { Template } from '@nativescript-community/svelte-native/components';
    import ActionBarSearch from '@shared/components/ActionBarSearch.svelte';
    import CActionBar from '@shared/components/CActionBar.svelte';
    import { onMount } from 'svelte';
    import { showError } from '@shared/utils/showError';
    import { goBack } from '@shared/utils/svelte/ui';
    import { l, lc } from '~/helpers/locale';
    import { PodcastSearchResult, searchPodcasts } from '~/services/podcast/podcastIndex';
    import { podcastService } from '~/services/podcasts';
    import { hideLoading, showLoading } from '~/utils/ui';
    import { actionBarButtonHeight, colors, fontScale, windowInset } from '~/variables';
</script>

<script lang="ts">
    let { colorOnSurfaceVariant, colorSurfaceContainer } = $colors;
    $: ({ colorOnSurfaceVariant, colorSurfaceContainer } = $colors);

    let results: ObservableArray<PodcastSearchResult> = null;
    let loading = false;
    let searched = false;
    let searchField: ActionBarSearch;
    // only the answer to the last typed term is shown
    let currentTerm: string | undefined;

    async function search(force?: boolean, term?: string) {
        currentTerm = term;
        if (!term) {
            results = null;
            searched = false;
            loading = false;
            return;
        }
        loading = true;
        try {
            const found = await searchPodcasts(term);
            if (term === currentTerm) {
                results = new ObservableArray(found);
                searched = true;
            }
        } catch (error) {
            if (term === currentTerm) {
                showError(error);
            }
        } finally {
            if (term === currentTerm) {
                loading = false;
            }
        }
    }

    onMount(() => searchField?.showSearch());

    async function subscribe(result: PodcastSearchResult) {
        showLoading(lc('loading'));
        try {
            await podcastService.addByUrl(result.feedUrl);
            goBack();
        } catch (error) {
            showError(error);
        } finally {
            hideLoading();
        }
    }
</script>

<page actionBarHidden={true}>
    <gridlayout paddingLeft={$windowInset.left} paddingRight={$windowInset.right} rows="auto,*">
        <collectionView items={results} row={1} rowHeight={96 * $fontScale} android:paddingBottom={$windowInset.bottom}>
            <Template let:item>
                <gridlayout backgroundColor={colorSurfaceContainer} borderRadius={12} columns="72,*" margin="4 10 4 10" padding={10} on:tap={() => subscribe(item)}>
                    <image borderRadius={8} decodeWidth={200} height={72} src={item.image} stretch="aspectFill" width={72} />
                    <stacklayout col={1} marginLeft={12} verticalAlignment="center">
                        <label fontSize={16 * $fontScale} fontWeight="bold" lineBreak="end" maxLines={2} text={item.title} />
                        <label color={colorOnSurfaceVariant} fontSize={13 * $fontScale} lineBreak="end" maxLines={2} text={item.author || item.description} />
                    </stacklayout>
                </gridlayout>
            </Template>
        </collectionView>
        {#if loading}
            <activityindicator busy={true} height={$actionBarButtonHeight} horizontalAlignment="center" row={1} verticalAlignment="center" width={$actionBarButtonHeight} />
        {:else if searched && results?.length === 0}
            <label color={colorOnSurfaceVariant} fontSize={19} horizontalAlignment="center" row={1} text={lc('no_results')} verticalAlignment="center" />
        {/if}
        <CActionBar onGoBack={() => goBack()} title={l('search_podcast')}>
            <ActionBarSearch bind:this={searchField} slot="center" delay={800} hideOnClear={false} refresh={search} visible={true} />
        </CActionBar>
    </gridlayout>
</page>
