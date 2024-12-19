import { clearTimeout } from '@akylas/nativescript/timer';
import { AndroidActivityCallbacks, Application, setActivityCallbacks } from '@nativescript/core';
import { getInstance } from '~/services/android/BgService';

let shortPress = false;

let longpressTimer;
let audioManager: android.media.AudioManager;

const SUPPORTED_KEY_CODES = [24, 25]
function handleKey(activity: androidx.appcompat.app.AppCompatActivity, keyCode: number, event: android.view.KeyEvent) {
    const instance = getInstance();
    // DEV_LOG && console.warn('handleKey', activity, instance, instance.shouldHandleVolumeButtons, keyCode);
    if (!instance.shouldHandleVolumeButtons || SUPPORTED_KEY_CODES.indexOf(keyCode) === -1) {
        return false;
    }
    const action = event.getAction();

    const storyHandler = instance.storyHandler;
    // DEV_LOG && console.warn('handleKey', activity, instance, instance.shouldHandleVolumeButtons, storyHandler.id, keyCode, action, event);
    const playingInfo = storyHandler?.currentPlayingInfo;
    if (!playingInfo) {
        return false;
    }

    const { canNext, canPrev, isStory, pack, ...other } = playingInfo;
    if (!pack) {
        return false;
    }
    // DEV_LOG && console.log('onKeyDown', keyCode, action, event.getRepeatCount(), event.getFlags(), shortPress, canNext, canPrev, isStory, event.getFlags() & 256);
    if (!isStory) {
        if (action === 0) {
            switch (keyCode) {
                case 25 /* KeyEvent.KEYCODE_VOLUME_DOWN */:
                case 24 /* KeyEvent.KEYCODE_VOLUME_UP */:
                    shortPress = event.getRepeatCount() === 0;
                    if (shortPress) {
                        // DEV_LOG && console.error('shortPress');
                        if (longpressTimer) {
                            clearTimeout(longpressTimer);
                            longpressTimer = null;
                        }
                        // longpressTimer = setTimeout(() => {
                        //     DEV_LOG && console.log('longPress EVENT');
                        //     longpressTimer = null;
                        // }, 1000);
                        return true;
                    } else {
                        return !instance.forceLongPressVolumeWhenNotPlaying;
                    }
            }
        } else if (action === 1) {
            if (longpressTimer) {
                // DEV_LOG && console.log('clear longpressTimer');
                clearTimeout(longpressTimer);
                longpressTimer = null;
            }
            if (shortPress) {
                switch (keyCode) {
                    case 25 /* KeyEvent.KEYCODE_VOLUME_DOWN */: {
                        if (canPrev) {
                            storyHandler.selectPreviousStage();
                        }
                        break;
                    }
                    case 24 /* KeyEvent.KEYCODE_VOLUME_UP */: {
                        if (canPrev) {
                            storyHandler.selectNextStage();
                        }
                        break;
                    }
                }
                shortPress = false;
                return true;
            }
        }
    } else {
        if (action === 0) {
            switch (keyCode) {
                case 25 /* KeyEvent.KEYCODE_VOLUME_DOWN */:
                case 24 /* KeyEvent.KEYCODE_VOLUME_UP */:
                    shortPress = event.getRepeatCount() === 0;
                    if (shortPress) {
                        // DEV_LOG && console.error('shortPress');
                        if (longpressTimer) {
                            clearTimeout(longpressTimer);
                            longpressTimer = null;
                        }
                        longpressTimer = setTimeout(() => {
                            switch (keyCode) {
                                case 25 /* KeyEvent.KEYCODE_VOLUME_DOWN */:
                                    storyHandler.handleAction('previous');
                                    break;
                                case 24 /* KeyEvent.KEYCODE_VOLUME_UP */:
                                    storyHandler.handleAction('next');
                                    break;
                            }
                            // DEV_LOG && console.log('longPress EVENT', keyCode);
                            longpressTimer = null;
                        }, 1000);
                    }
                    return true;
            }
        } else if (action === 1) {
            if (longpressTimer) {
                // DEV_LOG && console.log('clear longpressTimer');
                clearTimeout(longpressTimer);
                longpressTimer = null;
            }
            if (shortPress) {
                switch (keyCode) {
                    case 24 /* KeyEvent.KEYCODE_VOLUME_UP */:
                        if (!audioManager) {
                            audioManager = activity.getSystemService('audio');
                        }
                        // DEV_LOG && console.log('adjustVolume', audioManager);
                        audioManager.adjustStreamVolume(3, 1, 4);
                        break;
                    case 25 /* KeyEvent.KEYCODE_VOLUME_DOWN */: {
                        if (!audioManager) {
                            audioManager = activity.getSystemService('audio');
                        }
                        // DEV_LOG && console.log('adjustVolume', audioManager);
                        audioManager.adjustStreamVolume(3, -1, 4);
                        break;
                    }
                }
                shortPress = false;
                return true;
            }
        }
    }
    return false;
}

