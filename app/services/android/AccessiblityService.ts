import { getBGServiceInstance } from '../BgService.android';

const TAG = '[AccessiblityService]';
@NativeClass()
@JavaProxy('__PACKAGE__.AccessiblityService')
export class AccessiblityService extends android.accessibilityservice.AccessibilityService {
    onServiceConnected() {
        super.onServiceConnected();
        console.log(TAG, 'service is connected');
    }

    onAccessibilityEvent(accessibilityEvent) {
        console.log(TAG, 'onAccessibiltyEvent' + accessibilityEvent.toString());
    }

    onInterrupt() {}
    // here you can intercept the keyevent
    onKeyEvent(event) {
        return this.handleKeyEvent(event);
    }

    handleKeyEvent(event) {
        const storyHandler = getBGServiceInstance().storyHandler;
        const action = event.getAction();
        const keyCode = event.getKeyCode();
        DEV_LOG && console.log('handleKeyEvent', action, keyCode);
        if (!storyHandler.canOverrideButtons()) {
            return false;
        }
        if (action === 0 /* KeyEvent.ACTION_DOWN */) {
            switch (keyCode) {
                case 25 /* KeyEvent.KEYCODE_VOLUME_DOWN */:
                    //do something
                    storyHandler.selectPreviousStage();
                    return true;

                case 24 /* KeyEvent.KEYCODE_VOLUME_UP */: {
                    //do something
                    storyHandler.selectNextStage();
                    return true;
                }
            }
        }
        return false;
    }
}
