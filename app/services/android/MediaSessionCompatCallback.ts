import { getBGServiceInstance } from '../BgService.android';
import { getInstance } from './BgService';

const TAG = 'MediaSessionCompatCallback';

@NativeClass
export class MediaSessionCompatCallback extends android.support.v4.media.session.MediaSessionCompat.Callback {
    constructor() {
        super();
        return global.__native(this);
    }

    onPlay() {
        getBGServiceInstance().storyHandler?.resumePlayback();
        super.onPlay();
    }
    onPause() {
        getBGServiceInstance().storyHandler?.pausePlayback();
        super.onPause();
    }

    onSkipToNext() {
        super.onSkipToNext();
    }

    onSkipToPrevious() {
        super.onSkipToPrevious();
    }
    onPlayFromMediaId(mediaId, extras) {
        super.onPlayFromMediaId(mediaId, extras);
    }
    onCommand(command, extras, cb) {
        super.onCommand(command, extras, cb);
    }
    onSeekTo(pos) {
        super.onSeekTo(pos);
    }
    onMediaButtonEvent(mediaButtonIntent) {
        const action = mediaButtonIntent.getAction();
        const keyEvent = mediaButtonIntent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT);
        DEV_LOG && console.log('onMediaButtonEvent', action, keyEvent);
        if (android.content.Intent.ACTION_MEDIA_BUTTON === action) {
            // const event = mediaButtonIntent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT);
            return true;
        }
        return super.onMediaButtonEvent(mediaButtonIntent);
    }
    onCustomAction(action: string, bundle) {
        getInstance().storyHandler?.handleAction(action);
    }
}
