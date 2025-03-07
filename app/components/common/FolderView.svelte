<svelte:options accessors />

<script lang="ts">
    import { onMount } from 'svelte';
    import { lc } from '~/helpers/locale';
    import MiniSearch from '@shared/utils/minisearch';
    import SqlQuery from '@akylas/kiss-orm/dist/Queries/SqlQuery';
    import { PackFolder } from '~/models/Pack';
    import { documentsService } from '~/services/documents';
    import { createEventDispatcher } from '@shared/utils/svelte/ui';

    const dispatch = createEventDispatcher();
    let closeCallback: Function;
    let foundFolders: PackFolder[] = [];
    export let topFolder: string = null;
    export let defaultFolder: string = null;
    export let currentFolderText: string = null;
    export let folders = null;
    export let showDefaultFolders = true;
    export let padding: string | number = 20;

    const miniSearch = new MiniSearch({
        fields: ['name'], // fields to index for full-text search
        storeFields: ['name']
    });

    onMount(async () => {
        if (!folders) {
            folders = await documentsService.folderRepository.search({ where: SqlQuery.createFromTemplateString`name <> 'none'` });
        }
        if (showDefaultFolders) {
            foundFolders = folders.slice(0, 4);
        }
        miniSearch.addAll(folders);
        if (defaultFolder) {
            currentFolderText = defaultFolder;
            foundFolders = miniSearch.search(currentFolderText, { fuzzy: 0.2 }) as any as PackFolder[];
        }
    });
    function onTextChange(e) {
        currentFolderText = e['value'];
        foundFolders = miniSearch.search(currentFolderText, { fuzzy: 0.2 }) as any as PackFolder[];
        if (folders && foundFolders.length === 0 && showDefaultFolders) {
            foundFolders = folders.slice(0, 4);
        }
    }

    function setFolderName(name: string) {
        currentFolderText = name;
        closeCallback?.(true);
        dispatch('folderSelected', { group: currentFolderText });
        // currentFolderText = null;
        foundFolders = [];
    }
    function onFolderTap(group) {
        setFolderName(group.name);
    }
    function onKeyboardReturn() {
        setFolderName(currentFolderText);
    }
</script>

<gesturerootview {...$$restProps} {padding} rows="auto,auto,auto,auto" on:layoutChanged={(e) => (closeCallback = e.object['bindingContext']?.closeCallback)}>
    <mdbutton height={30} horizontalAlignment="left" margin="2" text={topFolder} visibility={topFolder ? 'visible' : 'collapse'} />
    <textfield hint={lc('folder')} placeholder={lc('folder')} returnKeyType="done" row={1} text={defaultFolder} variant="outline" on:textChange={onTextChange} on:returnPress={onKeyboardReturn} />
    {#if foundFolders.length > 0}
        <label marginTop={15} row={2} text={lc('existing_folders')} />
        <wraplayout margin={5} row={3}>
            {#each foundFolders as group}
                <mdbutton height={30} margin="2" text={group.name} on:tap={() => onFolderTap(group)} />
            {/each}
        </wraplayout>
    {/if}
</gesturerootview>
