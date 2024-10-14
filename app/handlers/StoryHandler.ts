import { AdditiveTweening } from '@nativescript-community/additween';
import { TNSPlayer } from '@nativescript-community/audio';
import { lc } from '@nativescript-community/l';
import { Application, ApplicationSettings, EventData, ImageSource, Observable, ObservableArray } from '@nativescript/core';
import { Optional } from '@nativescript/core/utils/typescript-utils';
import { showError } from '@shared/utils/showError';
import { Pack, Stage, Story } from '~/models/Pack';
import { prefs } from '~/services/preferences';
import { COLORMATRIX_INVERSED_BLACK_TRANSPARENT, DEFAULT_INVERSE_IMAGES, SETTINGS_CURRENT_PLAYING, SETTINGS_INVERSE_IMAGES } from '~/utils/constants';
import { Handler } from './Handler';
import { clearInterval, debounce } from '@nativescript/core/utils';
import { closeApp } from '~/utils';
import { documentsService } from '~/services/documents';

export type PlayingState = 'stopped' | 'playing' | 'paused';

function shuffleArray(arr) {
    return arr.sort(() => Math.random() - 0.5);
}

function shuffle(array) {
    let currentIndex = array.length;

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
        // Pick a remaining element...
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
}

function getRandomFromArray(array) {
    return array[Math.floor(Math.random() * array.length)];
}
export const PlaybackEvent = 'playback';
export const PlaybackTimeEvent = 'playbackTime';
export const PackStartEvent = 'packStart';
export const PackStopEvent = 'packStop';
export const StagesChangeEvent = 'stagesChange';
export const StoryStartEvent = 'storyStart';
export const StoryStopEvent = 'storyStop';

export interface PackStartEventData extends Optional<EventData<Observable>, 'object'> {
    pack?: Pack;
}
export interface StoryStartEventData extends Optional<EventData<Observable>, 'object'> {
    story?: Story;
}
export interface StageEventData extends PackStartEventData {
    currentStatesChanged?: boolean;
    playingInfo?: PlayingInfo;
    stages?: Stage[];
    selectedStageIndex?: number;
    currentStage?: Stage;
}
export interface PlaybackEventData extends StageEventData {
    state?: PlayingState;
    playingInfo?: PlayingInfo;
}

export interface PlayingInfo {
    pack: Pack;
    canPause?: boolean;
    canHome?: boolean;
    canStop?: boolean;
    canNext?: boolean;
    canPrev?: boolean;
    canOk?: boolean;
    durations?: number[];
    duration: number;
    state: PlayingState;
    name: any;
    description?: any;
    cover?: () => string | ImageSource;
    // cover?: () => Promise<string | ImageSource>;
}

export interface PlaylistItem {
    pack?: Pack;
    packId?: Pack;
    story?: Story;
}
export type Playlist = ObservableArray<PlaylistItem>;

let inverseImagesColors = ApplicationSettings.getBoolean(SETTINGS_INVERSE_IMAGES, DEFAULT_INVERSE_IMAGES);
export let imagesMatrix: number[] = null;
prefs.on(`key:${SETTINGS_INVERSE_IMAGES}`, () => {
    inverseImagesColors = ApplicationSettings.getBoolean(SETTINGS_INVERSE_IMAGES);
    imagesMatrix = inverseImagesColors ? COLORMATRIX_INVERSED_BLACK_TRANSPARENT : null;
});

const TAG = '[Story]';
export class StoryHandler extends Handler {
    appExited = false;
    positionState: { [k: string]: any } = {};
    playingPack: Pack;
    playingStory: Story;
    selectedStageIndex: number = 0;
    currentStages: Stage[] = [];
    // stages: Stage[];
    // actions: Action[];
    mPlayer: TNSPlayer;

    isPlaying = false;
    isPlayingPaused = false;
    mCanStopStoryPlayback = false;
    oldStageUuid: string;

    playlist: Playlist = new ObservableArray();

    get playerCurrentTime() {
        return this.mPlayer?.currentTime || 0;
    }
    get pack() {
        return this.playingPack || this.playingStory?.pack;
    }
    playerState: PlayingState = 'stopped';

