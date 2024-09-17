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
        console.log('MediaSessionCompatCallback', 'onPlay');
        getBGServiceInstance().storyHandler.resumeStory();
        super.onPlay();
    }
    onPause() {
        console.log('MediaSessionCompatCallback', 'onPause');
        getBGServiceInstance().storyHandler.pauseStory();
        super.onPause();
    }

    onSkipToNext() {
        console.log('MediaSessionCompatCallback', 'onSkipToNext');
        super.onSkipToNext();
    }

    onSkipToPrevious() {
        console.log('MediaSessionCompatCallback', 'onSkipToPrevious');
        super.onSkipToPrevious();
    }
    onPlayFromMediaId(mediaId, extras) {
        console.log('MediaSessionCompatCallback', 'onPlayFromMediaId');
        super.onPlayFromMediaId(mediaId, extras);
    }
    onCommand(command, extras, cb) {
        console.log('MediaSessionCompatCallback', 'onCommand');
        super.onCommand(command, extras, cb);
    }
    onSeekTo(pos) {
        console.log('MediaSessionCompatCallback', 'onSeekTo');
        super.onSeekTo(pos);
    }
    onMediaButtonEvent(mediaButtonIntent) {
        const action = mediaButtonIntent.getAction();
        console.log('MediaSession', 'Intent Action' + action);
        if (android.content.Intent.ACTION_MEDIA_BUTTON === mediaButtonIntent.getAction()) {
            const event = mediaButtonIntent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT);
            console.log('MediaSession', 'KeyCode' + event.getKeyCode());
            return true;
        }
        return super.onMediaButtonEvent(mediaButtonIntent);
    }
    onCustomAction(action: string, bundle) {
        getInstance().handleButtonAction(action);
    }
}
