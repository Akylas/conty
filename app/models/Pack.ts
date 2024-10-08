import { isString } from '@akylas/nativescript/utils';
import { lc } from '@nativescript-community/l';
import { Folder, ImageCache, ImageSource, Observable, Utils, path } from '@nativescript/core';
import { DocumentsService, PackUpdatedEventData, getFileTextContentFromPackFile } from '~/services/documents';
import { getAudioDuration } from '~/utils';
import { EVENT_PACK_UPDATED } from '~/utils/constants';

export const LUNII_DATA_FILE = 'story.json';
export const TELMI_DATA_FILE = 'metadata.json';

export interface RemoteContentProvider {
    name?: string;
    url: string;
    image?: string;
    attribution?: string;
}

export interface RemoteContent {
    age: number;
    title: string;
    description: string;
    thumbs: {
        small: string;
        medium: string;
    };
    download: string;
    created_at: string;
    updated_at: string;
    awards: string[];
}

export class Tag {
    public readonly id!: string;
    public title: string;
}
export enum StageType {
    STAGE = 'stage',
    STORY = 'story',
    COVER = 'cover',
    MENU_QUESTIONSTAGE = 'menu.questionstage',
    MENU_OPTIONSTAGE = 'menu.optionstage',
    MENU_QUESTIONACTION = 'menu.questionaction',
    MENU_OPTIONSACTION = 'menu.optionaction',
    STORY_ACTION = 'story.action',
    ACTION = 'action'
}
export interface Action {
    id: string;
}
export interface LuniiAction extends Action {
    name: string;
    options: string[];
}
export interface PackMetadata {
    image?: string;
    format: string;
    title: string;
    version: number;
    description: string;
    category: string;
    nightModeAvailable: boolean;
    uri?: string;
    thumbnail?: string;
    age: number;
    keywords?: string;
    subtitle?: string;
}

export interface ControlSettings {
    wheel: boolean;
    ok: boolean;
    home: boolean;
    pause: boolean;
    autoplay: boolean;
}
export interface Transition {
    actionNode?: string;
    stageNode?: string; // we add this when homeTransition is missing
    optionIndex: number;
}

export interface Stage {
    image?: string;
    audio?: string;
    uuid: string;
}
export interface LuniiStage extends Stage {
    uuid: string;
    type: StageType;
    name: string;
    episode?: number;
    okTransition?: Transition;
    homeTransition?: Transition;
    controlSettings?: ControlSettings;
    squareOne: boolean;
    duration?: number;
}

interface TelmiNodes {
    startAction: TelmiTransaction;
    inventory: TelmiInventory[];
    stages: TelmiJSONStages;
    actions: TelmiJSONActions;
}

interface TelmiJSONAction {
    stage: string;
    conditions?: TelmiCondition[];
}
interface TelmiAction extends TelmiJSONAction, Action {}
interface TelmiJSONActions {
    [k: string]: TelmiJSONAction[];
    backChildAction: TelmiJSONAction[];
}
interface TelmiJSONNote {
    title: string;
    text: string;
}
interface TelmiJSONNotes {
    [k: string]: TelmiJSONNote;
}

interface TelmiCondition {
    comparator: number;
    item: number;
    number: number;
}

interface TelmiJSONStage {
    image?: string;
    audio?: string;
    ok?: TelmiTransaction;
    home: TelmiTransaction;
    control?: TelmiControl;
    items?: TelmiItem[];

    // added
    uuid: string;
}
interface TelmiStage extends TelmiJSONStage, Stage {}

interface TelmiJSONStages {
    [k: string]: TelmiJSONStage;
    backStage: TelmiJSONStage;
}

interface TelmiItem {
    type: number;
    item: number;
    number: number;
}

interface TelmiControl {
    ok: boolean;
    home: boolean;
    autoplay: boolean;
}

interface TelmiInventory {
    name: string;
    initialNumber: number;
    maxNumber: number;
    display: number;
    image: string;
}

