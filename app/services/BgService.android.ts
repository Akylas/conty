import { AndroidActivityResultEventData, Application, Utils } from '@nativescript/core';
import { BgService as AndroidBgService } from '~/services/android/BgService';
import { BgServiceBinder, IBgServiceBinder } from '~/services/android/BgServiceBinder';
import { BgServiceCommon, BgServiceLoadedEvent } from '~/services/BgService.common';
import { NotificationHelper } from './android/NotificationHelper';
import { SDK_VERSION } from '@nativescript/core/utils';

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
                    const intent = new android.content.Intent(context, java.lang.Class.forName(__APP_ID__ + '.BgService'));
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
            // if (!PRODUCTION && START_ACCESSIBILITY) {
            //     this.enableAccessibilityService();
            // }
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
    isBatteryOptimized() {
        DEV_LOG && console.log('isBatteryOptimized');
        const context = Utils.android.getApplicationContext();
        const pwrm = context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager;
        if (SDK_VERSION >= 23) {
            return !pwrm.isIgnoringBatteryOptimizations(__APP_ID__);
        }
        return false;
    }
    async checkBatteryOptimDisabled() {
        DEV_LOG && console.log('checkBatteryOptimDisabled');
        const activity = Application.android.startActivity;
        if (this.isBatteryOptimized() && SDK_VERSION >= 22) {
            return new Promise<boolean>((resolve, reject) => {
                const REQUEST_CODE = 6645;
                const onActivityResultHandler = (data: AndroidActivityResultEventData) => {
                    DEV_LOG && console.log('onActivityResultHandler', data.requestCode);
                    if (data.requestCode === REQUEST_CODE) {
                        Application.android.off(Application.android.activityResultEvent, onActivityResultHandler);
                        resolve(!this.isBatteryOptimized());
                    }
                };
                Application.android.on(Application.android.activityResultEvent, onActivityResultHandler);
                const intent = new android.content.Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(android.net.Uri.parse('package:' + __APP_ID__));
                DEV_LOG && console.log('startActivityForResult');
                activity.startActivityForResult(intent, REQUEST_CODE);
            });
        }
        return Promise.resolve(true);
    }
    // isAccessibilityServiceEnabled() {
    //     const context = Utils.android.getApplicationContext();
    //     const enabled = android.provider.Settings.Secure.getString(
    //         context.getContentResolver(),
    //         'enabled_accessibility_services' /* android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES */
    //     );
    //     DEV_LOG && console.log('isAccessibilityServiceEnabled', enabled);
    //     return !!enabled && enabled.indexOf(__APP_ID__) !== -1;
    // }
    // async enableAccessibilityService() {
    //     const activity = Application.android.startActivity;
    //     if (!this.isAccessibilityServiceEnabled()) {
    //         DEV_LOG && console.log('enableAccessibilityService1');

    //         return new Promise<boolean>((resolve, reject) => {
    //             const REQUEST_CODE = 6645;
    //             const onActivityResultHandler = (data: AndroidActivityResultEventData) => {
    //                 if (data.requestCode === REQUEST_CODE) {
    //                     Application.android.off(Application.android.activityResultEvent, onActivityResultHandler);
    //                     resolve(this.isAccessibilityServiceEnabled());
    //                 }
    //             };
    //             Application.android.on(Application.android.activityResultEvent, onActivityResultHandler);
    //             const intent = new android.content.Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
    //             // intent.setData(android.net.Uri.parse('package:' + activity.getPackageName()));
    //             activity.startActivityForResult(intent, REQUEST_CODE);
    //         });
    //     }
    //     return Promise.resolve(true);
    // }
}

let bgService: BgService;
export function getBGServiceInstance() {
    if (!bgService) {
        bgService = new BgService();
    }
    return bgService;
}
