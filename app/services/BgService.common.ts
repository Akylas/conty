import { Application } from '@nativescript/core';
import { ApplicationEventData } from '@nativescript/core/application';
import { Observable } from '@nativescript/core/data/observable';
import { onDestroy } from 'svelte';
import { StoryHandler } from '~/handlers/StoryHandler';

export const BgServiceLoadedEvent = 'BgServiceLoadedEvent';
export const BgServiceStartedEvent = 'BgServiceStartedEvent';
export const BgServiceErrorEvent = 'BgServiceErrorEvent';

const TAG = '[BgServiceCommon]';

let mSharedInstance: BgServiceCommon;
let onServiceLoadedListeners = [];
export function onServiceLoaded(callback: (storyHandler: StoryHandler) => void) {
    if (mSharedInstance) {
        callback(mSharedInstance.storyHandler);
    } else {
        onServiceLoadedListeners.push(callback);
    }
}
let onServiceStartedListeners = [];
export function onServiceStarted(callback: (storyHandler: StoryHandler) => void) {
    if (mSharedInstance?.started) {
        callback(mSharedInstance.storyHandler);
    } else {
        onServiceStartedListeners.push(callback);
    }
}
const onSetupListeners = [];
export function onSetup(callback: (storyHandler: StoryHandler) => void) {
    let cleaned = false;
    function clean() {
        if (!cleaned) {
            cleaned = true;
            const index = onSetupListeners.indexOf(callback);
            if (index >= 0) {
                onSetupListeners.splice(index, 1);
            }
        }
    }
    if (mSharedInstance?.loaded) {
        callback(mSharedInstance.storyHandler);
    }
    onSetupListeners.push(callback);
    onDestroy(() => {
        clean();
    });
}
const onUnsetupListeners = [];
export function onUnsetup(callback: (storyHandler: StoryHandler) => void) {
    // if (!mSharedInstance?.loaded) {
    //     callback(mSharedInstance.storyHandler);
    // }
    let cleaned = false;
    function clean() {
        if (!cleaned) {
            cleaned = true;
            const index = onUnsetupListeners.indexOf(callback);
            if (index >= 0) {
                onUnsetupListeners.splice(index, 1);
            }
        }
    }
    onUnsetupListeners.push(callback);
    onDestroy(() => {
        callback(mSharedInstance.storyHandler);
        clean();
    });
}
export function isServiceStarted() {
    return mSharedInstance?.started;
}
const onServiceUnloadedListeners = [];
export function onServiceUnloaded(callback: (storyHandler: StoryHandler) => void) {
    onServiceUnloadedListeners.push(callback);
}

export abstract class BgServiceCommon extends Observable {
    abstract get storyHandler(): StoryHandler;
    protected _loaded = false;
    protected _started = false;
    appInBackground = true;
    bgService?: WeakRef<any>; //android only

    constructor() {
        super();
    }
    get loaded() {
        return this._loaded;
    }
    get started() {
        return this._started;
    }
    protected _handlerLoaded() {
        if (!this._loaded) {
            this._loaded = true;

            mSharedInstance = this;
            onServiceLoadedListeners.forEach((l) => l(this.storyHandler));
            onSetupListeners.forEach((l) => l(this.storyHandler));
            onServiceLoadedListeners = [];
            this.notify({
                eventName: BgServiceLoadedEvent,
                object: this
            });
        }
    }

    async stop() {
        if (!this._started) {
            return;
        }
        try {
            this._started = false;

            Application.off(Application.backgroundEvent, this.onAppBackground, this);
            Application.off(Application.foregroundEvent, this.onAppForeground, this);
            DEV_LOG && console.log(TAG, 'stop');
            await this.storyHandler.stop();
        } catch (error) {
            console.error(error);
            this.notify({
                eventName: BgServiceErrorEvent,
                object: this,
                error
            });
        }
    }
    async start() {
        if (this._started) {
            return;
        }
        try {
            this._started = true;
            DEV_LOG && console.log(TAG, 'start');

            Application.on(Application.backgroundEvent, this.onAppBackground, this);
            Application.on(Application.foregroundEvent, this.onAppForeground, this);
            await this.storyHandler.start();
            this.notify({
                eventName: BgServiceStartedEvent,
                object: this
            });

            onServiceStartedListeners.forEach((l) => l(this.storyHandler));
            onServiceStartedListeners = [];
        } catch (error) {
            console.error(error);
            this.notify({
                eventName: BgServiceErrorEvent,
                object: this,
                error
            });
        }
    }

    onAppForeground(args: ApplicationEventData) {
        if (!this.appInBackground) {
            return;
        }
        DEV_LOG && console.log(this.constructor.name, 'onAppForeground');
        onSetupListeners.forEach((l) => l(this.storyHandler));
        this.appInBackground = false;
    }
    onAppBackground(args: ApplicationEventData) {
        if (this.appInBackground) {
            return;
        }
        DEV_LOG && console.log(this.constructor.name, 'onAppBackground');
        onUnsetupListeners.forEach((l) => l(this.storyHandler));
        this.appInBackground = true;
    }
    // updateNotifText(text: string) {}
    appExited = false;
    handleAppExit() {
        this.appExited = true;
        DEV_LOG && console.log('handleAppExit', this.storyHandler.isPlaying);
        if (this.storyHandler.isPlaying) {
            this.storyHandler.appExited = true;
            Application.on('shouldStopBgService', () => {
                this.stop();
            });
            return;
        }
        this.stop();
    }
}
