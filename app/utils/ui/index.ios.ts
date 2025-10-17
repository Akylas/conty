import { alert } from '@nativescript-community/ui-material-dialogs';
import { GridLayout, View } from '@nativescript/core';
import { ComponentInstanceInfo, resolveComponentElement } from '@nativescript-community/svelte-native/dom';
import type ParentalGate__SvelteComponent_ from '~/components/security/ParentalGate.svelte';
import { showSettings as showSettingsCommon } from './index.common';

export * from './index.common';

export async function showParentalGate() {
    if (!PRODUCTION && !TEST_PARENTAL_GATE) {
        return true;
    }
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

export async function showSettings(props?, options?) {
    const parentalGate = await showParentalGate();
    if (!parentalGate) {
        return;
    }
    return showSettingsCommon(props, options);
}