interface TelmiTransaction {
    action: string;
    index: number;
}

export interface IPack {
    id: string;
    title?: string;
    tags: string[];
    thumbnail?: string;
    description?: string;
    category?: string;
    pack?: string;
    // colors?: string[];
    extra?: {
        colors?: string[];
        [k: string]: any;
    };
    keywords?: string;
    subtitle?: string;
    age?: number;
    size: number;
    version?: number;
    format?: string;
    compressed: 1 | 0;
}
export interface StoryJSON extends PackMetadata {
    stageNodes: Stage[];
    actionNodes: Action[];
}
export interface TelmiStoryJSON extends PackMetadata, TelmiNodes {}

let documentsService: DocumentsService;

export function setDocumentsService(service: DocumentsService) {
    documentsService = service;
}
export function getDocumentsService() {
    return documentsService;
}

export const ignoreStageNameRegex = new RegExp('\\s*(story|stage)[\\s-_]*(node|title)\\s*', 'i');

export interface Story {
    id: string;
    pack: Pack;
    name: string;
    episode?: number;
    thumbnail?: string;
    audioFiles: any[];
    images: any[];
    names: string[];
    durations: number[];
    duration: number;
}

export abstract class Pack<S extends Stage = Stage, A extends Action = Action> extends Observable implements IPack {
    importedDate: number;
    createdDate: number;
    modifiedDate: number;
    title?: string;
    tags: string[];
    thumbnail?: string;
    category?: string;
    type?: string;
    keywords?: string;
    subtitle?: string;
    description?: string;
    version?: number;
    format?: string;
    age?: number;
    extra?: {
        colors?: string[];
        podcast?: boolean;
        episodeCount?: number;
        [k: string]: any;
    };
    size: number;
    compressed: 1 | 0;

    constructor(public id: string) {
        super();
    }

    static fromJSON(jsonObj: Pack) {
        if (jsonObj.type === 'telmi') {
            return TelmiPack.fromJSON(jsonObj);
        }
        return LuniiPack.fromJSON(jsonObj);
        // const doc = new Pack(jsonObj.id);
        // Object.assign(doc, jsonObj);
        // return doc;
    }

    get folderPath() {
        return documentsService.dataFolder.getFolder(this.id);
    }
    get zipPath() {
        return documentsService.dataFolder.getFile(this.id + '.zip').path;
    }

    get dataFileName() {
        return LUNII_DATA_FILE;
    }
    imagePath = 'assets';
    audioPath = 'assets';
    getAudio(audio: string): string {
        if (audio) {
            if (this.compressed) {
                return 'zip://' + this.zipPath + `@${this.audioPath}/` + audio;
            } else {
                return this.folderPath.getFolder(this.audioPath).getFile(audio).path;
            }
        }
    }
    // loadedImages: string[] = [];

    async readBitmapFromZip(asset: string) {
        if (__ANDROID__) {
            return new Promise((resolve, reject) => {
                try {
                    com.akylas.conty.ZipMediaDataSource.readBitmapFromAsset(
                        Utils.android.getApplicationContext(),
                        this.zipPath,
                        asset,
                        new com.akylas.conty.ZipMediaDataSource.Callback({ onError: reject, onSuccess: resolve })
                    );
                } catch (error) {
                    reject(error);
                }
            });
        }
    }

