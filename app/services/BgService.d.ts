import { StoryHandler } from '~/handlers/StoryHandler';
import { Observable } from '@nativescript/core';

export const BgServiceLoadedEvent: string;

export class BgService extends Observable {
    readonly storyHandler: StoryHandler;
    readonly loaded: boolean;
    readonly started: boolean;
    start();
    stop();
}
export function getBGServiceInstance(): BgService;
