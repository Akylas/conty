import { showSettings as showSettingsCommon } from './index.common';

export * from './index.common';

export async function showParentalGate() {
    return true;
}
export async function showSettings(props?) {
    return showSettingsCommon(props);
}
