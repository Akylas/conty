import { ANDROID_ENCODER_PCM, TNSPlayer } from '@nativescript-community/audio';
import { lc } from '@nativescript-community/l';
import { EventData, File, ImageSource, Observable, path } from '@nativescript/core';
import { Action, Pack, Stage } from '~/models/Pack';
import { Handler } from './Handler';
import { AdditiveTweening } from 'additween';
import { eventNames } from 'process';
import { showError } from '~/utils/showError';
import { Optional } from '@nativescript/core/utils/typescript-utils';

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
export const PackStartEvent = 'packStart';
export const PackStopEvent = 'packStop';

export interface PackStartEventData extends Optional<EventData<Observable>, 'object'> {
    pack?: Pack;
}
export interface StageEventData extends PackStartEventData {
    playingInfo?: PlayingInfo;
    stages?: Stage[];
    selectedStageIndex?: number;
    currentStage?: Stage;
}
export interface PlaybackEventData extends StageEventData {
    state?: 'pause' | 'play' | 'stopped';
    playingInfo?: PlayingInfo;
}

export interface PlayingInfo {
    canPause?: boolean;
    canStop?: boolean;
    duration: number;
    name: any;
    description?: any;
    cover?: () => Promise<string | ImageSource>;
}

const TAG = '[Story]';
export class StoryHandler extends Handler {
    positionState: { [k: string]: any } = {};
    pack: Pack;
    selectedStageIndex: number = 0;
    currentStages: Stage[] = [];
    stageNodes: Stage[];
    actionNodes: Action[];
    mPlayer = new TNSPlayer();

    isPlaying = false;
    isPlayingPaused = false;
    mCanStopStoryPlayback = false;
    toPlayNext: Function = null;

    get playerCurrentTime() {
        return this.mPlayer?.currentTime || 0;
    }

    get playerState() {
        if (this.isPlaying) {
            return this.isPlayingPaused ? 'pause' : 'play';
        }
        return 'stopped';
    }
    currentPlayingInfo: PlayingInfo = null;
    currentStageImage: string = null;
    playingInfo(): PlayingInfo {
        if (this.isPlaying) {
            const currentStage = this.currentStageSelected();
            const duration = this.mPlayer?.duration || 0;
            let name = this.pack.title;
            let description = this.pack.description;
            if (currentStage) {
                if (duration > 10000) {
                    description = name;
                    name = this.getStoryName(this.pack, currentStage);
                } else if (currentStage.type === 'menu.optionstage' || (currentStage.type === 'stage' && currentStage.controlSettings.ok)) {
                    description = name;
                    name = currentStage.name;
                }
            }

            return {
                canPause: currentStage?.controlSettings?.pause,
                duration,
                name,
                description,
                cover: async () => this.getStageImage(this.pack, this.currentStageSelected())
            };
        }
        return { duration: 0, name: null };
    }

    async stop() {
        DEV_LOG && console.log(TAG, 'stop');
        await this.stopPlaying();
        DEV_LOG && console.log(TAG, 'stop done');
    }
    async start() {
        try {
            DEV_LOG && console.log(TAG, 'start');
        } catch (err) {
            console.error('dbHandler', 'start error', err, err.stack);
            return Promise.reject(err);
        }
    }