    close() {
        if (__ANDROID__) {
            // this.loadedImages.forEach((item) => imageCache.remove(item));
            // this.loadedImages = []
        }
    }
    static runningImagePromises: { [k: string]: Promise<any> } = {};
    getImageInternal(asset: string, assetPath?: string) {
        if (asset) {
            // if (this.compressed) {
            //     const realPath = assetPath ? path.join(assetPath, asset) : asset;
            //     const key = this.zipPath + '@' + realPath;
            //     let image = documentsService.imageCache.get(key);
            //     if (image) {
            //         return new ImageSource(image);
            //     }
            //     if (Pack.runningImagePromises[key]) {
            //         const promise = Pack.runningImagePromises[key];
            //         const r = await promise;
            //         return r;
            //     }
            //     const promise = (Pack.runningImagePromises[key] = new Promise(async (resolve, reject) => {
            //         try {
            //             image = await this.readBitmapFromZip(realPath);
            //             documentsService.imageCache.set(key, image);
            //             // this.loadedImages.push(image);
            //             resolve(new ImageSource(image));
            //         } catch (error) {
            //             reject(error);
            //         } finally {
            //             delete Pack.runningImagePromises[key];
            //         }
            //     }));
            //     return promise;
            // } else {
            return path.join(this.folderPath.path, assetPath, asset);
            // }
        }
    }
    getImage(asset: string) {
        return this.getImageInternal(asset, this.imagePath);
    }

    getThumbnail(reuse = false) {
        // if (this.compressed) {
        // return this.getImageInternal(this.thumbnail);
        // } else {
        return this.thumbnail;
        // }
    }

    getCurrentStageImage(stage: S, selected: S, currentStageImage?: string): string | ImageSource {
        // DEV_LOG && console.log('getStageImage', stage.uuid, selected.uuid, stage === selected, stageIsStory(stage), this.currentStageImage);
        if (stage === selected) {
            if (this.stageIsStory(stage)) {
                return this.getThumbnail();
            }
            return this.getImage(currentStageImage) || this.getThumbnail();
        } else {
            return this.getImage(this.stageIsStory(stage) ? this.findStoryImage(stage) : stage?.image) || this.getThumbnail();
        }
    }

    async removeFromDisk() {
        // to remove we need to real path with content://
        const docData = Folder.fromPath(documentsService.realDataFolderPath).getFolder(this.id);
        return docData.remove();
    }

    async save(data: Partial<Pack> = {}, updateModifiedDate = false, notify = true) {
        await documentsService.packRepository.update(this, data, updateModifiedDate);
        if (notify) {
            documentsService.notify({ eventName: EVENT_PACK_UPDATED, object: documentsService, pack: this, updateModifiedDate } as PackUpdatedEventData);
        }
    }

    toString() {
        return JSON.stringify({ db_version: DocumentsService.DB_VERSION, ...this }, (key, value) => (key.startsWith('_') ? undefined : value));
    }

    toJSONObject() {
        return JSON.parse(this.toString());
    }

    isMissingHome(s: S): boolean {
        return this.canHome(s) && !this.hasHomeTransition(s);
    }

    abstract getStageImage(s: S): string | ImageSource;
    abstract initData(): Promise<void>;
    abstract stageIsStory(s: S): boolean;
    abstract cleanupStageName(s: S): string;
    abstract nextStageFrom(s?: S): S[];
    abstract homeStageFrom(s?: S): S[];
    abstract getStoryName(s: S): string;
    abstract findStoryImage(s: S): string;
    abstract canOk(s: S): boolean;
    abstract canHome(s: S): boolean;
    abstract okTransitionIndex(s: S): number;
    abstract homeTransitionIndex(s: S): number;
    abstract mapOfStagesForOption(stages: S[], optionIndex?: number): S[];
    abstract hasOkTransition(s: S): boolean;
    abstract hasHomeTransition(s: S): boolean;
    abstract isAutoPlay(s: S): boolean;
    abstract buildMissingHome(s: S);
    abstract startData(): { stages: S[]; index: number };
    abstract findStoriesFromStage(s: S, storyPath: S[]): S[][];
    abstract stageIsOptionStage(s: S): boolean;
    abstract stageName(s: S): string;
    abstract isMenuStage(s: S): boolean;
    abstract canPause(s: S): boolean;
    abstract findAllStories(podcastMode?: boolean): Promise<Story[]>;
    abstract hasStories(): boolean;
}