    currentPlayingInfo: PlayingInfo = null;
    currentStageImage: string = null;
    playingInfo(): PlayingInfo {
        if (this.isPlaying) {
            let pack = this.playingPack;
            if (pack) {
                const currentStage = this.currentStageSelected();
                const duration = this.mPlayer?.duration || 0;
                let name = pack.title;
                let description = pack.subtitle || pack.description;
                if (currentStage) {
                    if (duration > 10000 || pack.stageIsStory(currentStage)) {
                        name = this.getStoryName(pack, currentStage) || name;
                        if (name !== pack.title) {
                            description = name;
                        }
                    } else if (pack.isMenuStage(currentStage)) {
                        description = name;
                        name = pack.cleanupStageName(currentStage);
                    }
                }
                // DEV_LOG && console.log('updating playing info', currentStage.uuid, currentStage.image, duration, name);
                const canNextPrev = this.currentStages?.length > 1;
                return {
                    pack,
                    canPause: pack.canPause(currentStage),
                    canHome: pack.canHome(currentStage),
                    canOk: pack.canOk(currentStage),
                    canNext: canNextPrev,
                    canPrev: canNextPrev,
                    state: this.playerState,
                    duration,
                    name,
                    description,
                    cover: () => this.getStageImage(pack, currentStage)
                };
            } else if (this.playingStory) {
                const episode = this.playingStory;
                pack = episode.pack;

                // we need to get the total duration
                return {
                    pack,
                    canPause: true,
                    canHome: false,
                    canOk: false,
                    canNext: this.playlist.length > 1,
                    state: this.playerState,
                    durations: episode.durations,
                    duration: episode.duration,
                    name: episode.name + (pack.extra?.podcast && episode.episode !== undefined ? ` (${lc('episode', episode.episode)})` : ''),
                    description: pack.title,
                    cover: () => episode?.thumbnail || pack.getThumbnail()
                };
            }
        }
        return { duration: 0, name: null, pack: null, state: 'stopped' };
    }

    async stop() {
        DEV_LOG && console.log(TAG, 'stop');
        await this.stopPlaying({ clearCurrentSaved: false });
        DEV_LOG && console.log(TAG, 'stop done');
    }
    saveSettings: Function;
    async start() {
        try {
            this.saveSettings = debounce(this.saveSettingsInternal, 500);
            const saved = ApplicationSettings.getString(SETTINGS_CURRENT_PLAYING);
            if (saved) {
                // ApplicationSettings.remove(SETTINGS_CURRENT_PLAYING);
                const data = JSON.parse(saved) as any[];
                const dataLength = data.length;
                if (dataLength) {
                    let firstData;
                    const updatePlaylist = () => {
                        this.playlist.push(
                            firstData,
                            ...(dataLength > 1
                                ? data.slice(1).map((c) => {
                                      switch (current.type) {
                                          case 'pack': {
                                              return {
                                                  packId: c.packId
                                              };
                                          }
                                          case 'story': {
                                              const { type, ...story } = c;
                                              return {
                                                  story
                                              };
                                          }
                                      }
                                  })
                                : [])
                        );
                    };
                    const current = data[0];
                    if (dataLength > 1) {
                    }
                    switch (current.type) {
                        case 'pack': {
                            const pack = await documentsService.packRepository.get(current.packId);
                            firstData = { pack };
                            updatePlaylist();
                            await pack.initData();
                            this.playPack({
                                pack,
                                startData: {
                                    index: current.selectedStageIndex,
                                    stages: [pack.findStage(current.stageUuid)]
                                },
                                seek: current.currentAudioTime,
                                autoPlay: false,
                                updatePlaylist: false
                            });
                            break;
                        }
                        case 'story': {
                            const { type, currentAudioTime, ...story } = current;
                            firstData = { story };
                            updatePlaylist();
                            this.playStory({
                                story,
                                seek: current.currentAudioTime,
                                autoPlay: false,
                                updatePlaylist: false
                            });
                            break;
                        }
                        default:
                            break;
                    }
                }
            }
            DEV_LOG && console.log(TAG, 'start');
        } catch (err) {
            console.error('dbHandler', 'start error', err, err.stack);
            return Promise.reject(err);
        }
    }

    clearPlayer() {
        // ensure current player is stopped
        // DEV_LOG && console.info('clearPlayer');
        const oldPlayer = this.mPlayer;
        oldPlayer?.stop();
        this.mPlayer = new TNSPlayer();
        oldPlayer?.dispose();
    }
    playingAudioPromise: Promise<any> = null;

