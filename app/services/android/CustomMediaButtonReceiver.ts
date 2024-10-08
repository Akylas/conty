import { BgService, getInstance } from './BgService';

@NativeClass
@JavaProxy('__PACKAGE__.CustomMediaButtonReceiver')
export class CustomMediaButtonReceiver extends androidx.media.session.MediaButtonReceiver {
    onReceive(context: android.content.Context, intent: android.content.Intent) {
        const action = intent.getAction();
        DEV_LOG && console.log('onReceive', action);
        try {
            switch (action) {
                case 'android.intent.action.MEDIA_BUTTON':
                    getInstance().handleMediaIntent(intent);
                    break;
                case 'android.intent.action.MEDIA_CUSTOM_BUTTON':
                    getInstance().storyHandler?.handleAction(intent.getType());
                    break;
            }
        } catch (e) {
            console.error('CustomMediaButtonReceiver', e, e.stack);
        }
    }
}
