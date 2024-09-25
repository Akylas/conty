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
        DEV_LOG && console.log('MediaSessionCompatCallback', 'onPlay');
        getBGServiceInstance().storyHandler.resumePlayback();
        super.onPlay();
    }
    onPause() {
        DEV_LOG && console.log('MediaSessionCompatCallback', 'onPause');
        getBGServiceInstance().storyHandler.pausePlayback();
        super.onPause();
    }

    onSkipToNext() {
        DEV_LOG && console.log('MediaSessionCompatCallback', 'onSkipToNext');
        super.onSkipToNext();
    }

    onSkipToPrevious() {
        DEV_LOG && console.log('MediaSessionCompatCallback', 'onSkipToPrevious');
        super.onSkipToPrevious();
    }
    onPlayFromMediaId(mediaId, extras) {
        DEV_LOG && console.log('MediaSessionCompatCallback', 'onPlayFromMediaId');
        super.onPlayFromMediaId(mediaId, extras);
    }
    onCommand(command, extras, cb) {
        DEV_LOG && console.log('MediaSessionCompatCallback', 'onCommand');
        super.onCommand(command, extras, cb);
    }
    onSeekTo(pos) {
        DEV_LOG && console.log('MediaSessionCompatCallback', 'onSeekTo');
        super.onSeekTo(pos);
    }
    onMediaButtonEvent(mediaButtonIntent) {
        const action = mediaButtonIntent.getAction();
        DEV_LOG && console.log('MediaSession', 'Intent Action' + action);
        if (android.content.Intent.ACTION_MEDIA_BUTTON === mediaButtonIntent.getAction()) {
            const event = mediaButtonIntent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT);
            DEV_LOG && console.log('MediaSession', 'KeyCode' + event.getKeyCode());
            return true;
        }
        return super.onMediaButtonEvent(mediaButtonIntent);
    }
    onCustomAction(action: string, bundle) {
        getInstance().handleButtonAction(action);
    }
}