    _setPlaybackState(state: PlayingState) {
        switch (state) {
            case 'playing':
                if (this.saveSettingsInterval) {
                    clearInterval(this.saveSettingsInterval);
                }
                this.saveSettingsInterval = setInterval(() => {
                    this.saveSettings();
                }, 10000);
                break;

            default:
                if (this.saveSettingsInterval) {
                    clearInterval(this.saveSettingsInterval);
                    this.saveSettingsInterval = null;
                }
                break;
        }
        this.saveSettings();
        this.playerState = state;
        this.currentPlayingInfo.state = state;
        this.notify({ eventName: PlaybackEvent, state, playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
    }

    saveSettingsInterval;
    async playAudio({
        autoPlay = true,
        fileName,
        dataSource,
        seek,
        loop = false,
        throwErrorUp = true,
        updatePlayingInfo = true
    }: {
        fileName: string;
        dataSource?: any;
        seek?: number;
        autoPlay?: boolean;
        loop?: boolean;
        throwErrorUp?: boolean;
        updatePlayingInfo?: boolean;
    }) {
        DEV_LOG && console.info('playAudio', fileName, dataSource, seek, autoPlay);
        try {
            await new Promise<void>(async (resolve, reject) => {
                try {
                    let resolved = false;
                    this.clearPlayer();
                    await this.mPlayer.playFromFile({
                        autoPlay,
                        seek,
                        audioFile: fileName,
                        dataSource,
                        loop,
                        ...(__IOS__
                            ? {
                                  sessionCategory: AVAudioSessionCategoryPlayback,
                                  active: true
                              }
                            : {}),
                        completeCallback: async () => {
                            // this.clearPlayer();
                            if (!loop && !resolved) {
                                resolved = true;
                                resolve();
                            }
                            this._setPlaybackState('stopped');
                        },
                        errorCallback: async (e) => {
                            DEV_LOG && console.error('errorCallback', fileName, e.error);
                            this._setPlaybackState('stopped');
                            if (!resolved) {
                                resolved = true;
                                if (throwErrorUp) {
                                    reject(e.error);
                                } else {
                                    resolve();
                                }
                            }
                        }
                    });
                    if (updatePlayingInfo) {
                        this.currentPlayingInfo = this.playingInfo();
                    }
                    this._setPlaybackState(autoPlay ? 'playing' : 'paused');
                } catch (error) {
                    reject(error);
                }
            });
        } finally {
        }
    }
    currentStoryAudioIndex = 0;
    async playAudios({ audios, autoPlay = true, seek, updatePlayingInfo = true, onDone }: { audios: string[]; seek?: number; autoPlay?: boolean; updatePlayingInfo?: boolean; onDone?: Function }) {
        TEST_LOG && console.log('playAudios', updatePlayingInfo, autoPlay, seek);
        try {
            // we use throwErrorUp to ensure the loops stop and we dont play other audios
            for (let index = 0; index < audios.length; index++) {
                if (!this.isPlaying) {
                    break;
                }
                this.currentStoryAudioIndex = index;
                if (index === 0) {
                    await this.playAudio({ fileName: audios[index], loop: false, throwErrorUp: true, updatePlayingInfo, seek, autoPlay });
                } else {
                    await this.playAudio({ fileName: audios[index], loop: false, throwErrorUp: true, updatePlayingInfo });
                }
            }
            onDone?.();
        } catch (error) {
            showError(error);
        } finally {
        }
    }

    pausedStoryPlayTime = 0;
    async pausePlayback() {
        if (this.isPlaying) {
            this.mPlayer.pause();
            // this.lyric?.pause();
            this.isPlayingPaused = true;
            this.pausedStoryPlayTime = this.mPlayer.currentTime;
            DEV_LOG && console.log(TAG, 'pausePlayback', this.pausedStoryPlayTime);
            this._setPlaybackState('paused');
        }
    }
    async togglePlayState() {
        // DEV_LOG && console.log('togglePlayState', this.isPlaying, this.isPlayingPaused, this.playerState);
        if (this.isPlaying) {
            if (this.playerState === 'playing') {
                this.pausePlayback();
            } else {
                this.resumePlayback();
            }
        }
    }
    async resumePlayback() {
        if (this.isPlaying) {
            this.mPlayer.resume();
            // this.lyric?.play(this.pausedStoryPlayTime);
            this.isPlayingPaused = false;
            DEV_LOG && console.log(TAG, 'resumeStory', this.pausedStoryPlayTime);
            this.pausedStoryPlayTime = 0;
            this._setPlaybackState('playing');
        }
    }
    async setPlayerTimestamp(playTime: number) {
        // DEV_LOG && console.log(TAG, 'setStoryTimestamp', playTime, this.isPlaying, this.isPlayingPaused);
        if (this.isPlaying) {
            this.mPlayer.seekTo(playTime / 1000);
            if (this.isPlayingPaused) {
                this.pausedStoryPlayTime = playTime;
            } else {
                // this.lyric?.play(playTime);
            }
            this.notify({ eventName: PlaybackTimeEvent, state: this.playerState, playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
        }
    }
    nextStageFrom(stage?: Stage): Stage[] {
        // DEV_LOG && console.log('nextStageFrom', JSON.stringify(stage));
        return this.pack.nextStageFrom(stage);
    }
    homeStageFrom(stage?: Stage): Stage[] {
        return this.pack.homeStageFrom(stage);
    }
    currentStageSelected() {
        return this.currentStages?.[this.selectedStageIndex];
    }

    getStageImage(pack: Pack, stage: Stage): string | ImageSource {
        return pack?.getCurrentStageImage(stage, this.currentStageSelected(), this.currentStageImage);
    }
    getCurrentStageImage() {
        if (this.playingPack && this.currentStageImage) {
            return this.playingPack.getImage(this.currentStageImage) || this.playingPack.getThumbnail();
        }
        return this.playingStory?.thumbnail || this.playingPack?.getThumbnail();
    }
    getStageName(pack: Pack, stage: Stage) {
        if (pack && stage) {
            if (pack.stageIsStory(stage)) {
                return this.getStoryName(pack, stage);
            }
            return pack.cleanupStageName(stage);
        }
    }
    getStoryName(pack: Pack, stage: Stage) {
        if (pack) {
            return this.pack.getStoryName(stage);
        }
    }

    findStoryImage(s: Stage) {
        return this.pack.findStoryImage(s);
    }
    setSelectedStage(index: number) {
        if (this.selectedStageIndex !== index && this.selectedStageIndex < this.currentStages.length - 1) {
            this.selectedStageIndex = index;
            this.notifyStageChange(false);
            this.runStage();
        }
    }
    selectPreviousStage() {
        this.setSelectedStage((this.selectedStageIndex - 1 + this.currentStages.length) % this.currentStages.length);
    }
    selectNextStage() {
        this.setSelectedStage((this.selectedStageIndex + 1) % this.currentStages.length);
    }
    handleAction(action: string) {
        switch (action) {
            case 'play':
            case 'pause':
                this.togglePlayState();
                break;
            case 'ok':
                if (this.playingStory && this.playlist.length > 1) {
                    this.stopPlaying({ updatePlaylist: true, closeFullscreenPlayer: true });
                } else if (this.playingPack) {
                    this.onStageOk();
                }
                break;
            case 'stop':
                this.stopPlaying();
                break;
            case 'home':
                this.onStageHome();
                break;
            case 'previous':
                this.selectPreviousStage();
                break;
            case 'next':
                if (this.playingStory && this.playlist.length > 1) {
                    this.stopPlaying({ updatePlaylist: true, closeFullscreenPlayer: true });
                } else if (this.playingPack) {
                    this.selectNextStage();
                }
                break;
            case 'shutdown':
                this.stopPlaying({ clearCurrentSaved: false });
                closeApp();
                break;
        }
    }
    stageChangeEventData() {
        return { pack: this.playingPack, stages: this.currentStages, selectedStageIndex: this.selectedStageIndex, currentStage: this.currentStageSelected() };
    }
    async notifyStageChange(currentStatesChanged = true) {
        try {
            const stage = this.currentStageSelected();
            const pack = this.pack;
            this.currentStageImage = pack.stageIsStory(stage) ? undefined : stage?.image;
            // this.currentStageImage = stage?.image;
            this.currentPlayingInfo = this.playingInfo();
            // DEV_LOG && console.info('notifyStageChange', stage?.image, stage.uuid, this.currentStages.length, this.selectedStageIndex, this.currentStageImage);
            this.notify({ eventName: StagesChangeEvent, playingInfo: this.currentPlayingInfo, currentStatesChanged, ...this.stageChangeEventData() } as StageEventData);
        } catch (error) {
            showError(error);
        }
    }

    async onStageOk(autoPlay = true, seek?: number) {
        const pack = this.pack;
        const oldSelected = this.currentStageSelected();
        this.oldStageUuid = oldSelected.uuid;
        const oldSelectedIndex = this.selectedStageIndex;
        DEV_LOG && console.log('onStageOk', oldSelectedIndex, oldSelected.uuid, pack.hasOkTransition(oldSelected), pack.hasHomeTransition(oldSelected));
        if (!pack.hasOkTransition(oldSelected)) {
            // should be packed ended
            this.stopPlaying({ updatePlaylist: true });
            return;
        }
        const nextStages = this.nextStageFrom(oldSelected) || [];
        // DEV_LOG &&
        //     console.log(
        //         'nextStages',
        //         nextStages.map((s) => s.uuid),
        //         JSON.stringify(nextStages)
        //     );

        const optionIndex = pack.okTransitionIndex(this.currentStages[oldSelectedIndex]) ?? 0;

        this.currentStages = pack.mapOfStagesForOption(nextStages);
        // DEV_LOG && console.log('this.currentStages', JSON.stringify(this.currentStages));
        this.selectedStageIndex = optionIndex !== undefined ? (optionIndex >= 0 ? optionIndex : Math.round(Math.random() * (this.currentStages.length - 1))) : 0;
        const currentStageSelected = this.currentStageSelected();
        // DEV_LOG && console.log('optionIndex', optionIndex, this.selectedStageIndex, this.currentStages.length, currentStageSelected?.uuid);
        if (pack.isMissingHome(currentStageSelected)) {
            // the json is missing the homeTransition. Let s fake it
            pack.buildMissingHome(currentStageSelected);
        }
        await this.notifyStageChange();
        this.runStage(autoPlay, seek);
    }
    setStage(stage: Stage) {
        this.currentStages = [stage];
        this.selectedStageIndex = 0;
        this.notifyStageChange();
        this.runStage();
    }
    onStageHome() {
        const pack = this.pack;
        const selected = this.currentStageSelected();
        if (!pack.canHome(selected)) {
            return;
        }
        const nextStages = pack.homeStageFrom(selected) || [];

        // const optionIndex = homeTransition?.optionIndex;
        const optionIndex = pack.homeTransitionIndex(selected);
        this.selectedStageIndex = optionIndex !== undefined ? (optionIndex >= 0 ? optionIndex : Math.round(Math.random() * (this.currentStages.length - 1))) : 0;

        this.currentStages = pack.mapOfStagesForOption(nextStages);
        // for now we always reset to 0 as many stories have the wrong index set
        this.selectedStageIndex = optionIndex;
        // this.selectedStageIndex = optionIndex;
        this.notifyStageChange();
        this.runStage();
    }
    async runStage(autoPlay = true, seek?: number) {
        try {
            const pack = this.playingPack;
            if (!pack) {
                return;
            }
            this.saveSettings();
            const stage = this.currentStageSelected();
            // this.notify({ eventName: 'runStage', stage, selectedStageIndex: this.selectedStageIndex, stages: this.currentStages });
            DEV_LOG && console.info('runStage', JSON.stringify(stage), this.currentStages.length);
            if (stage.audio) {
                const compressed = this.playingPack.compressed;
                const fileName = this.playingPack.getAudio(stage.audio);
                const dataSource = compressed && __ANDROID__ ? new com.akylas.conty.ZipMediaDataSource(this.playingPack.zipPath, fileName.split('@').pop()) : undefined;
                await this.playAudio({ fileName, dataSource, autoPlay, seek });
                if (pack.stageIsStory(stage) && this.appExited) {
                    this.stopPlaying();
                    return;
                }
            }
            // DEV_LOG && console.log('runStage playAudio done', stage === this.currentStageSelected(), this.currentStages.length, pack.isAutoPlay(stage));
            if (stage === this.currentStageSelected() /*  && stage?.controlSettings?.autoplay === true */ && (this.currentStages.length === 1 || pack.isAutoPlay(stage))) {
                await this.onStageOk();
            }
        } catch (error) {
            if (error) {
                showError(error);
                this.stopPlaying();
            } else {
                //cancelled (could be on ok or home)
            }
        }
    }
    async playPack({
        pack,
        updatePlaylist = true,
        autoPlay = true,
        seek,
        startData
    }: {
        pack: Pack;
        updatePlaylist?: boolean;
        autoPlay?: boolean;
        seek?: number;
        startData?: {
            stages: Stage[];
            index: number;
        };
    }) {
        TEST_LOG && console.log('playPack', pack.id, pack.title, this.isPlaying, autoPlay, seek, startData);
        if (this.isPlaying) {
            await this.stopPlaying({ closeFullscreenPlayer: false });
            // return new Promise<void>((resolve) => {
            //     this.toPlayNext = async () => {
            //         await this.playStory(pack);
            //         resolve();
            //     };
            // });
        }
        if (updatePlaylist) {
            this.playlist.splice(0, this.playlist.length, { pack });
        }
        try {
            this.isPlaying = true;
            this.playingPack = pack;
            await pack.initData();
            // this.actions = data.actions;
            // this.stages = data.stages;
            // DEV_LOG && console.log('this.actionNodes', JSON.stringify(this.actionNodes));
            // DEV_LOG && console.log('this.stageNodes', JSON.stringify(this.stageNodes));
            // DEV_LOG && console.log('playPack data', this.actionNodes.length, this.stageNodes.length);
            startData = startData || pack.startData();
            this.selectedStageIndex = startData.index;
            this.currentStages = startData.stages;
            this.notify({ eventName: PackStartEvent, ...this.stageChangeEventData() } as PackStartEventData);
            // DEV_LOG && console.log('playPack1', JSON.stringify(this.currentStages));
            // this.notify({ eventName: StagesChangeEvent, stages: this.currentStages, selectedStageIndex: this.selectedStageIndex });
            // this.notify({ eventName: PlaybackEvent, data: 'play' });
            // we call onStageOk directly to
            this.onStageOk(autoPlay, seek);
            // mark story as played

            // this.playedStory(index + '', markAsPlayedOnMap);
            // this.notify({ eventName: PlaybackEvent, data: 'stopped' });
        } catch (error) {
            console.error(error, error.stack);
            throw error;
        } finally {
            // DEV_LOG && console.log('finished playing story');
            // this.pausedStoryPlayTime = 0;
        }
    }
    async playStory({ story, autoPlay = true, seek, updatePlaylist = true }: { story: Story; updatePlaylist?: boolean; autoPlay?: boolean; seek?: number }) {
        TEST_LOG && console.log('playStory', this.isPlaying, story.name, JSON.stringify(story.audioFiles), JSON.stringify(story.images), JSON.stringify(story.names));
        if (!story.pack) {
            story.pack = await documentsService.packRepository.get(story.packId);
        }
        if (this.isPlaying) {
            await this.stopPlaying({ closeFullscreenPlayer: false });
            // return new Promise<void>((resolve) => {
            //     this.toPlayNext = async () => {
            //         await this.playStory(pack);
            //         resolve();
            //     };
            // });
        }
        if (updatePlaylist) {
            this.playlist.splice(0, this.playlist.length, { story });
        }
        try {
            this.isPlaying = true;
            this.playingStory = story;
            this.currentPlayingInfo = this.playingInfo();
            this.notify({ eventName: StoryStartEvent, story } as StoryStartEventData);
            this.playAudios({
                audios: story.audioFiles,
                updatePlayingInfo: false,
                autoPlay,
                seek,
                onDone: () => {
                    this.stopPlaying({ updatePlaylist: true });
                }
            });
        } catch (error) {
            showError(error);
        } finally {
        }
    }
    getPlayingPack() {
        return this.playingPack || this.playingStory?.pack;
    }
    async handleOnPlayingEndPlaylist() {
        if (this.playlist.length > 0) {
            this.playlist.shift();
            if (this.playlist.length > 0) {
                const toPlay = this.playlist.getItem(0);
                if (toPlay.pack) {
                    this.playPack({ pack: toPlay.pack, updatePlaylist: false });
                } else if (toPlay.packId) {
                    this.playPack({ pack: await documentsService.packRepository.get(toPlay.packId), updatePlaylist: false });
                } else if (toPlay.story) {
                    this.playStory({ story: toPlay.story, updatePlaylist: false });
                }
            }
        }
    }
    async stopPlaying({ fade = false, closeFullscreenPlayer = true, updatePlaylist = false, clearCurrentSaved = true } = {}) {
        if (!this.isPlaying) {
            return;
        }
        TEST_LOG && console.log('stopPlaying', fade, this.isPlaying);

        const onDone = async () => {
            try {
                this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: null, closeFullscreenPlayer, ...this.stageChangeEventData() } as PlaybackEventData);
                this.selectedStageIndex = 0;
                this.currentStages = [];
                this.isPlayingPaused = false;
                this.isPlaying = false;
                this.oldStageUuid = null;
                this.currentPlayingInfo = null;
                const currentPlayingPack = this.playingPack;
                const currentPlayingStory = this.playingStory;
                this.playingPack = null;
                this.playingStory = null;
                this.clearPlayer();
                if (currentPlayingPack) {
                    this.notify({ eventName: PackStopEvent, pack: currentPlayingPack, closeFullscreenPlayer: updatePlaylist ? this.playlist.length <= 1 : closeFullscreenPlayer });
                    if (updatePlaylist) {
                        this.handleOnPlayingEndPlaylist();
                    }

                    currentPlayingPack.close();
                } else if (currentPlayingStory) {
                    this.notify({
                        eventName: StoryStopEvent,
                        story: currentPlayingStory,
                        closeFullscreenPlayer: updatePlaylist ? this.playlist.length <= 1 : closeFullscreenPlayer
                    } as StoryStartEventData);
                    if (updatePlaylist) {
                        this.handleOnPlayingEndPlaylist();
                    }
                    currentPlayingStory.pack.close();
                }
                this.saveSettingsInternal(clearCurrentSaved);
            } catch (error) {
                showError(error);
            }

            TEST_LOG && console.warn('stopPlaying');
            // if (this.lyric) {
            //     this.lyric.pause();
            //     this.lyric = null;
            // }
            if (this.appExited) {
                Application.notify({ eventName: 'shouldStopBgService' });
            }
        };

        if (this.mPlayer?.isAudioPlaying()) {
            if (fade) {
                try {
                    await new Promise((resolve) => {
                        const anim = new AdditiveTweening({
                            onRender: (obj) => {
                                this.mPlayer.volume = obj.value;
                            },
                            onFinish: resolve
                        });
                        anim.tween({ value: 1 }, { value: 0 }, 500);
                    });
                } catch (error) {
                    console.error('audio fade tween', error, error.stack);
                } finally {
                    await onDone();
                }
            } else {
                await onDone();
            }
        } else {
            await onDone();
        }
    }
    async findAllStories(pack: Pack, podcastMode = false) {
        return pack.findAllStories(podcastMode);
    }

    canOverrideButtons() {
        return this.isPlaying && this.currentStages.length > 1;
    }

    saveSettingsInternal = (clear = true) => {
        const currentAudioTime = Math.floor(this.playerCurrentTime / 1000);
        DEV_LOG && console.log('saveSettingsInternal', currentAudioTime, !!this.playingPack, !!this.playingStory);
        if (this.playingPack) {
            ApplicationSettings.setString(
                SETTINGS_CURRENT_PLAYING,
                JSON.stringify([
                    {
                        type: 'pack',
                        packId: this.playingPack.id,
                        stageUuid: this.oldStageUuid,
                        selectedStageIndex: this.selectedStageIndex,
                        currentAudioTime
                    }
                ])
            );
        } else if (this.playingStory) {
            const data = this.playlist.map((p, index) => {
                if (index === 0) {
                    if (p.pack) {
                        return {
                            type: 'pack',
                            packId: p.pack.id,
                            stageUuid: this.oldStageUuid,
                            selectedStageIndex: this.selectedStageIndex,
                            currentAudioTime
                        };
                    } else {
                        const { pack, ...data } = p.story;
                        return {
                            type: 'story',
                            packId: pack.id,
                            ...data,
                            currentAudioTime
                        };
                    }
                } else {
                    const { pack, packId, ...data } = p.story;
                    return {
                        type: 'story',
                        packId: packId || pack.id,
                        ...data
                    };
                }
            });
            ApplicationSettings.setString(SETTINGS_CURRENT_PLAYING, JSON.stringify(data));
        } else if (clear) {
            ApplicationSettings.remove(SETTINGS_CURRENT_PLAYING);
        }
    };
}