export class LuniiPack extends Pack<LuniiStage, LuniiAction> {
    stages?: LuniiStage[];
    actions?: LuniiAction[];
    stageName(s: LuniiStage): string {
        const name = s?.name;
        if (!name || !ignoreStageNameRegex.test(name)) {
            return name;
        }
    }
    isAutoPlay(s: LuniiStage): boolean {
        return s?.controlSettings?.autoplay === true;
    }
    isMenuStage(s: LuniiStage): boolean {
        return s && (s.type === 'menu.optionstage' || (!!s.controlSettings?.ok && !!s.controlSettings?.wheel));
    }
    startData() {
        return { index: 0, stages: [this.stages.find((s) => s.squareOne === true)] };
    }
    okTransitionIndex(s: LuniiStage): number {
        return s?.okTransition?.optionIndex;
    }
    homeTransitionIndex(s: LuniiStage): number {
        return s?.homeTransition?.optionIndex;
    }
    canOk(s: LuniiStage): boolean {
        return s?.controlSettings?.ok === true;
    }
    hasOkTransition(s: LuniiStage): boolean {
        return !!s?.okTransition;
    }
    hasHomeTransition(s: LuniiStage): boolean {
        return !!s?.homeTransition;
    }
    canPause(s: LuniiStage): boolean {
        return s?.controlSettings?.pause === true;
    }
    canHome(s: LuniiStage): boolean {
        return s && !!s.homeTransition && s.controlSettings?.home === true;
    }
    buildMissingHome(s: LuniiStage) {
        const action = this.actions.find((a) => a.options.indexOf(s.uuid) !== -1);
        const beforeStage = this.stages.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
        if (beforeStage) {
            const menuLastAction = this.actions.find((a) => a.options.length > 1 && a.options.indexOf(beforeStage.uuid) !== -1);
            if (menuLastAction) {
                s.homeTransition = { actionNode: menuLastAction.id, optionIndex: menuLastAction.options.indexOf(beforeStage.uuid) };
            }
        }
    }
    static fromJSON(jsonObj: IPack) {
        const { id, extra, ...others } = jsonObj;
        // DEV_LOG && console.log('OCRDocument', 'fromJSON', JSON.stringify(jsonObj));
        const doc = new LuniiPack(id);
        Object.assign(doc, {
            extra: isString(extra) ? JSON.parse(extra) : extra,
            ...others
        });
        return doc;
    }

