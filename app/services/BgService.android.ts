import { Utils } from '@nativescript/core';
import { BgService as AndroidBgService } from '~/services/android/BgService';
import { BgServiceBinder, IBgServiceBinder } from '~/services/android/BgServiceBinder';
import { BgServiceCommon, BgServiceLoadedEvent } from '~/services/BgService.common';
import { NotificationHelper } from './android/NotificationHelper';

export { BgServiceLoadedEvent };

const Intent = android.content.Intent;
const TAG = '[BgService]';

export class BgService extends BgServiceCommon {
    private serviceConnection: android.content.ServiceConnection;
    declare bgService: WeakRef<AndroidBgService>;
    context: android.content.Context;
    constructor() {
        super();
        this.serviceConnection = new android.content.ServiceConnection({
            onServiceDisconnected: (name: android.content.ComponentName) => {
                this.unbindService();
            },
            onServiceConnected: (name: android.content.ComponentName, binder: android.os.IBinder) => {
                this.handleBinder(binder);
            },
            onNullBinding(param0: globalAndroid.content.ComponentName) {},
            onBindingDied(param0: globalAndroid.content.ComponentName) {}
        });
        this.context = Utils.android.getApplicationContext();
    }

    bindService(context: android.content.Context, intent) {
        const result = context.bindService(intent, this.serviceConnection, android.content.Context.BIND_AUTO_CREATE);
        if (!result) {
            console.error('could not bind service');
        }
    }
    unbindService() {
        this.bgService = null;
        this._loaded = false;
    }

    async start() {
        const intent = new Intent(this.context, java.lang.Class.forName(__APP_ID__ + '.BgService'));
        this.bindService(this.context, intent);
    }

    async stop() {
        try {
            DEV_LOG && console.log(TAG, 'stop', this._loaded);
            if (this._loaded) {
                this._loaded = false;
                const bgService = this.bgService?.get();
                await super.stop();
                if (bgService) {
                    const context = this.context;
                    NotificationHelper.hideAllNotifications();
                    const intent = new android.content.Intent(context, com.akylas.conty.BgService.class);
                    DEV_LOG && console.log(TAG, 'stopService');
                    context.stopService(intent);
                    context.unbindService(this.serviceConnection);
                }
            }
        } catch (error) {
            console.error('BgService stop failed', error, error.stack);
        }
    }
    async handleBinder(binder: android.os.IBinder) {
        try {
            const bgBinder = binder as IBgServiceBinder;
            const localservice = bgBinder.getService();
            bgBinder.setService(null);
            this.bgService = new WeakRef(localservice);
            localservice.onBounded(this);
            this._handlerLoaded();
            await super.start();
        } catch (err) {
            console.error('BgService start failed', err, err.stack);
        }
    }
    get storyHandler() {
        return this.bgService?.get()?.storyHandler;
    }
}

let bgService: BgService;
export function getBGServiceInstance() {
    if (!bgService) {
        bgService = new BgService();
    }
    return bgService;
}
