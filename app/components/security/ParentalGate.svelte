<svelte:options accessors={true} />

<script context="module" lang="ts">
    import { lc } from '@nativescript-community/l';
    import { Color } from '@nativescript/core';
    import { closeModal } from '@shared/utils/svelte/ui';
    import { colors } from '~/variables';

    const numberStrMap = {
        1: lc('one'),
        2: lc('two'),
        3: lc('three'),
        4: lc('four'),
        5: lc('five'),
        6: lc('six'),
        7: lc('seven'),
        8: lc('eight'),
        9: lc('nine')
    };

    function getRandomInt(min: number, max: number, ignore: number[]) {
        min = Math.ceil(min);
        max = Math.floor(max);

        let result: number;
        while (!result || ignore.indexOf(result) !== -1) {
            result = Math.floor(Math.random() * (max - min + 1)) + min;
        }
        return result;
    }
</script>

<script lang="ts">
    export let onClose = null;
    const randomNumbers: number[] = [];
    for (let index = 0; index < 3; index++) {
        randomNumbers.push(getRandomInt(1, 9, randomNumbers));
    }
    const text = randomNumbers.map((n) => numberStrMap[n]).join(' ');
    let selectedNumbers = [];
    function selectNumber(n) {
        const isSelected = selectedNumbers.indexOf(n) !== -1;
        if (isSelected) {
            selectedNumbers.splice(selectedNumbers.indexOf(n), 1);
        } else if (selectedNumbers.length < 3) {
            selectedNumbers.push(n);
        }
        selectedNumbers = selectedNumbers; // for svelte update
        if (selectedNumbers.length === 3) {
            if (JSON.stringify(selectedNumbers.map((n) => parseInt(n, 10)).sort()) === JSON.stringify(randomNumbers.sort())) {
                onClose(true);
            } else {
                selectedNumbers = [];
            }
        }
    }
    // technique for only specific properties to get updated on store change
    let { colorOnSurface, colorPrimary } = $colors;
    $: ({ colorOnSurface, colorPrimary } = $colors);
</script>

<gesturerootview rows="auto,auto" {...$$restProps} padding={16}>
    <label color={colorOnSurface} fontSize={17} fontWeight="400" lineHeight={26} marginBottom={10} textAlignment="center" verticalTextAlignment="center">
        <cspan fontSize={24} fontWeight="bold" text={lc('ask_parents') + '\n\n'} />
        <cspan text={lc('match_numbers') + '\n'} />
        <cspan color={colorPrimary} fontSize={21} fontWeight="bold" {text} />
    </label>
    <gridlayout columns="auto,auto,auto" horizontalAlignment="center" row={1} rows="auto,auto,auto">
        {#each Object.keys(numberStrMap) as n}
            <mdbutton
                backgroundColor={selectedNumbers.indexOf(n) !== -1 ? new Color(colorPrimary).setAlpha(100).hex : 'transparent'}
                borderColor={colorOnSurface}
                borderWidth={1}
                col={(parseInt(n, 10) - 1) % 3}
                color={colorOnSurface}
                height={70}
                margin={5}
                row={Math.floor((parseInt(n, 10) - 1) / 3)}
                shape="round"
                text={n}
                variant="outline"
                width={70}
                on:tap={() => selectNumber(n)} />
        {/each}
    </gridlayout>
</gesturerootview>