Application.android.on(Application.android.dialogOnCreateViewEvent, (event: any) => {
    DEV_LOG && console.log('dialogOnCreateViewEvent', event.dialog);
    if (event.dialog) {
        (event.dialog as android.app.Dialog).setOnKeyListener(
            new android.content.DialogInterface.OnKeyListener({
                onKey(param0: android.content.DialogInterface, keyCode: number, event: android.view.KeyEvent) {
                    return handleKey(Application.android.startActivity, keyCode, event);
                }
            })
        );
    }
});

const TAG = '[MainActivity]';
@NativeClass()
@JavaProxy('__PACKAGE__.MainActivity')
export class MainActivity extends androidx.appcompat.app.AppCompatActivity {
    public isNativeScriptActivity;

    private _callbacks: AndroidActivityCallbacks;

    public override onCreate(savedInstanceState: android.os.Bundle): void {
        DEV_LOG && console.log(TAG, 'onCreate');
        // DynamicColors
        // this.getWindow().setStatusBarColor(getThemeColor(this, 'colorPrimaryDark'));
        Application.android.init(this.getApplication());
        // Set the isNativeScriptActivity in onCreate (as done in the original NativeScript activity code)
        // The JS constructor might not be called because the activity is created from Android.
        this.isNativeScriptActivity = true;
        if (!this._callbacks) {
            setActivityCallbacks(this);
        }

        this._callbacks.onCreate(this, savedInstanceState, this.getIntent(), super.onCreate);
    }

    public override onNewIntent(intent: android.content.Intent): void {
        this._callbacks.onNewIntent(this, intent, super.setIntent, super.onNewIntent);
    }

    public override onSaveInstanceState(outState: android.os.Bundle): void {
        this._callbacks.onSaveInstanceState(this, outState, super.onSaveInstanceState);
    }

    public override onStart(): void {
        DEV_LOG && console.log(TAG, 'onStart');
        this._callbacks.onStart(this, super.onStart);
    }

    public override onStop(): void {
        DEV_LOG && console.log(TAG, 'onStop');
        this._callbacks.onStop(this, super.onStop);
    }

    public override onDestroy(): void {
        DEV_LOG && console.log(TAG, 'onDestroy');
        this._callbacks.onDestroy(this, super.onDestroy);
    }

    public override onPostResume(): void {
        this._callbacks.onPostResume(this, super.onPostResume);
    }

    public override onBackPressed(): void {
        this._callbacks.onBackPressed(this, super.onBackPressed);
    }

    public override onRequestPermissionsResult(requestCode: number, permissions: string[], grantResults: number[]): void {
        this._callbacks.onRequestPermissionsResult(this, requestCode, permissions, grantResults, undefined /*TODO: Enable if needed*/);
    }

    public override onActivityResult(requestCode: number, resultCode: number, data: android.content.Intent): void {
        this._callbacks.onActivityResult(this, requestCode, resultCode, data, super.onActivityResult);
    }
    handlingKey = false;

    public override onKeyLongPress(keyCode, event) {
        if (this.handlingKey) {
            return super.onKeyLongPress(keyCode, event);
        }
        this.handlingKey = true;
        DEV_LOG && console.log('onKeyLongPress', keyCode);
        const result = handleKey(this, keyCode, event);
        // if (!result) {
        //     result = super.onKeyLongPress(keyCode, event);
        // }
        this.handlingKey = false;
        return true;
    }
    public override onKeyDown(keyCode, event) {
        if (this.handlingKey) {
            DEV_LOG && console.warn('passing through onKeyDown', event.getAction(), event.getKeyCode());
            return super.onKeyDown(keyCode, event);
        }
        this.handlingKey = true;
        let result = handleKey(this, keyCode, event);
        if (!result) {
            result = super.onKeyDown(keyCode, event);
        }
        this.handlingKey = false;
        return result;
    }
    public override onKeyUp(keyCode, event) {
        if (this.handlingKey) {
            return super.onKeyUp(keyCode, event);
        }
        this.handlingKey = true;
        let result = handleKey(this, keyCode, event);
        // DEV_LOG && console.log('onKeyUp', result);
        if (!result) {
            result = super.onKeyUp(keyCode, event);
        }
        this.handlingKey = false;
        return result;
    }
}
