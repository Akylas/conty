import { BgServiceCommon, BgServiceLoadedEvent } from '~/services/BgService.common';
import {
    PackStartEvent,
    PackStartEventData,
    PackStopEvent,
    PlaybackEvent,
    PlaybackEventData,
    PlayingInfo,
    PlayingState,
    StageEventData,
    StoryHandler,
    StoryStartEvent,
    StoryStopEvent
} from '~/handlers/StoryHandler';
import { Stage } from '~/models/Pack';
import { showError } from '@shared/utils/showError';
import { Application, ImageSource } from '@nativescript/core';

export { BgServiceLoadedEvent };

export class BgService extends BgServiceCommon {
    readonly storyHandler: StoryHandler;
    playingInfo: PlayingInfo = null;
    playingState: PlayingState = 'stopped';
    constructor() {
        super();
        this.storyHandler = new StoryHandler(this);
        this.storyHandler.on(PlaybackEvent, this.onPlayerState, this);
        this.storyHandler.on(PackStopEvent, this.onPackStop, this);
        this.storyHandler.on(StoryStopEvent, this.onPackStop, this);
        this.storyHandler.off(PackStartEvent, this.onPackStart, this);
        this.storyHandler.off(StoryStartEvent, this.onPackStart, this);
        // this.storyHandler.on('stateChange', this.onStateChange, this);
        this._handlerLoaded();
    }
    nextTrackCommandHandler;
    previousTrackCommandHandler;
    togglePlayPauseCommandHandler;
    likeCommandHandler;
    bookmarkCommandCommandHandler;
    stopCommandCommandHandler;

    commandHandlers: { [k: string]: any } = {};

    async onPackStop(event) {
        this.playingInfo = null;
        UIApplication.sharedApplication.endReceivingRemoteControlEvents();
    }
    async onPackStart(event: PackStartEventData) {
        UIApplication.sharedApplication.beginReceivingRemoteControlEvents();
    }
    _enableDisableCommand(id: string, command: MPRemoteCommand, enabled: boolean) {
        if (enabled) {
            if (!this.commandHandlers[id]) {
                this.commandHandlers[id] = command.addTargetWithHandler(() => {
                    this.storyHandler?.handleAction(id);
                    return MPRemoteCommandHandlerStatus.Success;
                });
            }
        } else if (this.commandHandlers[id]) {
            command.removeTarget(this.commandHandlers[id]);
            delete this.commandHandlers[id];
        }
        command.enabled = enabled;
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
    async updatePlayerNotification(currentStage: Stage, currentStages: Stage[], playingState: string) {
        try {
            const playingInfo = this.playingInfo;
            const pack = playingInfo.pack;
            const keys = [
                MPMediaItemPropertyTitle,
                MPMediaItemPropertyAlbumTitle,
                MPMediaItemPropertyPlaybackDuration,
                MPNowPlayingInfoPropertyPlaybackRate,
                MPNowPlayingInfoPropertyElapsedPlaybackTime
            ];
            const objects = [playingInfo.name, playingInfo.description, playingInfo.duration / 1000, this.playingState === 'playing' ? 1 : 0, this.storyHandler.playerCurrentTime / 1000];
            // DEV_LOG && console.log('updatePlayerNotification', this.playingState);
            if (playingInfo.cover) {
                const cover = playingInfo.cover();
                const imageSource = typeof cover === 'string' ? await ImageSource.fromFile(cover) : cover;
                // metadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, image || playingInfo.cover);
                if (imageSource?.ios) {
                    keys.push(MPMediaItemPropertyArtwork);
                    objects.push(MPMediaItemArtwork.alloc().initWithBoundsSizeRequestHandler((imageSource?.ios as UIImage).size, (size) => imageSource?.ios));
                }
            }
            const sharedCommandCenter = MPRemoteCommandCenter.sharedCommandCenter();
            this._enableDisableCommand('next', sharedCommandCenter.nextTrackCommand, currentStages?.length > 1);
            this._enableDisableCommand('previous', sharedCommandCenter.previousTrackCommand, currentStages?.length > 1);
            this._enableDisableCommand('pause', sharedCommandCenter.togglePlayPauseCommand, pack.canPause(currentStage));
            this._enableDisableCommand('ok', sharedCommandCenter.likeCommand, pack.canOk(currentStage));
            this._enableDisableCommand('home', sharedCommandCenter.bookmarkCommand, !!currentStage && pack.canHome(currentStage));
            this._enableDisableCommand('stop', sharedCommandCenter.stopCommand, true);
            MPNowPlayingInfoCenter.defaultCenter().nowPlayingInfo = NSDictionary.dictionaryWithObjectsForKeys(objects, keys);
            MPNowPlayingInfoCenter.defaultCenter().playbackState = this.playingState === 'playing' ? MPNowPlayingPlaybackState.Playing : MPNowPlayingPlaybackState.Paused;
        } catch (error) {
            showError(error);
        }
    }
}

let bgService: BgService;
export function getBGServiceInstance() {
    if (!bgService) {
        bgService = new BgService();
    }
    return bgService;
}
