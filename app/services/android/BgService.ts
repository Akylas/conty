import { SDK_VERSION } from '@nativescript/core/utils';
import { Canvas, Paint } from '@nativescript-community/ui-canvas';
import { ImageSource, Utils } from '@nativescript/core';
import { get } from 'svelte/store';
import { PackStartEvent, PackStartEventData, PackStopEvent, PlaybackEvent, PlaybackEventData, PlayingInfo, StageEventData, StoryHandler } from '~/handlers/StoryHandler';
import { lc } from '~/helpers/locale';
import { BgServiceBinder } from '~/services/android/BgServiceBinder';
import { createColorMatrix } from '~/utils';
import { colors } from '~/variables';
import { BgServiceCommon } from '../BgService.common';
import { FLAG_IMMUTABLE, NOTIFICATION_CHANEL_ID_RECORDING_CHANNEL, NotificationHelper } from './NotificationHelper';
import { showError } from '~/utils/showError';
import { MediaSessionCompatCallback } from './MediaSessionCompatCallback';
import { Stage, stageCanGoHome } from '~/models/Pack';

const PlaybackStateCompat = android.support.v4.media.session.PlaybackStateCompat;

const NOTIFICATION_ID = 3426824;
const PLAYING_NOTIFICATION_ID = 123512;

let instance: BgService;
export function getInstance() {
    return instance;
}

const TAG = '[BgServiceAndroid]';
const ic_play_id = Utils.android.resources.getId(':drawable/' + 'media_ic_play');
const ic_pause_id = Utils.android.resources.getId(':drawable/' + 'media_ic_pause');
const ic_stop_id = Utils.android.resources.getId(':drawable/' + 'media_ic_end');
const ic_home_id = Utils.android.resources.getId(':drawable/' + 'media_ic_home');
const ic_previous_id = Utils.android.resources.getId(':drawable/' + 'media_ic_left');
const ic_next_id = Utils.android.resources.getId(':drawable/' + 'media_ic_right');
const ic_close_id = Utils.android.resources.getId(':drawable/' + 'media_ic_close');
const ic_check_id = Utils.android.resources.getId(':drawable/' + 'media_ic_check');

function modifyBitmap(original, colorMatrix: number[]) {
    const canvas = new Canvas(original);
    const paint = new Paint();
    let arr = colorMatrix;
    if (Array.isArray(colorMatrix)) {
        arr = Array.create('float', colorMatrix.length);
        for (let index = 0; index < colorMatrix.length; index++) {
            arr[index] = colorMatrix[index];
        }
    }
    paint.setColorFilter(new android.graphics.ColorMatrixColorFilter(arr));
    canvas.drawBitmap(original, 0, 0, paint);
    return canvas.getImage();
}

@NativeClass
@JavaProxy('__PACKAGE__.BgService')
export class BgService extends android.app.Service {
    // export const BgService = (android.app.Service as any).extend('com.akylas.conty.BgService', {
    storyHandler: StoryHandler;
    bounded: boolean;
    mNotificationBuilder: androidx.core.app.NotificationCompat.Builder;
    mNotification: globalAndroid.app.Notification;
    playingInfo: PlayingInfo = null;
    playingState: 'pause' | 'play' | 'stopped' = 'stopped';
    onStartCommand(intent: android.content.Intent, flags: number, startId: number) {
        super.onStartCommand(intent, flags, startId);
        console.log('onStartCommand', intent);
        if (!instance) {
            instance = this;
        }
        if (intent != null) {
            com.akylas.conty.CustomMediaButtonReceiver.handleIntent(this.getMediaSessionCompat(), intent);
        }
        // const action = intent ? intent.getAction() : null;
        // if (action === ACTION_RESUME) {
        //     this.geoHandler.resumeSession();
        // } else if (action === ACTION_PAUSE) {
        //     this.geoHandler.pauseSession();
        // }
        return android.app.Service.START_STICKY;
    }
    onCreate() {
        if (!instance) {
            instance = this;
        }
        DEV_LOG && console.log(TAG, 'onCreate');
        // this.inBackground = false;
        this.bounded = false;
        // this.notificationManager = this.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        NotificationHelper.createNotificationChannels(this);
    }
    onDestroy() {
        DEV_LOG && console.log(TAG, 'onDestroy');
    }

