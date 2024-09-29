import { BgServiceCommon, BgServiceLoadedEvent } from '~/services/BgService.common';
import { PlaybackEvent, PlaybackEventData, PlayingInfo, StageEventData, StoryHandler } from '~/handlers/StoryHandler';
import { Stage, stageCanGoHome } from '~/models/Pack';
import { showError } from '~/utils/showError';
import { Application, ImageSource } from '@nativescript/core';

export { BgServiceLoadedEvent };

export class BgService extends BgServiceCommon {
    readonly storyHandler: StoryHandler;
    playingInfo: PlayingInfo = null;
    playingState: 'pause' | 'play' | 'stopped' = 'stopped';
    constructor() {
        super();
        this.storyHandler = new StoryHandler(this);
        this.storyHandler.on(PlaybackEvent, this.onPlayerState, this);
        // this.storyHandler.on('stateChange', this.onStateChange, this);
        this._handlerLoaded();
        if (UIApplication.sharedApplication) {
            this.onReady();
        } else {
            Application.once(Application.launchEvent, this.onReady);
        }
    }
    nextTrackCommandHandler;
    previousTrackCommandHandler;
    togglePlayPauseCommandHandler;
    likeCommandHandler;
    bookmarkCommandCommandHandler;
    stopCommandCommandHandler;
    handleButtonAction(action: string) {
        switch (action) {
            case 'play':
            case 'pause':
                this.storyHandler?.togglePlayState();
                break;
            case 'ok':
                this.storyHandler?.onStageOk();
                break;
            case 'stop':
                this.storyHandler?.stopPlaying({ fade: true });
                break;
            case 'home':
                this.storyHandler?.onStageHome();
                break;
            case 'previous':
                this.storyHandler?.selectPreviousStage();
                break;
            case 'next':
                this.storyHandler?.selectNextStage();
                break;
        }
    }
    onReady() {
        UIApplication.sharedApplication.beginReceivingRemoteControlEvents();
        const sharedCommandCenter = MPRemoteCommandCenter.sharedCommandCenter();
        sharedCommandCenter.nextTrackCommand.addTargetWithHandler((event) => {
            this.storyHandler?.selectNextStage();
            return MPRemoteCommandHandlerStatus.Success;
        });
        sharedCommandCenter.previousTrackCommand.addTargetWithHandler((event) => {
            this.storyHandler?.selectPreviousStage();
            return MPRemoteCommandHandlerStatus.Success;
        });
        sharedCommandCenter.togglePlayPauseCommand.addTargetWithHandler((event) => {
            this.storyHandler?.togglePlayState();
            return MPRemoteCommandHandlerStatus.Success;
        });
        sharedCommandCenter.likeCommand.addTargetWithHandler((event) => {
            this.storyHandler?.onStageOk();
            return MPRemoteCommandHandlerStatus.Success;
        });
        sharedCommandCenter.bookmarkCommand.addTargetWithHandler((event) => {
            this.storyHandler?.onStageHome();
            return MPRemoteCommandHandlerStatus.Success;
        });
        sharedCommandCenter.stopCommand.addTargetWithHandler((event) => {
            this.storyHandler?.stopPlaying({ fade: true });
            return MPRemoteCommandHandlerStatus.Success;
        });
    }
    commandHandlers: { [k: string]: any } ={};
    _enableDisableCommand(id: string, command: MPRemoteCommand, enabled: boolean) {
        if (enabled) {
            if (!this.commandHandlers[id]) {
                this.commandHandlers[id] = command.addTargetWithHandler(() => {
                    this.handleButtonAction(id);
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
            const controlSettings = currentStage?.controlSettings;
            const keys = [
                MPMediaItemPropertyTitle,
                MPMediaItemPropertyAlbumTitle,
                MPMediaItemPropertyPlaybackDuration,
                MPNowPlayingInfoPropertyPlaybackRate,
                MPNowPlayingInfoPropertyElapsedPlaybackTime
            ];
            const objects = [playingInfo.name, playingInfo.description, playingInfo.duration / 1000, this.playingState === 'play' ? 1 : 0, this.storyHandler.playerCurrentTime / 1000];
            DEV_LOG && console.log('updatePlayerNotification', this.playingState);
            if (playingInfo.cover) {
                const cover = await playingInfo.cover();
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
            this._enableDisableCommand('pause', sharedCommandCenter.togglePlayPauseCommand, !controlSettings || controlSettings?.pause);
            this._enableDisableCommand('ok', sharedCommandCenter.likeCommand, controlSettings?.ok === true);
            this._enableDisableCommand('home', sharedCommandCenter.bookmarkCommand, !!currentStage && stageCanGoHome(currentStage));
            this._enableDisableCommand('stop', sharedCommandCenter.stopCommand, true);
            MPNowPlayingInfoCenter.defaultCenter().nowPlayingInfo = NSDictionary.dictionaryWithObjectsForKeys(objects, keys);
            MPNowPlayingInfoCenter.defaultCenter().playbackState = this.playingState === 'play' ? MPNowPlayingPlaybackState.Playing : MPNowPlayingPlaybackState.Paused;
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
