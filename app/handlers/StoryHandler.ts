import { TNSPlayer } from '@nativescript-community/audio';
import { Application, EventData, ImageSource, Observable } from '@nativescript/core';
import { Optional } from '@nativescript/core/utils/typescript-utils';
import { AdditiveTweening } from '@nativescript-community/additween';
import { Action, Pack, Stage, Story, cleanupStageName, stageIsStory } from '~/models/Pack';
import { showError } from '~/utils/showError';
import { Handler } from './Handler';
import { lc } from '@nativescript-community/l';
import { getAudioDuration } from '~/utils';

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

function nextStageFrom(actionNodes: Action[], stageNodes: Stage[], stage?: Stage): Stage[] {
    // DEV_LOG && console.log('nextStageFrom', JSON.stringify(stage));
    if (!stage?.okTransition) {
        return [];
    }
    return actionNodes.find((a) => a.id === stage.okTransition.actionNode).options.map((n) => stageNodes.find((s) => s.uuid === n));
}

function mapOfStagesForOption(stages: Stage[], optionIndex: number = -1): Stage[] {
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

function findStoriesFromStage(actionNodes: Action[], stageNodes: Stage[], stage: Stage, storyPath: Stage[]): Stage[][] {
    const nextStages = nextStageFrom(actionNodes, stageNodes, stage) || [];

    const stages = mapOfStagesForOption(nextStages);
    DEV_LOG && console.log('findStoriesFromStage', stages.length, storyPath);
    // if (stages.length > 1) {
    // separated stories
    return stages.reduce((acc, s) => {
        const newStoryPath = storyPath.slice();
        const newUuid = s.uuid;
        // if (newStoryPath.indexOf(newUuid) === -1) {
        if (newStoryPath.findIndex((s2) => s2.uuid === newUuid) === -1) {
            // if (stageIsStory(s)) {
            newStoryPath.push(s);
            // newStoryPath.push(newUuid);
            // }
            acc.push(...findStoriesFromStage(actionNodes, stageNodes, s, newStoryPath));
            // not done lets continue
        } else {
            // story path done
            acc.push(newStoryPath);
        }
        return acc;
    }, []);
    // } else {
    //     // continuing on the same story
    //     const newStage = stages[0];
    //     const newUuid = newStage.uuid;
    //     // if (storyPath.findIndex((s2) => (s2.uuid = newUuid)) === -1) {
    //     if (storyPath.indexOf(newUuid) === -1) {
    //         // if (stageIsStory(newStage)) {
    //         storyPath.push(newUuid);
    //         // storyPath.push(newStage);
    //         // }
    //         return findStoriesFromStage(actionNodes, stageNodes, newStage, storyPath);
    //         // not done lets continue
    //     } else {
    //         return [storyPath];
    //         // story path done
    //     }
    // }
}

function getRandomFromArray(array) {
    return array[Math.floor(Math.random() * array.length)];
}
export const PlaybackEvent = 'playback';
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
    durations?: number[];
    duration: number;
    name: any;
    description?: any;
    cover?: () => Promise<string | ImageSource>;
}

const TAG = '[Story]';
export class StoryHandler extends Handler {
    appExited = false;
    positionState: { [k: string]: any } = {};
    playingPack: Pack;
    playingStory: Story;
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
            if (this.playingPack) {
                const currentStage = this.currentStageSelected();
                const duration = this.mPlayer?.duration || 0;
                let name = this.playingPack.title;
                let description = this.playingPack.subtitle || this.playingPack.description;
                if (currentStage) {
                    if (duration > 10000 || stageIsStory(currentStage)) {
                        name = this.getStoryName(this.playingPack, currentStage) || name;
                        if (name !== this.playingPack.title) {
                            description = name;
                        }
                    } else if (currentStage.type === 'menu.optionstage' || (currentStage.type === 'stage' && currentStage.controlSettings.ok)) {
                        description = name;
                        name = cleanupStageName(currentStage);
                    }
                }
                DEV_LOG && console.log('updating playing info', currentStage.uuid, duration, name);

                return {
                    canPause: currentStage?.controlSettings?.pause,
                    duration,
                    name,
                    description,
                    cover: async () => this.getStageImage(this.playingPack, this.currentStageSelected())
                };
            } else if (this.playingStory) {
                // we need to get the total duration
                return {
                    canPause: true,
                    durations: this.playingStory.durations,
                    duration: this.playingStory.duration,
                    name: this.playingStory.name,
                    description: this.playingStory.pack.title,
                    cover: async () => this.playingStory.pack.getThumbnail()
                };
            }
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

    clearPlayer() {
        const oldPlayer = this.mPlayer;
        oldPlayer?.stop();
        this.mPlayer = new TNSPlayer();
        oldPlayer?.dispose();
    }