    onBind(intent: android.content.Intent) {
        // a client is binding to the service with bindService()
        this.bounded = true;
        const result = new BgServiceBinder();
        result.setService(this);
        return result;
    }
    onUnbind(intent: android.content.Intent) {
        DEV_LOG && console.log(TAG, 'onUnbind');
        this.bounded = false;
        const storyHandler = this.storyHandler;
        storyHandler.off(PlaybackEvent, this.onPlayerState, this);
        storyHandler.off('stateChange', this.onStateChange, this);
        storyHandler.off(PackStartEvent, this.onPackStart, this);
        storyHandler.off(PackStopEvent, this.onPackStop, this);
        return true;
    }
    onRebind(intent: android.content.Intent) {
        // a client is binding to the service with bindService(), after onUnbind() has already been called
    }

    onBounded(commonService: BgServiceCommon) {
        try {
            DEV_LOG && console.log(TAG, 'onBounded');
            this.storyHandler = new StoryHandler(commonService);
            this.storyHandler.on(PlaybackEvent, this.onPlayerState, this);
            this.storyHandler.on('stateChange', this.onStateChange, this);
            this.storyHandler.on(PackStartEvent, this.onPackStart, this);
            this.storyHandler.on(PackStopEvent, this.onPackStop, this);
        } catch (error) {
            console.error('onBounded', error, error.stack);
        }
    }

    mMediaSessionCompat: android.support.v4.media.session.MediaSessionCompat;

