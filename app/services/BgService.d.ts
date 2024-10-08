import { StoryHandler } from '~/handlers/StoryHandler';
import { Observable } from '@nativescript/core';

export const BgServiceLoadedEvent: string;

export class BgService extends Observable {
    handleAppExit();
    readonly storyHandler: StoryHandler;
    readonly loaded: boolean;
    readonly started: boolean;
    start();
    stop();
    isBatteryOptimized(): boolean;
    checkBatteryOptimDisabled(): Promise<boolean>;
    // isAccessibilityServiceEnabled(): boolean;
    // enableAccessibilityService(): Promise<boolean>;
}
export function getBGServiceInstance(): BgService;
