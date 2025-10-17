<script lang="ts">
    import { NativeViewElementNode } from '@nativescript-community/svelte-native/dom';
    import CActionBar from './CActionBar.svelte';
    import { TextField } from '@nativescript-community/ui-material-textfield';
    import { showError } from '@shared/utils/showError';
    import { colors } from '~/variables';
    import { Pack, PackFolder } from '~/models/Pack';

    export let folder: PackFolder = null;
    export let editingTitle = false;
    export let labelsDefaultVisualState = null;
    export let buttonsDefaultVisualState = null;
    let editingTitleTextField: NativeViewElementNode<TextField>;

    async function saveDocumentTitle(event) {
        try {
            editingTitleTextField.nativeElement.clearFocus();
            DEV_LOG && console.log('saveDocumentTitle', editingTitleTextField.nativeElement.text);
            await folder.save({
                name: editingTitleTextField.nativeElement.text
            });
            editingTitle = false;
        } catch (error) {
            showError(error);
        }
    }
    async function onTextFieldFocus(event) {
        try {
            const textField = event.object as TextField;
            textField.setSelection(textField.text.length);
            textField.requestFocus();
        } catch (error) {
            showError(error);
        }
    }
</script>

<CActionBar {buttonsDefaultVisualState} forceCanGoBack={true} {labelsDefaultVisualState} onGoBack={() => (editingTitle = false)} title={null} {...$$restProps}>
    <textfield
        bind:this={editingTitleTextField}
        slot="center"
        backgroundColor="transparent"
        col={1}
        defaultVisualState={labelsDefaultVisualState}
        android:padding="4 0 4 0"
        text={folder.name}
        verticalTextAlignment="center"
        on:returnPress={saveDocumentTitle}
        on:layoutChanged={onTextFieldFocus} />
    <mdbutton class="actionBarButton" defaultVisualState={buttonsDefaultVisualState} text="mdi-content-save" variant="text" on:tap={saveDocumentTitle} />
</CActionBar>