    getMediaSessionCompat() {
        if (!this.mMediaSessionCompat) {
            this.createMediaSession();
        }
        return this.mMediaSessionCompat;
    }
    stateBuilder: android.support.v4.media.session.PlaybackStateCompat.Builder;
    createMediaSession() {
        try {
            const context = Utils.android.getApplicationContext();
            const MediaSessionCompat = android.support.v4.media.session.MediaSessionCompat;
            const mediaSessionCompat = (this.mMediaSessionCompat = new MediaSessionCompat(context, 'AudioPlayer'));
            mediaSessionCompat.setActive(true);
            mediaSessionCompat.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

            const mediaButtonIntent = new android.content.Intent(android.content.Intent.ACTION_MEDIA_BUTTON);
            mediaButtonIntent.setClass(context, java.lang.Class.forName(__APP_ID__ + '.CustomMediaButtonReceiver'));
            const pendingIntent = android.app.PendingIntent.getBroadcast(this, 0, mediaButtonIntent, FLAG_IMMUTABLE);
            mediaSessionCompat.setMediaButtonReceiver(pendingIntent);

            mediaSessionCompat.setCallback(new MediaSessionCompatCallback());
        } catch (error) {
            console.error('createMediaSession', error, error.stack);
        }
    }
    async updateMediaSessionMetadata() {
        try {
            const MediaMetadataCompat = android.support.v4.media.MediaMetadataCompat;
            const metadataBuilder = new MediaMetadataCompat.Builder();
            const playingInfo = this.playingInfo;
            // DEV_LOG && console.log('updateMediaSessionMetadata', JSON.stringify(playingInfo));
            metadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, playingInfo.name);
            if (playingInfo.description) {
                metadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, playingInfo.description);
            }
            if (playingInfo.cover) {
                const cover = await playingInfo.cover();
                const imageSource = typeof cover === 'string' ? await ImageSource.fromFile(cover) : cover;
                // metadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, image || playingInfo.cover);
                if (imageSource?.android) {
                    const originalBitmap = imageSource.android as android.graphics.Bitmap;
                    // const newBitmap = modifyBitmap(originalBitmap, createColorMatrix(get(colors).colorPrimary));
                    // originalBitmap.finalize();
                    metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, originalBitmap);
                }
            } else {
                const context = Utils.android.getApplicationContext();
                const resources = context.getResources();
                const identifier = context.getResources().getIdentifier('ic_launcher', 'mipmap', context.getPackageName());
                metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, android.graphics.BitmapFactory.decodeResource(resources, identifier));
            }
            metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, playingInfo.duration);
            this.getMediaSessionCompat().setMetadata(metadataBuilder.build());
        } catch (error) {
            showError(error);
        }
    }
    hidePlayingNotification() {
        this.getMediaSessionCompat().setActive(false);
        NotificationHelper.hideNotification(PLAYING_NOTIFICATION_ID);
        this.playingNotifBuilder = null;
    }
    playingNotifBuilder: androidx.core.app.NotificationCompat.Builder;
    // showPlayingNotification() {
    //     // console.log('showPlayingNotification');
    //     const context = Utils.android.getApplicationContext();
    //     const builder = (this.playingNotifBuilder = NotificationHelper.getMediaNotification(context, this.getMediaSessionCompat()));
    //     if (builder === null) {
    //         return;
    //     }
    //     const MediaStyle = androidx.media.app.NotificationCompat.MediaStyle;
    //     const playingInfo = this.playingInfo;
    //     const actionsInCompactView = [];
    //     if (playingInfo.canPause) {
    //         actionsInCompactView.push(0);
    //         builder.addAction(ic_pause_id, 'Pause', com.akylas.conty.CustomMediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE));
    //     }
    //     if (playingInfo.canStop) {
    //         actionsInCompactView.push(1);
    //         builder.addAction(ic_stop_id, 'Stop', com.akylas.conty.CustomMediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_STOP));
    //     }
    //     builder.setStyle(new MediaStyle().setShowActionsInCompactView(actionsInCompactView).setMediaSession(this.getMediaSessionCompat().getSessionToken()));
    //     NotificationHelper.showNotification(PLAYING_NOTIFICATION_ID, builder);
    // }
    // showPausedNotification() {
    //     const context = Utils.android.getApplicationContext();
    //     const builder = (this.playingNotifBuilder = NotificationHelper.getMediaNotification(context, this.getMediaSessionCompat()));
    //     if (builder === null) {
    //         return;
    //     }
    //     const MediaStyle = androidx.media.app.NotificationCompat.MediaStyle;

    //     const playingInfo = this.playingInfo;
    //     const actionsInCompactView = [0];
    //     builder.addAction(ic_play_id, 'Play', com.akylas.conty.CustomMediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE));
    //     if (playingInfo.canStop) {
    //         actionsInCompactView.push(1);
    //         builder.addAction(ic_stop_id, 'Stop', com.akylas.conty.CustomMediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_STOP));
    //     }
    //     builder.setStyle(new MediaStyle().setShowActionsInCompactView(actionsInCompactView).setMediaSession(this.getMediaSessionCompat().getSessionToken()));
    //     NotificationHelper.showNotification(PLAYING_NOTIFICATION_ID, builder);
    // }

    addAction(
        context: android.content.Context,
        id: string,
        name: string,
        resId: number,
        notifBuilder?: androidx.core.app.NotificationCompat.Builder,
        playbackstateBuilder?: globalAndroid.support.v4.media.session.PlaybackStateCompat.Builder
    ) {
        if (notifBuilder) {
            const intent = new android.content.Intent('android.intent.action.MEDIA_CUSTOM_BUTTON');
            intent.setType(id);
            intent.setClass(context, java.lang.Class.forName(__APP_ID__ + '.CustomMediaButtonReceiver'));
            const pendingIntent = android.app.PendingIntent.getBroadcast(this, 0, intent, FLAG_IMMUTABLE);
            notifBuilder.addAction(resId, name, pendingIntent);
        }

        if (playbackstateBuilder) {
            playbackstateBuilder.addCustomAction(new PlaybackStateCompat.CustomAction.Builder(id, name, resId).build());
        }
    }

    async updatePlayerNotification(currentStage: Stage, currentStages: Stage[], playingState: string) {
        try {
            await this.updateMediaSessionMetadata();
            const playbackstateBuilder = new PlaybackStateCompat.Builder();
            const context = Utils.android.getApplicationContext();
            const notifBuilder = (this.playingNotifBuilder = NotificationHelper.getMediaNotification(context, this.getMediaSessionCompat()));
            if (notifBuilder === null) {
                return;
            }
            const MediaStyle = androidx.media.app.NotificationCompat.MediaStyle;
            const controlSettings = currentStage?.controlSettings;
            let actionIndex = 0;
            const actionsInCompactView = [];
            if (currentStages?.length > 1) {
                actionsInCompactView.push(actionIndex++);
                this.addAction(context, 'previous', lc('previous'), ic_previous_id, notifBuilder, playbackstateBuilder);
                actionsInCompactView.push(actionIndex++);
                this.addAction(context, 'next', lc('next'), ic_next_id, notifBuilder, playbackstateBuilder);
            }
            let playbackState = PlaybackStateCompat.STATE_PLAYING;
            let currentTime = 0;

            if (controlSettings?.ok) {
                actionsInCompactView.push(actionIndex++);
                this.addAction(context, 'ok', lc('ok'), ic_check_id, notifBuilder, playbackstateBuilder);
            }
            if (!controlSettings || controlSettings?.pause) {
                currentTime = this.storyHandler.playerCurrentTime;
                // playbackState = PlaybackStateCompat.STATE_STOPPED;
                if (playingState === 'play') {
                    playbackstateBuilder.setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PAUSE);
                    playbackState = PlaybackStateCompat.STATE_PLAYING;
                    actionsInCompactView.push(actionIndex++);
                    this.addAction(context, 'pause', lc('pause'), ic_pause_id, notifBuilder);
                } else if (playingState === 'pause') {
                    playbackstateBuilder.setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PLAY);
                    playbackState = PlaybackStateCompat.STATE_PAUSED;
                    actionsInCompactView.push(actionIndex++);
                    this.addAction(context, 'play', lc('play'), ic_play_id, notifBuilder);
                }
            }

            if (currentStage && stageCanGoHome(currentStage)) {
                actionIndex++;
                this.addAction(context, 'home', lc('home'), ic_home_id, notifBuilder, playbackstateBuilder);
            }
            actionIndex++;
            this.addAction(context, 'stop', lc('stop'), ic_close_id, notifBuilder, playbackstateBuilder);
            playbackstateBuilder.setState(playbackState, currentTime, 1);
            this.getMediaSessionCompat().setPlaybackState(playbackstateBuilder.build());

            notifBuilder.setStyle(new MediaStyle().setShowActionsInCompactView(actionsInCompactView).setMediaSession(this.getMediaSessionCompat().getSessionToken()));
            NotificationHelper.showNotification(PLAYING_NOTIFICATION_ID, notifBuilder);
            this.getMediaSessionCompat().setActive(true);
        } catch (error) {
            showError(error);
        }
    }

    async onPackStop(event) {
        this.playingInfo = null;
        try {
            this.hidePlayingNotification();
        } catch (error) {
            console.error('onPackStop', error, error.stack);
        }
    }
    async onPackStart(event: PackStartEventData) {
        try {
            this.getMediaSessionCompat().setActive(true);
            // this.updatePlayerNotification(event.currentStage, event.stages, playingState);
        } catch (error) {
            console.error('onPackStart', error, error.stack);
        }
    }
    onStateChange(event: StageEventData) {
        this.playingInfo = event.playingInfo;
        this.updatePlayerNotification(event.currentStage, event.stages, this.playingState);
    }
    onPlayerState(event: PlaybackEventData) {
        this.playingInfo = event.playingInfo;
        this.playingState = event.state;
        // this.playingInfo = this.bluetoothHandler.playingInfo;
        if (!event.playingInfo) {
            return;
        }
        // if (this.playingInfo && this.playingInfo.canPause) {
        this.updatePlayerNotification(event.currentStage, event.stages, this.playingState);
        // }
    }
    handleButtonAction(action: string) {
        switch (action) {
            case 'play':
            case 'pause':
                this.storyHandler.togglePlayState();
                break;
            case 'ok':
                this.storyHandler.onStageOk();
                break;
            case 'stop':
                this.storyHandler.stopPlaying({ fade: true });
                break;
            case 'home':
                this.storyHandler.onStageHome();
                break;
            case 'previous':
                this.storyHandler?.setSelectedStage((this.storyHandler.selectedStageIndex - 1 + this.storyHandler.currentStages.length) % this.storyHandler.currentStages.length);
                break;
            case 'next':
                this.storyHandler?.setSelectedStage((this.storyHandler.selectedStageIndex + 1) % this.storyHandler.currentStages.length);
                break;
        }
    }
    handleMediaIntent(intent: android.content.Intent) {
        const event = intent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT) as android.view.KeyEvent;
        const keyCode = event.getKeyCode();
        switch (event.getKeyCode()) {
            case android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: {
                this.storyHandler.togglePlayState();
                break;
            }
            case android.view.KeyEvent.KEYCODE_MEDIA_STOP:
                this.storyHandler.stopPlaying({ fade: true });
        }
    }
    updateAlbumArt(image) {
        if (this.playingNotifBuilder) {
            this.playingNotifBuilder.setLargeIcon(ImageSource.fromFileSync(image).android);
            NotificationHelper.showNotification(PLAYING_NOTIFICATION_ID, this.playingNotifBuilder);
        }
    }
}
