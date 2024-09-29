import { Folder, ImageCache, ImageSource, Observable, Utils, path } from '@nativescript/core';
import { DocumentsService, PackUpdatedEventData, getFileTextContentFromPackFile } from '~/services/documents';
import { EVENT_PACK_UPDATED } from '~/utils/constants';

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
    format: string;
    title: string;
    version: number;
    description: string;
    nightModeAvailable: boolean;
    uri: string;
    thumbnail: string;
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

export interface IPack {
    id: string;
    title?: string;
    tags: string[];
    thumbnail?: string;
    description?: string;
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
export function stageCanGoHome(s: Stage) {
    return s && !!s.controlSettings?.home && !!s.homeTransition;
}

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

export class Pack extends Observable implements IPack {
    importedDate: number;
    createdDate: number;
    modifiedDate: number;
    title?: string;
    tags: string[];
    thumbnail?: string;
    keywords?: string;
    subtitle?: string;
    description?: string;
    version?: number;
    format?: string;
    age?: number;
    size: number;
    compressed: 1 | 0;

    constructor(public id: string) {
        super();
    }

    static fromJSON(jsonObj: Pack) {
        // DEV_LOG && console.log('OCRDocument', 'fromJSON', JSON.stringify(jsonObj));
        const doc = new Pack(jsonObj.id);
        Object.assign(doc, jsonObj);
        return doc;
    }

    get folderPath() {
        return documentsService.dataFolder.getFolder(this.id);
    }
    get zipPath() {
        return documentsService.dataFolder.getFile(this.id + '.zip').path;
    }

    async getData() {
        const storyJSON = JSON.parse(await getFileTextContentFromPackFile(this.compressed ? this.zipPath : this.folderPath.path, 'story.json', this.compressed === 1 ? true : false)) as StoryJSON;
        return {
            stageNodes: storyJSON.stageNodes,
            actionNodes: storyJSON.actionNodes
        };
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
}
