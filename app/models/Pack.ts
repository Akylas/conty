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
    uuid: string;
    type: StageType;
    name: string;
    image?: string;
    audio?: string;
    okTransition?: Transition;
    homeTransition?: Transition;
    controlSettings?: ControlSettings;
    squareOne: boolean;
    duration?: number;
}

interface TelmiNodes {
    startAction: TelmiStartAction;
    inventory: TelmiInventory[];
    stages: TelmiStages;
    actions: TelmiActions;
}

interface TelmiAction {
    stage: string;
    conditions?: TelmiCondition[];
}
interface TelmiActions {
    [k: string]: TelmiAction[];
    backChildAction: any[];
}

interface TelmiCondition {
    comparator: number;
    item: number;
    number: number;
}

interface TelmiStage {
    image?: string;
    audio?: string;
    ok?: TelmiStartAction;
    home: TelmiStartAction;
    control?: TelmiControl;
    items?: TelmiItem[];
}

interface TelmiStages {
    [k: string]: TelmiStage;
    backStage: TelmiStage;
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

interface TelmiStartAction {
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

export function cleanupStageName(s: Stage) {
    return s?.name?.replace(/\.mp3.*(item|node)$/, '')?.replace(/^\d{10,}\s*[-_]\s*/, '');
}
export function stageIsStory(s: Stage) {
    // for now we only check for story || pause
    // we could add a test for home. But sometimes stories are missing this.
    // we also test for duration but will only work if stage duration is set
    return s.type === 'story' || s.duration > 30000 || (s.audio && s.controlSettings.pause === true);
}
export function stageIsOptionStage(actionNodes: Action[], stageNodes: Stage[], s: Stage) {
    // we need to see if this stage is part of a multile options action
    return actionNodes.some((a) => a.options.indexOf(s.uuid) !== -1 && a.options.length > 1);
}
export function stageCanGoHome(s: Stage) {
    return s && !!s.controlSettings?.home && !!s.homeTransition;
}

export const ignoreStageNameRegex = new RegExp('\\s*(story|stage)[\\s-_]*(node|title)\\s*', 'i');

export interface Story {
    id: string;
    pack: Pack;
    name: string;
    audioFiles: any[];
    images: any[];
    names: string[];
    durations: number[];
    duration: number;
}

export abstract class Pack extends Observable implements IPack {
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
    async getData<T = StoryJSON>() {
        const storyJSON = JSON.parse(await getFileTextContentFromPackFile(this.compressed ? this.zipPath : this.folderPath.path, this.dataFileName, this.compressed === 1 ? true : false)) as StoryJSON;
        return {
            stageNodes: storyJSON.stageNodes,
            actionNodes: storyJSON.actionNodes
        } as T;
    }
    getAudio(audio: string): string {
        if (audio) {
            if (this.compressed) {
                return 'zip://' + this.zipPath + '@assets/' + audio;
            } else {
                return this.folderPath.getFolder('assets').getFile(audio).path;
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
    async getImageInternal(asset: string, assetPath?: string) {
        if (asset) {
            if (this.compressed) {
                const realPath = assetPath ? path.join(assetPath, asset) : asset;
                const key = this.zipPath + '@' + realPath;
                let image = documentsService.imageCache.get(key);
                if (image) {
                    return new ImageSource(image);
                }
                if (Pack.runningImagePromises[key]) {
                    const promise = Pack.runningImagePromises[key];
                    const r = await promise;
                    return r;
                }
                const promise = (Pack.runningImagePromises[key] = new Promise(async (resolve, reject) => {
                    try {
                        image = await this.readBitmapFromZip(realPath);
                        documentsService.imageCache.set(key, image);
                        // this.loadedImages.push(image);
                        resolve(new ImageSource(image));
                    } catch (error) {
                        reject(error);
                    } finally {
                        delete Pack.runningImagePromises[key];
                    }
                }));
                return promise;
            } else {
                return path.join(this.folderPath.path, assetPath, asset);
            }
        }
    }
    async getImage(asset: string) {
        return this.getImageInternal(asset, 'assets');
    }

    async getThumbnail(reuse = false) {
        if (this.compressed) {
            return this.getImageInternal(this.thumbnail);
        } else {
            return this.thumbnail;
        }
    }

    async getStageImage(stage: Stage) {
        return (await this.getImage(stage?.image)) || this.getThumbnail();
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

    async findAllStories() {
        const data = await this.getData();
        const currentStage = data.stageNodes.find((s) => s.squareOne === true);
        const storiesStages = this.findStoriesFromStage(data.actionNodes, data.stageNodes, currentStage, []);
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
                    if (stageIsStory(stage)) {
                        audioFiles.push(this.getAudio(stage.audio));
                        durations.push(stage.duration);
                        acc.push(stage);
                    } else if (stageIsOptionStage(data.actionNodes, data.stageNodes, stage)) {
                        if (stage.image) {
                            images.push(stage.image);
                        }
                        if (stage.name) {
                            names.push(cleanupStageName(stage));
                        }
                    }
                    return acc;
                }, [] as Stage[]);
                if (stages.length === 0) {
                    return;
                }
                durations = await Promise.all(audioFiles.map((s, index) => durations[index] || getAudioDuration(s)));
                const duration = durations.reduce((acc, v) => acc + v, 0);
                const hasMultipleChoices = names.length > 1;
                const lastStage = stages[stages.length - 1];
                const name =
                    (lastStage.name && !ignoreStageNameRegex.test(lastStage.name) && cleanupStageName(lastStage)) || (hasMultipleChoices ? undefined : names[0]) || lc('story') + ' ' + (index + 1);
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

    nextStageFrom(actionNodes: Action[], stageNodes: Stage[], stage?: Stage): Stage[] {
        // DEV_LOG && console.log('nextStageFrom', JSON.stringify(stage));
        if (!stage?.okTransition) {
            return [];
        }
        return actionNodes.find((a) => a.id === stage.okTransition.actionNode).options.map((n) => stageNodes.find((s) => s.uuid === n));
    }

    mapOfStagesForOption(stages: Stage[], optionIndex: number = -1): Stage[] {
        if (optionIndex === -1 || optionIndex >= stages.length) {
            // if (stages.length && stages[0].controlSettings.autoplay) {
            //     // running it alone will ensure we play automatically
            //     return [stages[0]];
            // }
            return stages;
        } else {
            return [stages[optionIndex]];
        }
    }

    getStoryName(actionNodes: Action[], stageNodes: Stage[], stage: Stage) {
        // DEV_LOG && console.log('getStoryName', stage.uuid, stage.name);
        if (stage && (!stage.name || ignoreStageNameRegex.test(stage.name))) {
            const action = actionNodes.find((a) => a.options.indexOf(stage.uuid) !== -1);
            const beforeStage = stageNodes.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
            // DEV_LOG && console.log('getStoryName beforeStage', beforeStage.uuid, beforeStage.name);
            if (beforeStage && ignoreStageNameRegex.test(beforeStage.name)) {
                return null;
            }
            return cleanupStageName(beforeStage);
        }
        return cleanupStageName(stage);
    }

    findStoryImage(actionNodes: Action[], stageNodes: Stage[], s: Stage) {
        if (s.image) {
            return s.image;
        }
        const action = actionNodes.find((a) => a.options.indexOf(s.uuid) !== -1);
        const beforeStage = stageNodes.find((s) => s.type !== 'story' && s.okTransition?.actionNode === action.id && s.controlSettings.wheel);
        // DEV_LOG && console.log('findStoryImage', s.uuid, beforeStage.uuid, stageIsStory(beforeStage), beforeStage.image, beforeStage.audio);
        if (!stageIsStory(beforeStage) && beforeStage?.image) {
            return beforeStage.image;
        } else {
            return this.findStoryImage(actionNodes, stageNodes, beforeStage);
        }
    }
    findStoriesFromStage(actionNodes: Action[], stageNodes: Stage[], stage: Stage, storyPath: Stage[]): Stage[][] {
        const nextStages = this.nextStageFrom(actionNodes, stageNodes, stage) || [];

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
        const isStory = stageIsStory(stage);
        return stages.reduce((acc, s) => {
            const newUuid = s.uuid;
            if (storyPath.findIndex((s2) => s2.uuid === newUuid) === -1 && (!isStory || !stageIsStory(s))) {
                // DEV_LOG &&
                //     console.log(
                //         'findStoriesFromStage creating new story',
                //         s.uuid,
                //         storyPath.map((s) => s.uuid)
                //     );
                const newStoryPath = [...storyPath];
                newStoryPath.push(s);
                acc.push(...this.findStoriesFromStage(actionNodes, stageNodes, s, newStoryPath));
                // not done lets continue
            } else {
                // story path done
                acc.push(storyPath);
            }
            return acc;
        }, []);
    }
}

export class LuniiPack extends Pack {
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
}

export class TelmiPack extends Pack {
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

    override async getData<T = TelmiStoryJSON>() {
        DEV_LOG && console.log('telmi story getData');
        const metadata = JSON.parse(
            await getFileTextContentFromPackFile(this.compressed ? this.zipPath : this.folderPath.path, this.dataFileName, this.compressed === 1 ? true : false)
        ) as PackMetadata;
        const nodes = JSON.parse(await getFileTextContentFromPackFile(this.compressed ? this.zipPath : this.folderPath.path, 'nodes.json', this.compressed === 1 ? true : false)) as TelmiNodes;
        return {
            ...metadata,
            ...nodes
        } as T;
    }
    override getAudio(audio: string): string {
        if (audio) {
            if (this.compressed) {
                return 'zip://' + this.zipPath + '@audios/' + audio;
            } else {
                return this.folderPath.getFolder('audios').getFile(audio).path;
            }
        }
    }
    override async getImage(asset: string) {
        return this.getImageInternal(asset, 'images');
    }
}