    async playAudio({ fileName, loop = false, notify = false, throwErrorUp = false }: { fileName: string; loop?: boolean; notify?: boolean; throwErrorUp?: boolean }) {
        DEV_LOG && console.log('playAudio', fileName);
        // if (!File.exists(fileName)) {
        //     throw new Error(lc('file_not_found', fileName));
        // }
        return new Promise<void>(async (resolve, reject) => {
            try {
                const compressed = this.pack.compressed;
                let resolved = false;
                await this.mPlayer.playFromFile({
                    autoPlay: true,
                    audioFile: compressed ? undefined : fileName,
                    dataSource: compressed && __ANDROID__ ? new com.akylas.conty.ZipMediaDataSource(this.pack.zipPath, fileName.split('@').pop()) : undefined,
                    loop,
                    completeCallback: () => {
                        if (!loop && !resolved) {
                            resolved = true;
                            resolve();
                        }
                        this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
                    },
                    errorCallback: () => {
                        this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
                        if (!resolved) {
                            resolved = true;
                            if (throwErrorUp) {
                                reject();
                            } else {
                                resolve();
                            }
                        }
                    }
                });
                this.currentPlayingInfo = this.playingInfo();
                this.notify({ eventName: PlaybackEvent, state: 'play', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
            } catch (error) {
                console.error('playAudio ', error, error.stack);
                reject(error);
            }
        });
    }

    async playAudios(audios: string[], loop = false) {
        try {
            // we use throwErrorUp to ensure the loops stop and we dont play other audios
            for (let index = 0; index < audios.length; index++) {
                await this.playAudio({ fileName: audios[index], loop, throwErrorUp: true });
            }
        } catch (err) {}
    }

    pausedStoryPlayTime = 0;
    async pauseStory() {
        if (this.isPlaying) {
            this.mPlayer.pause();
            // this.lyric?.pause();
            this.isPlayingPaused = true;
            this.pausedStoryPlayTime = this.mPlayer.currentTime;
            // DEV_LOG && console.log(TAG, 'pauseStory', this.pausedStoryPlayTime);
            this.notify({ eventName: PlaybackEvent, state: 'pause', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
        }
    }
    async togglePlayState() {
        DEV_LOG && console.log('togglePlayState', this.isPlaying, this.isPlayingPaused);
        if (this.isPlaying) {
            if (this.isPlayingPaused) {
                this.resumeStory();
            } else {
                this.pauseStory();
            }
        }
    }
    async resumeStory() {
        if (this.isPlaying) {
            this.mPlayer.resume();
            // this.lyric?.play(this.pausedStoryPlayTime);
            this.isPlayingPaused = false;
            // DEV_LOG && console.log(TAG, 'resumeStory', this.pausedStoryPlayTime);
            this.pausedStoryPlayTime = 0;
            this.notify({ eventName: PlaybackEvent, state: 'play', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
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
        }
    }
    nextStageFrom(stage?: Stage): Stage[] {
        // DEV_LOG && console.log('nextStageFrom', JSON.stringify(stage));
        if (stage?.okTransition === null) {
            return [];
        }
        const nextStageId = this.actionNodes.find((a) => a.id === stage.okTransition.actionNode).options;
        return nextStageId.map((n) => this.stageNodes.find((s) => s.uuid === n));
    }
    homeStageFrom(stage?: Stage): Stage[] {
        if (stage?.homeTransition === null) {
            return [];
        }
        const nextStageId = this.actionNodes.find((a) => a.id === stage.homeTransition.actionNode).options;
        return nextStageId.map((n) => this.stageNodes.find((s) => s.uuid === n));
    }
    currentStageSelected() {
        return this.currentStages?.[this.selectedStageIndex];
    }
    mapOfStagesForOption(stages: Stage[], optionIndex: number = -1): Stage[] {
        if (optionIndex === -1 || optionIndex >= stages.length) {
            if (stages.length && stages[0].controlSettings.autoplay) {
                // running it alone will ensure we play automatically
                return [stages[0]];
            }
            return stages;
        } else {
            return [stages[optionIndex]];
        }
    }
    isStory(s: Stage) {
        return s.type === 'story' || (s.audio && s.controlSettings.pause === true && s.controlSettings.ok === false);
    }

    async getStageImage(pack: Pack, stage: Stage): Promise<string | ImageSource> {
        if (pack) {
            if (stage === this.currentStageSelected()) {
                return (await pack.getImage(this.currentStageImage)) || pack.getThumbnail();
            } else {
                return (await pack.getImage(this.isStory(stage) ? this.findStoryImage(stage) : stage?.image)) || pack.getThumbnail();
            }
        }
    }
    async getCurrentStageImage() {
        if (this.pack && this.currentStageImage) {
            return (await this.pack.getImage(this.currentStageImage)) || this.pack.getThumbnail();
        }
    }
    getStageName(pack: Pack, stage: Stage) {
        if (pack && stage) {
            if (this.isStory(stage)) {
                return this.getStoryName(pack, stage);
            }
            return stage.name;
        }
    }
    getStoryName(pack: Pack, stage: Stage) {
        if (pack) {
            if (/\s*story[\s-_]*node\s*/.test(stage.name.toLowerCase())) {
                const action = this.actionNodes.find((a) => a.options.indexOf(stage.uuid) !== -1);
                const beforeStage = this.stageNodes.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id);
                return beforeStage?.name;
            }
            return stage.name;
        }
    }

    findStoryImage(s: Stage) {
        if (s.image) {
            return s.image;
        }
        const action = this.actionNodes.find((a) => a.options.indexOf(s.uuid) !== -1);
        const beforeStage = this.stageNodes.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id);
        return beforeStage?.image;
    }
    getAllPlayingStoriesFromPack() {
        return this.stageNodes.filter(this.isStory).sort((a, b) => a.name.localeCompare(b.name));
    }
    setSelectedStage(index: number) {
        if (this.selectedStageIndex !== index) {
            this.selectedStageIndex = index;
            this.notifyStageChange();
            this.runStage();
        }
    }
    stageChangeEventData() {
        return { pack: this.pack, stages: this.currentStages, selectedStageIndex: this.selectedStageIndex, currentStage: this.currentStageSelected() };
    }
    async notifyStageChange() {
        const stage = this.currentStageSelected();
        this.currentStageImage = this.isStory(stage) ? this.findStoryImage(stage) : stage?.image;
        this.currentPlayingInfo = this.playingInfo();
        this.notify({ eventName: 'stagesChange', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as StageEventData);
    }
    async onStageOk() {
        DEV_LOG && console.log('onStageOk', this.currentStageSelected()?.okTransition);
        if (this.currentStageSelected()?.okTransition === null) {
            return;
        }
        const nextStages = this.nextStageFrom(this.currentStageSelected()) || [];

        const optionIndex = this.currentStages[this.selectedStageIndex].okTransition?.optionIndex;

        this.currentStages = this.mapOfStagesForOption(nextStages);
        this.selectedStageIndex = optionIndex;
        await this.notifyStageChange();
        this.runStage();
    }
    setStage(stage: Stage) {
        this.currentStages = [stage];
        this.selectedStageIndex = 0;
        this.notifyStageChange();
        this.runStage();
    }
    onStageHome() {
        if (this.currentStageSelected()?.homeTransition === null) {
            return;
        }
        const nextStages = this.homeStageFrom(this.currentStageSelected()) || [];

        const optionIndex = this.currentStages[this.selectedStageIndex].homeTransition?.optionIndex;

        this.currentStages = this.mapOfStagesForOption(nextStages);
        this.selectedStageIndex = 0;
        this.notifyStageChange();
        this.runStage();
    }
    async runStage() {
        try {
            const stage = this.currentStageSelected();
            // this.notify({ eventName: 'runStage', stage, selectedStageIndex: this.selectedStageIndex, stages: this.currentStages });
            DEV_LOG && console.log('runStage', stage.uuid, stage.audio, stage.image, this.currentStages.length);
            if (stage.audio) {
                await this.playAudio({ fileName: this.pack.getAudio(stage.audio) });
                DEV_LOG && console.log('runStage playAudio done', stage.controlSettings);
                if (this.currentStageSelected()?.controlSettings?.autoplay === true) {
                    await this.onStageOk();
                }
            } else {
                await this.onStageOk();
            }
        } catch (error) {
            showError(error);
        }
    }
    async playPack(pack: Pack) {
        TEST_LOG && console.log('playPack', this.isPlaying, JSON.stringify({ pack, isPlaying: this.isPlaying }));
        if (this.isPlaying) {
            await this.stopPlaying();
            // return new Promise<void>((resolve) => {
            //     this.toPlayNext = async () => {
            //         await this.playStory(pack);
            //         resolve();
            //     };
            // });
        }
        try {
            this.isPlaying = true;
            this.pack = pack;
            const data = await pack.getData();
            this.actionNodes = data.actionNodes;
            this.stageNodes = data.stageNodes;
            DEV_LOG && console.log('playPack data', this.actionNodes.length, this.stageNodes.length);
            this.selectedStageIndex = 0;
            this.currentStages = [this.stageNodes.find((s) => s.squareOne === true)];
            this.notify({ eventName: PackStartEvent, ...this.stageChangeEventData() } as PackStartEventData);
            // DEV_LOG && console.log('playPack1', JSON.stringify(this.currentStages));
            // this.notify({ eventName: 'stagesChange', stages: this.currentStages, selectedStageIndex: this.selectedStageIndex });
            // this.notify({ eventName: PlaybackEvent, data: 'play' });
            // we call onStageOk directly to
            this.onStageOk();
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

    async stopPlaying({ fade = false } = {}) {
        TEST_LOG && console.log('stopPlaying', fade, this.mPlayer.isAudioPlaying(), this.isPlaying, !!this.toPlayNext);

        const onDone = async () => {
            try {
                this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: null, ...this.stageChangeEventData() } as PlaybackEventData);
                this.notify({ eventName: PackStopEvent });
            } catch (error) {
                showError(error);
            }
            // we need to wait to set those otherwise another instruction might want to start
            // before onDone and it could break the state machine
            if (this.pack) {
                this.pack.close();
                this.pack = null;
            }
            this.selectedStageIndex = 0;
            this.currentStages = [];
            this.stageNodes = [];
            this.actionNodes = [];
            this.isPlayingPaused = false;
            this.isPlaying = false;
            this.currentPlayingInfo = null;
            TEST_LOG && console.warn('stopPlaying');
            // if (this.lyric) {
            //     this.lyric.pause();
            //     this.lyric = null;
            // }
            this.mPlayer.stop();
            this.mPlayer['_options']?.errorCallback();
            try {
                await this.mPlayer.dispose();
            } catch (err) {
                console.error('error disposing player', err, err.stack);
            }
            this.mPlayer = new TNSPlayer();
            if (this.toPlayNext) {
                this.toPlayNext();
            }
            this.toPlayNext = null;
        };
        if (this.mPlayer.isAudioPlaying()) {
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
}