    override getStageImage(stage: LuniiStage) {
        return this.getImage(stage?.image) || this.getThumbnail();
    }
    async initData() {
        if (!this.stages) {
            const storyJSON = JSON.parse(
                await getFileTextContentFromPackFile(this.compressed ? this.zipPath : this.folderPath.path, this.dataFileName, this.compressed === 1 ? true : false)
            ) as StoryJSON;
            this.actions = storyJSON.actionNodes as LuniiAction[];
            this.stages = storyJSON.stageNodes as LuniiStage[];
        }
    }
    cleanupStageName(s: LuniiStage) {
        return this.stageName(s)
            ?.replace(/\.mp3.*(item|node)$/, '')
            ?.replace(/^\d{10,}\s*[-_]\s*/, '');
    }
    stageIsStory(s: LuniiStage) {
        // for now we only check for story || pause
        // we could add a test for home. But sometimes stories are missing this.
        // we also test for duration but will only work if stage duration is set
        return s.type === 'story' || s.duration > 30000 || (s.audio && !s.controlSettings.wheel && s.controlSettings.pause === true);
    }
    stageIsOptionStage(s: LuniiStage) {
        // we need to see if this stage is part of a multile options action
        return this.actions.some((a) => a.options.indexOf(s.uuid) !== -1 && a.options.length > 1);
    }
    findAllPodcastEpisodes() {
        return this.stages.filter((s) => s.duration > 30000).sort((a, b) => a.episode - b.episode);
    }
    async findAllStories(podcastMode = false) {
        await this.initData();
        const currentStage = this.stages.find((s) => s.squareOne === true);
        const storiesStages = podcastMode ? this.findAllPodcastEpisodes().map((s) => [s]) : this.findStoriesFromStage(currentStage, []);
        const result = await Promise.all(
            storiesStages.map(async (s, index) => {
                const images = [];
                const names = [];
                const audioFiles = [];
                let durations = [];
                // DEV_LOG &&
                //     console.log(
                //         'storiesStages',
                //         s.map((s2) => s2.uuid)
                //     );
                const stages = s.reduce((acc, stage) => {
                    if (podcastMode || this.stageIsStory(stage)) {
                        audioFiles.push(this.getAudio(stage.audio));
                        durations.push(stage.duration);
                        acc.push(stage);
                    } else if (this.stageIsOptionStage(stage)) {
                        if (stage.image) {
                            images.push(stage.image);
                        }
                        if (stage.name) {
                            names.push(this.cleanupStageName(stage));
                        }
                    }
                    return acc;
                }, [] as LuniiStage[]);
                if (stages.length === 0) {
                    return;
                }
                durations = await Promise.all(audioFiles.map((s, index) => durations[index] || getAudioDuration(s)));
                const duration = durations.reduce((acc, v) => acc + v, 0);
                const hasMultipleChoices = names.length > 1;
                const lastStage = stages[stages.length - 1];
                const name =
                    (lastStage.name && !ignoreStageNameRegex.test(lastStage.name) && this.cleanupStageName(lastStage)) ||
                    (hasMultipleChoices ? undefined : names[0]) ||
                    lc('story') + ' ' + (index + 1);
                let thumbnail = this.getThumbnail();
                if (podcastMode) {
                    thumbnail = this.getImage(this.findStoryImage(stages[0])) || thumbnail;
                } else if (images.length === 1) {
                    thumbnail = this.getImage(images[0]);
                }
                return {
                    id: this.id + '_' + index,
                    pack: this,
                    thumbnail,
                    episode: podcastMode ? stages[0].episode : undefined,
                    stages,
                    name,
                    audioFiles,
                    images,
                    names,
                    durations,
                    duration
                } as Story;
            })
        );
        // DEV_LOG && console.log('findAllStories', storiesStages.length, JSON.stringify(result.map((s) => ({ images: s.images, audioFiles: s.audioFiles, name: s.name }))));
        return result.filter((s) => !!s);
    }
    homeStageFrom(stage?: LuniiStage): LuniiStage[] {
        const homeTransition = stage.homeTransition;
        DEV_LOG && console.log('homeStageFrom', homeTransition);
        if (!homeTransition) {
            return [];
        }
        if (homeTransition.stageNode) {
            return [this.stages.find((s) => s.uuid === homeTransition.stageNode)];
        }
        const nextStageId = this.actions.find((a) => a.id === homeTransition.actionNode).options;
        return nextStageId.map((n) => this.stages.find((s) => s.uuid === n));
    }
    nextStageFrom(stage?: LuniiStage): LuniiStage[] {
        // DEV_LOG && console.log('nextStageFrom', JSON.stringify(stage));
        if (!stage?.okTransition) {
            return [];
        }
        return this.actions.find((a) => a.id === stage.okTransition.actionNode).options.map((n) => this.stages.find((s) => s.uuid === n));
    }

    mapOfStagesForOption(stages: LuniiStage[], optionIndex: number = -1): LuniiStage[] {
        if (optionIndex === undefined || optionIndex === -1 || optionIndex >= stages.length) {
            // if (stages.length && stages[0].controlSettings.autoplay) {
            //     // running it alone will ensure we play automatically
            //     return [stages[0]];
            // }
            return stages;
        } else {
            return [stages[optionIndex]];
        }
    }

    getStoryName(stage: LuniiStage) {
        // DEV_LOG && console.log('getStoryName', stage.uuid, stage.name);
        if (stage && (!stage.name || ignoreStageNameRegex.test(stage.name))) {
            const action = this.actions.find((a) => a.options.indexOf(stage.uuid) !== -1);
            const beforeStage = this.stages.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
            // DEV_LOG && console.log('getStoryName beforeStage', beforeStage.uuid, beforeStage.name);
            if (beforeStage && ignoreStageNameRegex.test(beforeStage.name)) {
                return null;
            }
            return this.cleanupStageName(beforeStage);
        }
        return this.cleanupStageName(stage);
    }