    async playAudio({
        fileName,
        dataSource,
        loop = false,
        throwErrorUp = true,
        updatePlayingInfo = true
    }: {
        fileName: string;
        dataSource?: any;
        loop?: boolean;
        throwErrorUp?: boolean;
        updatePlayingInfo?: boolean;
    }) {
        DEV_LOG && console.log('playAudio', fileName);
        // if (!File.exists(fileName)) {
        //     throw new Error(lc('file_not_found', fileName));
        // }
        return new Promise<void>(async (resolve, reject) => {
            try {
                let resolved = false;
                DEV_LOG && console.log('playAudio', dataSource);
                await this.mPlayer.playFromFile({
                    autoPlay: true,
                    audioFile: fileName,
                    dataSource,
                    loop,
                    completeCallback: async () => {
                        DEV_LOG && console.log('completeCallback', fileName);
                        this.clearPlayer();
                        if (!loop && !resolved) {
                            resolved = true;
                            resolve();
                        }
                        // dataSource?.close();
                        this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
                    },
                    errorCallback: async (e) => {
                        DEV_LOG && console.log('errorCallback', fileName, e.error);
                        // dataSource?.close();
                        this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
                        this.clearPlayer();
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
                if (updatePlayingInfo) {
                    DEV_LOG && console.log('playAudio', 'updating playing info');
                    this.currentPlayingInfo = this.playingInfo();
                }
                DEV_LOG && console.log('playAudio', 'updated playing info', this.currentPlayingInfo.name);
                this.notify({ eventName: PlaybackEvent, state: 'play', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
            } catch (error) {
                console.error('playAudio ', error, error.stack);
                reject(error);
            }
        });
    }
    currentStoryAudioIndex = 0;
    async playAudios(audios: string[], updatePlayingInfo = true) {
        TEST_LOG && console.log('playAaudios', updatePlayingInfo);
        // try {
        // we use throwErrorUp to ensure the loops stop and we dont play other audios
        for (let index = 0; index < audios.length; index++) {
            if (!this.isPlaying) {
                break;
            }
            this.currentStoryAudioIndex = index;
            await this.playAudio({ fileName: audios[index], loop: false, throwErrorUp: true, updatePlayingInfo });
        }
        // } catch (err) {}
    }

    pausedStoryPlayTime = 0;
    async pausePlayback() {
        if (this.isPlaying) {
            this.mPlayer.pause();
            // this.lyric?.pause();
            this.isPlayingPaused = true;
            this.pausedStoryPlayTime = this.mPlayer.currentTime;
            DEV_LOG && console.log(TAG, 'pausePlayback', this.pausedStoryPlayTime);
            this.notify({ eventName: PlaybackEvent, state: 'pause', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
        }
    }
    async togglePlayState() {
        DEV_LOG && console.log('togglePlayState', this.isPlaying, this.isPlayingPaused);
        if (this.isPlaying) {
            if (this.isPlayingPaused) {
                this.resumePlayback();
            } else {
                this.pausePlayback();
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
            this.notify({ eventName: PlaybackEvent, state: 'play', playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as PlaybackEventData);
        }
    }
    async setPlayerTimestamp(playTime: number) {
        DEV_LOG && console.log(TAG, 'setStoryTimestamp', playTime, this.isPlaying, this.isPlayingPaused);
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
        return nextStageFrom(this.actionNodes, this.stageNodes, stage);
    }
    homeStageFrom(stage?: Stage): Stage[] {
        const homeTransition = stage.homeTransition;
        DEV_LOG && console.log('homeStageFrom', homeTransition);
        if (!homeTransition) {
            return [];
        }
        if (homeTransition.stageNode) {
            return [this.stageNodes.find((s) => s.uuid === homeTransition.stageNode)];
        }
        const nextStageId = this.actionNodes.find((a) => a.id === homeTransition.actionNode).options;
        return nextStageId.map((n) => this.stageNodes.find((s) => s.uuid === n));
    }
    currentStageSelected() {
        return this.currentStages?.[this.selectedStageIndex];
    }

    async getStageImage(pack: Pack, stage: Stage): Promise<string | ImageSource> {
        if (pack) {
            const selected = this.currentStageSelected();
            DEV_LOG && console.log('getStageImage', stage.uuid, selected.uuid, stage === selected, stageIsStory(stage), this.currentStageImage);
            if (stage === selected) {
                if (stageIsStory(stage)) {
                    return pack.getThumbnail();
                }
                return (await pack.getImage(this.currentStageImage)) || pack.getThumbnail();
            } else {
                return (await pack.getImage(stageIsStory(stage) ? this.findStoryImage(stage) : stage?.image)) || pack.getThumbnail();
            }
        }
    }
    async getCurrentStageImage() {
        DEV_LOG && console.log('getCurrentStageImage', this.currentStageImage);
        if (this.playingPack && this.currentStageImage) {
            return (await this.playingPack.getImage(this.currentStageImage)) || this.playingPack.getThumbnail();
        }
        return this.playingPack.getThumbnail();
    }
    getStageName(pack: Pack, stage: Stage) {
        if (pack && stage) {
            if (stageIsStory(stage)) {
                return this.getStoryName(pack, stage);
            }
            return cleanupStageName(stage);
        }
    }
    getStoryName(pack: Pack, stage: Stage) {
        if (pack) {
            DEV_LOG && console.log('getStoryName', stage.uuid, stage.name);
            if (stage.name && /\s*(story|stage)[\s-_]*node\s*/.test(stage.name.toLowerCase())) {
                const action = this.actionNodes.find((a) => a.options.indexOf(stage.uuid) !== -1);
                const beforeStage = this.stageNodes.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
                DEV_LOG && console.log('getStoryName beforeStage', beforeStage.uuid, beforeStage.name);
                return cleanupStageName(beforeStage);
            }
            return cleanupStageName(stage);
        }
    }

    findStoryImage(s: Stage) {
        if (s.image) {
            return s.image;
        }
        const action = this.actionNodes.find((a) => a.options.indexOf(s.uuid) !== -1);
        const beforeStage = this.stageNodes.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
        // DEV_LOG && console.log('findStoryImage', s.uuid, beforeStage.uuid, stageIsStory(beforeStage), beforeStage.image, beforeStage.audio);
        if (!stageIsStory(beforeStage) && beforeStage?.image) {
            return beforeStage.image;
        } else {
            return this.findStoryImage(beforeStage);
        }
    }
    getAllPlayingStoriesFromPack() {
        return this.stageNodes.filter(stageIsStory).sort((a, b) => a.name?.localeCompare(b.name));
    }
    setSelectedStage(index: number) {
        if (this.selectedStageIndex !== index) {
            this.selectedStageIndex = index;
            this.notifyStageChange();
            this.runStage();
        }
    }
    stageChangeEventData() {
        return { pack: this.playingPack, stages: this.currentStages, selectedStageIndex: this.selectedStageIndex, currentStage: this.currentStageSelected() };
    }
    async notifyStageChange() {
        try {
            const stage = this.currentStageSelected();
            this.currentStageImage = stageIsStory(stage) ? undefined : stage?.image;
            this.currentPlayingInfo = this.playingInfo();
            DEV_LOG && console.info('notifyStageChange', stage.uuid, this.currentStages.length, this.selectedStageIndex, this.currentStageImage, JSON.stringify(this.currentPlayingInfo));
            this.notify({ eventName: StagesChangeEvent, playingInfo: this.currentPlayingInfo, ...this.stageChangeEventData() } as StageEventData);
        } catch (error) {
            showError(error);
        }
    }
    async onStageOk() {
        const oldSelected = this.currentStageSelected();
        const oldSelectedIndex = this.selectedStageIndex;
        DEV_LOG && console.log('onStageOk', oldSelected.uuid, oldSelected?.okTransition);
        if (oldSelected?.okTransition === null) {
            return;
        }
        const nextStages = this.nextStageFrom(oldSelected) || [];

        const optionIndex = this.currentStages[oldSelectedIndex].okTransition?.optionIndex;

        this.currentStages = mapOfStagesForOption(nextStages);
        this.selectedStageIndex = optionIndex;
        const currentStageSelected = this.currentStageSelected();
        if (currentStageSelected.controlSettings.home && !currentStageSelected.homeTransition) {
            // the json is missing the homeTransition. Let s fake it
            const action = this.actionNodes.find((a) => a.options.indexOf(currentStageSelected.uuid) !== -1);
            const beforeStage = this.stageNodes.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
            if (beforeStage) {
                const menuLastAction = this.actionNodes.find((a) => a.options.length > 1 && a.options.indexOf(beforeStage.uuid) !== -1);
                if (menuLastAction) {
                    currentStageSelected.homeTransition = { actionNode: menuLastAction.id, optionIndex: menuLastAction.options.indexOf(beforeStage.uuid) };
                }
            }
        }
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
        const selected = this.currentStageSelected();
        const homeTransition = selected?.homeTransition;
        if (!homeTransition) {
            return;
        }
        const nextStages = this.homeStageFrom(selected) || [];

        const optionIndex = homeTransition?.optionIndex;

        this.currentStages = mapOfStagesForOption(nextStages);
        // for now we always reset to 0 as many stories have the wrong index set
        this.selectedStageIndex = 0;
        // this.selectedStageIndex = optionIndex;
        this.notifyStageChange();
        this.runStage();
    }
    async runStage() {
        try {
            const stage = this.currentStageSelected();
            // this.notify({ eventName: 'runStage', stage, selectedStageIndex: this.selectedStageIndex, stages: this.currentStages });
            DEV_LOG && console.info('runStage', JSON.stringify(stage));
            if (stage.audio) {
                const compressed = this.playingPack.compressed;
                const fileName = this.playingPack.getAudio(stage.audio);
                const dataSource = compressed && __ANDROID__ ? new com.akylas.conty.ZipMediaDataSource(this.playingPack.zipPath, fileName.split('@').pop()) : undefined;
                await this.playAudio({ fileName, dataSource });
                if (stageIsStory(stage) && this.appExited) {
                    this.stopPlaying();
                    return;
                }
                // DEV_LOG && console.log('runStage playAudio done', stage.controlSettings);
                if (stage === this.currentStageSelected() && stage?.controlSettings?.autoplay === true) {
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
            this.playingPack = pack;
            const data = await pack.getData();
            this.actionNodes = data.actionNodes;
            this.stageNodes = data.stageNodes;
            DEV_LOG && console.log('playPack data', this.actionNodes.length, this.stageNodes.length);
            this.selectedStageIndex = 0;
            this.currentStages = [this.stageNodes.find((s) => s.squareOne === true)];
            this.notify({ eventName: PackStartEvent, ...this.stageChangeEventData() } as PackStartEventData);
            // DEV_LOG && console.log('playPack1', JSON.stringify(this.currentStages));
            // this.notify({ eventName: StagesChangeEvent, stages: this.currentStages, selectedStageIndex: this.selectedStageIndex });
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
    async playStory(story: Story) {
        TEST_LOG && console.log('playStory', this.isPlaying, story.name, JSON.stringify(story.audioFiles));
        if (this.isPlaying) {
            await this.stopPlaying({ closeFullscreenPlayer: false });
            // return new Promise<void>((resolve) => {
            //     this.toPlayNext = async () => {
            //         await this.playStory(pack);
            //         resolve();
            //     };
            // });
        }
        try {
            this.isPlaying = true;
            this.playingStory = story;
            this.currentPlayingInfo = this.playingInfo();
            this.notify({ eventName: StoryStartEvent, story } as StoryStartEventData);
            await this.playAudios(story.audioFiles, false);
        } catch (error) {
            showError(error);
        } finally {
            this.notify({ eventName: StoryStopEvent, story } as StoryStartEventData);
            this.stopPlaying();
        }
    }

    async stopPlaying({ fade = false, closeFullscreenPlayer = true } = {}) {
        if (!this.isPlaying) {
            return;
        }
        TEST_LOG && console.log('stopPlaying', fade, this.mPlayer.isAudioPlaying(), this.isPlaying, !!this.toPlayNext);

        const onDone = async () => {
            try {
                this.notify({ eventName: PlaybackEvent, state: 'stopped', playingInfo: null, closeFullscreenPlayer, ...this.stageChangeEventData() } as PlaybackEventData);
                this.notify({ eventName: PackStopEvent });
            } catch (error) {
                showError(error);
            }
            // we need to wait to set those otherwise another instruction might want to start
            // before onDone and it could break the state machine
            if (this.playingPack) {
                this.playingPack.close();
                this.playingPack = null;
            }
            if (this.playingStory) {
                this.playingStory.pack?.close();
                this.playingStory = null;
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
            this.clearPlayer();
            if (this.appExited) {
                Application.notify({ eventName: 'shouldStopBgService' });
            } else {
                if (this.toPlayNext) {
                    this.toPlayNext();
                }
                this.toPlayNext = null;
            }
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
    async findAllStories(pack: Pack) {
        const data = await pack.getData();
        this.actionNodes = data.actionNodes;
        this.stageNodes = data.stageNodes;
        const currentStage = data.stageNodes.find((s) => s.squareOne === true);
        const storiesStages = findStoriesFromStage(data.actionNodes, data.stageNodes, currentStage, []);
        const result = await Promise.all(
            storiesStages.map(async (s, index) => {
                const images = [];
                const audioFiles = [];
                const stages = s.reduce((acc, stage) => {
                    if (stageIsStory(stage)) {
                        audioFiles.push(this.playingPack.getAudio(stage.audio));
                        images.push(this.findStoryImage(stage));
                        acc.push(stage);
                    }
                    return acc;
                }, [] as Stage[]);
                const durations = await Promise.all(audioFiles.map((s) => getAudioDuration(s)));
                const duration = durations.reduce((acc, v) => acc + v, 0);
                return { pack, stages, name: stages[stages.length - 1].name || lc('story') + ' ' + (index + 1), audioFiles, images, durations, duration } as Story;
            })
        );
        // DEV_LOG && console.log('findAllStories', storiesStages.length, JSON.stringify(result.map((s) => ({ images: s.images, audioFiles: s.audioFiles, name: s.name }))));
        return result;
    }
}
