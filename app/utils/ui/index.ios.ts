import { showModal } from '@shared/utils/svelte/ui';
import { showSettings as showSettingsCommon } from './index.common';
import type ParentalGate__SvelteComponent_ from '~/components/security/ParentalGate.svelte';
import { ComponentInstanceInfo, resolveComponentElement } from 'svelte-native/dom';
import { GridLayout, View } from '@nativescript/core';
import { alert } from '@nativescript-community/ui-material-dialogs';
import { lc } from '@nativescript-community/l';

export * from './index.common';

export async function showParentalGate() {
    const component = (await import('~/components/security/ParentalGate.svelte')).default;
    let componentInstanceInfo: ComponentInstanceInfo<GridLayout, ParentalGate__SvelteComponent_>;
    try {
        componentInstanceInfo = resolveComponentElement(component, {
            onClose: (result) => {
                view.bindingContext.closeCallback(result);
            }
        }) as ComponentInstanceInfo<GridLayout, ParentalGate__SvelteComponent_>;
        const view: View = componentInstanceInfo.element.nativeView;
        const result = await alert({
            view,
            okButtonText: null
        });
        return result;
    } catch (err) {
        throw err;
    } finally {
        componentInstanceInfo.element.nativeElement._tearDownUI();
        componentInstanceInfo.viewInstance.$destroy();
        componentInstanceInfo = null;
    }
}

export async function showSettings(props?) {
    const parentalGate = await showParentalGate();
    if (!parentalGate) {
        return;
    }
    return showSettingsCommon();
}