    findStoryImage(s: LuniiStage) {
        if (s.image) {
            return s.image;
        }
        const action = this.actions.find((a) => a.options.indexOf(s.uuid) !== -1);
        const beforeStage = this.stages.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
        // DEV_LOG && console.log('findStoryImage', s.uuid, beforeStage.uuid, this.stageIsStory(beforeStage), beforeStage.image, beforeStage.audio);
        if (!this.stageIsStory(beforeStage) && beforeStage?.image) {
            return beforeStage.image;
        } else {
            return this.findStoryImage(beforeStage);
        }
    }
    findStoriesFromStage(stage: LuniiStage, storyPath: LuniiStage[]): LuniiStage[][] {
        const nextStages = this.nextStageFrom(stage) || [];

        const stages = this.mapOfStagesForOption(nextStages);
        if (stages.some((s) => storyPath.findIndex((s2) => s2.uuid === s.uuid) !== -1)) {
            // this is the start of a loop lets stop
            return [storyPath];
        }
        // DEV_LOG &&
        //     console.log(
        //         'findStoriesFromStage',
        //         stage.uuid,
        //         stages.length,
        //         storyPath.length,
        //         storyPath.map((s) => s.uuid)
        //     );
        const isStory = this.stageIsStory(stage);
        return stages.reduce((acc, s) => {
            const newUuid = s.uuid;
            if (storyPath.findIndex((s2) => s2.uuid === newUuid) === -1 && (!isStory || !this.stageIsStory(s))) {
                // DEV_LOG &&
                //     console.log(
                //         'findStoriesFromStage creating new story',
                //         s.uuid,
                //         storyPath.map((s) => s.uuid)
                //     );
                const newStoryPath = [...storyPath];
                newStoryPath.push(s);
                acc.push(...this.findStoriesFromStage(s, newStoryPath));
                // not done lets continue
            } else {
                // story path done
                acc.push(storyPath);
            }
            return acc;
        }, []);
    }
    hasStories() {
        return this.stages.some((s) => this.stageIsStory(s));
    }
}

export class TelmiPack extends Pack<TelmiStage, TelmiAction> {
    startAction: TelmiTransaction;
    inventory: TelmiInventory[];
    stages: TelmiJSONStages;
    actions: TelmiJSONActions;
    notes: TelmiJSONNotes;

    imagePath = 'images';
    audioPath = 'audios';
    async initData() {
        if (!this.stages) {
            const nodes = JSON.parse(await getFileTextContentFromPackFile(this.compressed ? this.zipPath : this.folderPath.path, 'nodes.json', this.compressed === 1 ? true : false)) as TelmiNodes;
            this.notes = JSON.parse(await getFileTextContentFromPackFile(this.compressed ? this.zipPath : this.folderPath.path, 'notes.json', this.compressed === 1 ? true : false)) as TelmiJSONNotes;
            Object.assign(this, nodes);
            Object.assign(this, nodes);

            // we add uuid
            Object.keys(this.stages).forEach((k) => (this.stages[k].uuid = k));
        }
    }
    getStageImage(s: TelmiStage): string | ImageSource {
        return this.getImage(s?.image) || this.getThumbnail();
    }
    static fromJSON(jsonObj: IPack) {
        const { id, extra, ...others } = jsonObj;
        // DEV_LOG && console.log('OCRDocument', 'fromJSON', JSON.stringify(jsonObj));
        const doc = new TelmiPack(jsonObj.id);
        Object.assign(doc, {
            extra: isString(extra) ? JSON.parse(extra) : extra,
            ...others
        });
        return doc;
    }

