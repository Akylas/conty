import { showModal } from '@shared/utils/svelte/ui';
import { showSettings as showSettingsCommon } from './index.common';

export * from './index.common';

export async function showParentalGate() {
    const component = (await import('~/components/security/ParentalGate.svelte')).default;
    DEV_LOG && console.log('showFullscreenPlayer');
    // if (__IOS__) {
    const result = showModal({
        page: component
    } as any);
    return result;
}

export async function showSettings(props?) {
    const parentalGate = await showParentalGate();
    if (!parentalGate) {
        return;
    }
    return showSettingsCommon();
}