    override get dataFileName() {
        return TELMI_DATA_FILE;
    }
    stageIsStory(s: TelmiStage): boolean {
        // for now we only check for story || pause
        // we could add a test for home. But sometimes stories are missing this.
        // we also test for duration but will only work if stage duration is set
        // return s.control?.autoplay === true && s.control?.ok !== true;
        return false;
    }
    cleanupStageName(s: TelmiStage): string {
        return s ? this.notes[s.uuid].title?.replace(/^s\d+\s*/, '') : undefined;
    }
    nextStageFrom(s?: TelmiStage): TelmiStage[] {
        // DEV_LOG && console.log('nextStageFrom', JSON.stringify(stage));
        if (!s?.ok) {
            return [];
        }
        return this.actions[s.ok.action].map((n) => this.stages[n.stage]);
    }
    homeStageFrom(stage?: TelmiStage): TelmiStage[] {
        const homeTransition = stage.home;
        DEV_LOG && console.log('homeStageFrom', homeTransition);
        if (!homeTransition) {
            return [];
        }
        return this.actions[homeTransition.action].map((n) => this.stages[n.stage]);
    }
    getStoryName(s: TelmiStage): string {
        const name = this.cleanupStageName(s);
        // if (!name /* || ignoreStageNameRegex.test(name)) */) {
        //     const action = this.actions.find((a) => a.options.indexOf(stage.uuid) !== -1);
        //     const beforeStage = this.stages.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
        //     // DEV_LOG && console.log('getStoryName beforeStage', beforeStage.uuid, beforeStage.name);
        //     if (beforeStage && ignoreStageNameRegex.test(beforeStage.name)) {
        //         return null;
        //     }
        //     return this.cleanupStageName(beforeStage);
        // }
        return name;
    }
    findStoryImage(s: TelmiStage): string {
        // if (s.image) {
        return s.image;
        // }
        // const action = this.actions.find((a) => a.options.indexOf(s.uuid) !== -1);
        // const beforeStage = this.stages.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
        // // DEV_LOG && console.log('findStoryImage', s.uuid, beforeStage.uuid, stageIsStory(beforeStage), beforeStage.image, beforeStage.audio);
        // if (!this.stageIsStory(beforeStage) && beforeStage?.image) {
        //     return beforeStage.image;
        // } else {
        //     return this.findStoryImage(beforeStage);
        // }
    }
    canOk(s: TelmiStage): boolean {
        return s?.control?.ok === true;
    }
    hasOkTransition(s: TelmiStage): boolean {
        return !!s?.ok;
    }
    hasHomeTransition(s: TelmiStage): boolean {
        return !!s?.home;
    }
    okTransitionIndex(s: TelmiStage): number {
        return s?.ok.index;
    }
    homeTransitionIndex(s: TelmiStage): number {
        return s?.home.index;
    }
    hasStories(): boolean {
        return Object.values(this.stages).some((s) => this.stageIsStory(s));
    }
    canPause(s: TelmiStage): boolean {
        return !s?.control?.ok && s?.control?.autoplay;
    }
    canHome(s: TelmiStage): boolean {
        return !!s?.home && s.control?.home === true;
    }
    mapOfStagesForOption(stages: TelmiStage[], optionIndex?: number): TelmiStage[] {
        if (optionIndex === undefined || optionIndex === -1 || optionIndex >= stages.length) {
            // if (stages.length && stages[0].controlSettings.autoplay) {
            //     // running it alone will ensure we play automatically
            //     return [stages[0]];
            // }
            return stages;
        } else {
            return [stages[optionIndex]];
        }
    }
    isMissingHome(s: TelmiStage): boolean {
        return this.canHome(s) && !this.hasHomeTransition(s);
    }
    isAutoPlay(s: TelmiStage): boolean {
        return s?.control?.autoplay === true;
    }
    buildMissingHome(s: TelmiStage) {
        // const action = this.actions[s.uuid];
        // const beforeStage = Object.values(this.stages).find((s) =>s.ok?.action === action.id && s.controlSettings.wheel);
        // if (beforeStage) {
        //     const menuLastAction = this.actions.find((a) => a.options.length > 1 && a.options.indexOf(beforeStage.uuid) !== -1);
        //     if (menuLastAction) {
        //         s.homeTransition = { actionNode: menuLastAction.id, optionIndex: menuLastAction.options.indexOf(beforeStage.uuid) };
        //     }
        // }
    }
    startData() {
        const startAction = this.startAction;
        return { index: startAction.index, stages: this.actions[startAction.action].map((s) => this.stages[s.stage]) };
    }
    findStoriesFromStage(s: TelmiStage, storyPath: TelmiStage[]): TelmiStage[][] {
        const nextStages = this.nextStageFrom(s) || [];

        const stages = this.mapOfStagesForOption(nextStages);
        if (stages.some((s) => storyPath.findIndex((s2) => s2.uuid === s.uuid) !== -1)) {
            // this is the start of a loop lets stop
            return [storyPath];
        }
        const isStory = this.stageIsStory(s);
        return stages.reduce((acc, s) => {
            const newUuid = s.uuid;
            if (storyPath.findIndex((s2) => s2.uuid === newUuid) === -1 && (!isStory || !this.stageIsStory(s))) {
                const newStoryPath = [...storyPath];
                newStoryPath.push(s);
                acc.push(...this.findStoriesFromStage(s, newStoryPath));
                // not done lets continue
            } else {
                // story path done
                acc.push(storyPath);
            }
            return acc;
        }, []);
    }
    stageIsOptionStage(s: TelmiStage): boolean {
        return Object.values(this.actions).some((a) => a.length > 1 && a.findIndex((a1) => a1.stage === s.uuid));
    }
    stageName(s: TelmiStage): string {
        return s ? this.notes[s.uuid].title : undefined;
    }
    isMenuStage(s: TelmiStage): boolean {
        return s && /* this.actions[s.uuid].length && */ (!!s?.control?.ok || !s?.control?.autoplay);
    }
    async findAllStories(): Promise<Story[]> {
        await this.initData();
        const currentStage = this.startData().stages[0];
        const storiesStages = this.findStoriesFromStage(currentStage, []);
        const result = await Promise.all(
            storiesStages.map(async (s, index) => {
                const images = [];
                const names = [];
                const audioFiles = [];
                let durations = [];
                // DEV_LOG &&
                //     console.log(
                //         'storiesStages',
                //         s.map((s2) => s2.uuid)
                //     );
                const stages = s.reduce((acc, stage) => {
                    if (this.stageIsStory(stage)) {
                        audioFiles.push(this.getAudio(stage.audio));
                        // durations.push(stage.duration);
                        acc.push(stage);
                    } else if (this.stageIsOptionStage(stage)) {
                        if (stage.image) {
                            images.push(stage.image);
                        }
                        const name = this.stageName(stage);
                        if (name) {
                            names.push(this.cleanupStageName(stage));
                        }
                    }
                    return acc;
                }, [] as TelmiStage[]);
                if (stages.length === 0) {
                    return;
                }
                durations = await Promise.all(audioFiles.map((s, index) => durations[index] || getAudioDuration(s)));
                const duration = durations.reduce((acc, v) => acc + v, 0);
                const hasMultipleChoices = names.length > 1;
                const lastStage = stages[stages.length - 1];
                const name = this.stageName(lastStage) || (hasMultipleChoices ? undefined : names[0]) || lc('story') + ' ' + (index + 1);
                // DEV_LOG && console.log('adding story', name, audioFiles, images, names, durations, duration);
                return {
                    id: this.id + '_' + index,
                    pack: this,
                    stages,
                    name,
                    audioFiles,
                    images,
                    names,
                    durations,
                    duration
                } as Story;
            })
        );
        // DEV_LOG && console.log('findAllStories', storiesStages.length, JSON.stringify(result.map((s) => ({ images: s.images, audioFiles: s.audioFiles, name: s.name }))));
        return result.filter((s) => !!s);
    }
}
