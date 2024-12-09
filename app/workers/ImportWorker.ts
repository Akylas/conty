import SqlQuery from '@akylas/kiss-orm/dist/Queries/SqlQuery';
import { time } from '@nativescript/core/profiling';
import { ApplicationSettings, Color, type EventData, File, Folder, ImageSource, Observable, Utils, knownFolders, path } from '@nativescript/core';
import '@nativescript/core/globals';
import type { Optional } from '@nativescript/core/utils/typescript-utils';
import { LUNII_DATA_FILE, Pack, PackExtra, PackMetadata, StoryJSON, TELMI_DATA_FILE, setDocumentsService } from '~/models/Pack';
import { DocumentsService, PackDeletedEventData, getFileTextContentFromPackFile } from '~/services/documents';
import { getFileOrFolderSize, unzip } from '~/utils';
import { EVENT_IMPORT_STATE, EVENT_PACK_DELETED } from '~/utils/constants';
import Queue from './queue';
import { getWorkerContextValue, loadImageSync, setWorkerContextValue } from '@akylas/nativescript-app-utils';
import { copyFolderContent, removeFolderContent } from '~/utils/file';
import { doInBatch } from '@shared/utils/batch';

const context: Worker = self as any;

export interface ImportStateEventData extends EventData {
    state: 'finished' | 'running';
    showSnack?: boolean;
    type: 'file_import' | 'data_import' | 'delete_packs';
}
export interface WorkerPostOptions {
    id?: number;
    messageData?: string;
}

export interface WorkerEvent {
    data: { messageData?: any; error?: Error; nativeData?: { [k: string]: any }; type: string; id?: number };
}
export type WorkerEventType = 'event' | 'error' | 'terminate';

let documentsService: DocumentsService;

const TAG = '[importWorker]';
export type WorkerPostEvent = { type: string; error?; id?: number; nativeData?: string[]; messageData?: string } & WorkerPostOptions;

export default class ImportWorker extends Observable {
    constructor(protected context) {
        DEV_LOG && console.log(TAG, 'constructor');

        super();

        this.queue.on('done', () => {
            this.notify({ eventName: EVENT_IMPORT_STATE, state: 'finished' } as ImportStateEventData);
            (global as any).postMessage({
                type: 'terminate'
            });
            // ensure we unregister preferences or it will crash once the worker is closed
            this.context.close();
        });
    }

    onmessage: Function;
    postMessage: (event: WorkerPostEvent) => void; //official worker method

    receivedMessageBase(event: WorkerEvent) {
        const data = event.data;
        const id = data.id;
        // DEV_LOG && console.log(TAG, 'receivedMessage', data.type, id, id && this.messagePromises.hasOwnProperty(id), Object.keys(this.messagePromises), data);
        if (data.type === 'terminate') {
            this.context.close();
            return true;
        }

        if (id && this.messagePromises.hasOwnProperty(id)) {
            this.messagePromises[id].forEach(function (executor) {
                executor.timeoutTimer && clearTimeout(executor.timeoutTimer);
                const messageData = data.messageData;
                if (!!messageData?.error) {
                    executor.reject(messageData.error);
                } else {
                    executor.resolve(messageData);
                }
            });
            delete this.messagePromises[id];
            return true;
        }
    }

    messagePromises: { [key: string]: { resolve: Function; reject: Function; timeoutTimer: number }[] } = {};
    postPromiseMessage<T = any>(type: string, messageData, id = 0, timeout = 0, nativeData?): Promise<T> {
        return new Promise((resolve, reject) => {
            id = id || time();
            // DEV_LOG && console.warn(TAG, 'postPromiseMessage', type, id, timeout, messageData);
            if (id || timeout) {
                this.messagePromises[id] = this.messagePromises[id] || [];
                let timeoutTimer;
                if (timeout > 0) {
                    timeoutTimer = setTimeout(() => {
                        // we need to try catch because the simple fact of creating a new Error actually throws.
                        // so we will get an uncaughtException
                        try {
                            reject(new Error('timeout'));
                        } catch {}
                        delete this.messagePromises[id];
                    }, timeout);
                }
                this.messagePromises[id].push({ reject, resolve, timeoutTimer });
            }

            // const result = worker.processImage(image, { width, height, rotation });
            // handleContours(result.contours, rotation, width, height);
            // const keys = Object.keys(nativeData);
            // if (__ANDROID__) {
            //     keys.forEach((k) => {
            //         com.akylas.documentscanner.WorkersContext.setValue(`${id}_${k}`, nativeData[k]._native || nativeData[k]);
            //     });
            // }
            const mData = {
                id,
                // nativeDataKeys: keys,
                messageData: JSON.stringify(messageData),
                type
            };
            // DEV_LOG && console.log(TAG, 'postMessage', mData, this.messagePromises[id]);
            (global as any).postMessage(mData);
        });
    }

    async stop(error?, id?) {
        // const result = await super.stop(error, id);
        // ensure everything is done first
        // DEV_LOG && console.log('terminate worker');
        this.context.close();
        // return result;
    }

    notify<T extends Optional<EventData & { error?: Error }, 'object'>>(data: T): void {
        DEV_LOG && console.log(TAG, 'notify', data.eventName);
        //we are a fake observable
        if (data.error) {
            // Error is not really serializable so we need custom handling
            const { nativeException, ...error } = data.error as any;
            data.error = { message: data.error.toString(), stack: data.error.stack, ...data.error };
        }
        (global as any).postMessage({
            messageData: JSON.stringify(data),
            type: 'event'
        });
    }

    async notifyAndAwait<T = any>(eventName, data) {
        return this.postPromiseMessage<T>('event', { data, eventName });
    }

    async sendError(error) {
        const { nativeException, ...realError } = error;
        (global as any).postMessage({
            messageData: JSON.stringify({ error: { message: error.toString(), stack: error.stack, ...error } }),
            type: 'error'
        });
    }
    dataFolder: Folder;
    async handleStart(event: WorkerEvent) {
        if (!documentsService) {
            documentsService = new DocumentsService(false);
            // documentsService is using real path on android, not content://. We need content:// or we wont have write access
            documentsService.notify = (e) => {
                if (e.eventName === 'started') {
                    return;
                }
                const { object, ...other } = e;
                this.notify({ ...e, target: 'documentsService' });
            };
            setDocumentsService(documentsService);
            await documentsService.start(event.data.nativeData.db);
            this.dataFolder = Folder.fromPath(ApplicationSettings.getString('data_folder', path.join(documentsService.rootDataFolder, 'data')));
            DEV_LOG && console.warn('ImportWorker', 'handleStart', documentsService.id, event.data.nativeData.db, this.dataFolder.path);
        }
    }

    async receivedMessage(event: WorkerEvent) {
        const handled = this.receivedMessageBase(event);
        DEV_LOG && console.log(TAG, 'receivedMessage', handled, event.data.type);
        if (!handled) {
            try {
                const data = event.data;
                if (this.queue.size === 0) {
                    this.notify({ eventName: EVENT_IMPORT_STATE, state: 'running', type: data.type, showSnack: event.data?.messageData?.showSnack } as ImportStateEventData);
                }
                switch (data.type) {
                    case 'import_data':
                        await worker.handleStart(event);
                        this.importFromCurrentDataFolderQueue(event.data.messageData);
                        break;
                    case 'import_from_files':
                        await worker.handleStart(event);
                        this.importFromFilesQueue(event.data.messageData);
                        break;
                    case 'import_from_file':
                        await worker.handleStart(event);
                        this.importFromFileQueue(event.data.messageData);
                        break;
                    case 'delete_packs':
                        await worker.handleStart(event);
                        const ids = event.data.messageData as { id: string; folders: number[] }[];
                        DEV_LOG && console.log('deleteDocuments', ids);
                        // await this.packRepository.delete(model);
                        await doInBatch<{ id: string; folders: number[] }, void>(
                            ids,
                            async (d: { id: string; folders: number[] }) => {
                                const id = d.id;
                                await documentsService.removePack(id);
                                const folderPathStr = path.join(documentsService.realDataFolderPath, id);
                                if (Folder.exists(folderPathStr)) {
                                    const docData = Folder.fromPath(folderPathStr, false);
                                    DEV_LOG && console.log('deleteDocument', folderPathStr);
                                    await docData.remove();
                                }
                                // we notify on each delete so that UI updates fast
                                documentsService.notify({ eventName: EVENT_PACK_DELETED, packIds: [id], folders: d.folders } as PackDeletedEventData);
                            },
                            1
                        );
                        // await Promise.all(
                        //     ids.map(async (id) => {
                        //         await documentsService.packRepository.delete({ id } as any);
                        //         const docData = Folder.fromPath(documentsService.realDataFolderPath).getFolder(id, false);
                        //         DEV_LOG && console.log('deleteDocument', docData.path);
                        //         await docData.remove();
                        //         // we notify on each delete so that UI updates fast
                        //         documentsService.notify({ eventName: EVENT_PACK_DELETED, packIds: [id] } as PackDeletedEventData);
                        //     })
                        // );
                        if (this.queue.size === 0) {
                            this.notify({ eventName: EVENT_IMPORT_STATE, state: 'finished' } as ImportStateEventData);
                        }
                        break;
                    case 'stop':
                        worker.stop(data.messageData?.error, data.id);
                        break;
                }
            } catch (error) {
                this.sendError(error);
            }
        }
        return true;
    }

    queue = new Queue();
    async importFromCurrentDataFolderQueue(args: { showSnack?: boolean }) {
        return this.queue.add(() => this.importFromCurrentDataFolderInternal(args));
    }
    async importFromFilesQueue({ files, folderId }: { files: string[]; folderId?: number }) {
        return this.queue.add(() => this.importFromFilesInternal({ files, folderId }));
    }
    async importFromFileQueue(data) {
        return this.queue.add(() => this.importFromFileInternal(data));
    }

    isFolderValid(folderPath: string) {
        let folderTotest = Folder.fromPath(folderPath);
        let entities = folderTotest.getEntitiesSync();
        while (entities.length === 1 && entities[0].isFolder === true) {
            folderTotest = folderTotest.getFolder(entities[0].name, false);
            entities = folderTotest.getEntitiesSync();
        }
        return entities.findIndex((e) => e.name === LUNII_DATA_FILE || e.name === TELMI_DATA_FILE) !== -1;
    }
    async importFromCurrentDataFolderInternal({ showSnack }: { showSnack?: boolean }) {
        try {
            const supportsCompressedData = documentsService.supportsCompressedData;
            DEV_LOG && console.log(TAG, 'importFromCurrentDataFolderInternal', this.dataFolder.path);
            const entities = await this.dataFolder.getEntities();
            // DEV_LOG &&
            //     console.log(
            //         'updateContentFromDataFolder',
            //         supportsCompressedData,
            //         entities.map((e) => e.name)
            //     );

            // we remove duplicates
            const existToTest = [...new Set(entities.map((e) => '"' + (e['extension'] ? e.name.slice(0, -e['extension'].length) : e.name) + '"'))];
            // DEV_LOG && console.log('existToTest', existToTest);
            const r = (await documentsService.packRepository.database.query(new SqlQuery([`SELECT id,compressed,externalPath FROM Pack WHERE id IN (${existToTest.join(',')})`]))) as {
                id: string;
                externalPath?: string;
                compressed: 1 | 0;
            }[];
            // DEV_LOG && console.log('updateContentFromDataFolder1 in db', r);
            for (let index = 0; index < entities.length; index++) {
                const entity = entities[index];
                try {
                    if (!this.isFolderValid(entity.path)) {
                        console.error(`invalid folder : ${entity.path}`);
                        await Folder.fromPath(entity.path).remove();
                        continue;
                    }
                    let id = entity['extension'] ? entity.name.slice(0, -entity['extension']?.length) : entity.name;
                    const compressed = entity.name.endsWith('.zip');
                    const existing = r.find((i) => i.id === id);
                    let inputFilePath = entity.path;
                    // DEV_LOG && console.log('updateContentFromDataFolder handling', id, compressed, JSON.stringify(existing));
                    if (!existing) {
                        let extraData: PackExtra;
                        DEV_LOG && console.log('importing from data folder', entity.name, compressed, supportsCompressedData);
                        // we need to clean up the name because some char will break android ZipFile
                        const realId = Date.now() + '';
                        let destinationFolderPath = inputFilePath;
                        if (compressed && realId !== id && supportsCompressedData) {
                            inputFilePath = path.join(this.dataFolder.path, `${realId}.zip`);
                            if (compressed && supportsCompressedData) {
                                await File.fromPath(destinationFolderPath).rename(inputFilePath);
                            }
                            id = realId;
                            destinationFolderPath = inputFilePath;
                        }
                        //TODO: for now we ignore compressed!
                        if (compressed && !supportsCompressedData) {
                            // continue;
                            id = realId;
                            destinationFolderPath = this.dataFolder.getFolder(id, true).path;
                            DEV_LOG && console.log('importing from zip', id, inputFilePath, destinationFolderPath, Folder.exists(destinationFolderPath));
                            await unzip(inputFilePath, destinationFolderPath);
                            const subPaths = await this.getUnzippedStorySubPaths(destinationFolderPath);
                            if (subPaths) {
                                extraData = extraData || {};
                                extraData.subPaths = subPaths;
                            }
                            DEV_LOG && console.log('deleting zip', inputFilePath);
                            await File.fromPath(inputFilePath).remove();
                        }
                        if (!supportsCompressedData) {
                            DEV_LOG && console.log('sizetest', destinationFolderPath, Folder.exists(destinationFolderPath), Folder.fromPath(destinationFolderPath).getEntitiesSync());
                            const test1Path = path.join(destinationFolderPath, LUNII_DATA_FILE);
                            const test2Path = path.join(destinationFolderPath, TELMI_DATA_FILE);
                            const sizeTest = (test1Path && File.exists(test1Path) && File.fromPath(test1Path).size) || (test2Path && File.exists(test2Path) && File.fromPath(test2Path).size);
                            if (!sizeTest) {
                                // broken folder, let s remove it
                                await Folder.fromPath(destinationFolderPath).remove();
                                continue;
                            }
                        }
                        await this.prepareAndImportUncompressedPack({
                            destinationFolderPath,
                            id,
                            supportsCompressedData: supportsCompressedData && compressed,
                            extraData: extraData ? { extra: extraData } : undefined
                        });
                    } else if (compressed && !supportsCompressedData) {
                        // we have an entry in db using a zip. Let s unzip and update the existing pack to use the unzipped Version
                        const destinationFolderPath = this.dataFolder.getFolder(id, true).path;
                        DEV_LOG && console.log('we need to unzip existing entry in db', entity.path, destinationFolderPath);
                        // if (!Folder.exists(destinationFolderPath)) {
                        await unzip(entity.path, destinationFolderPath);
                        let extraData: PackExtra;
                        const subPaths = await this.getUnzippedStorySubPaths(destinationFolderPath);
                        if (subPaths) {
                            extraData = extraData || {};
                            extraData.subPaths = subPaths;
                        }
                        const pack = await documentsService.packRepository.get(id);

                        pack.save({
                            compressed: 0,
                            extra: Object.assign({}, pack.extra, extraData)
                        });
                        // }
                        await File.fromPath(entity.path).remove();
                    } else if (supportsCompressedData && compressed && existing.compressed === 0) {
                        (await documentsService.packRepository.get(id)).save({
                            compressed: 1
                        });
                    }
                } catch (error) {
                    await Folder.fromPath(entity.path).remove();
                    throw error;
                }
            }

            const externalPaths = JSON.parse(JSON.stringify(ApplicationSettings.getString('external_paths', '[]')));
            const externalEntities = [];
            for (let index = 0; index < externalPaths.length; index++) {
                const pathStr = externalPaths[index];
                if (Folder.exists(externalPaths[index])) {
                    externalEntities.push(await Folder.fromPath(pathStr).getEntities());
                }
            }

            for (let index = 0; index < externalEntities.length; index++) {
                const entity = externalEntities[index];
                try {
                    if (!this.isFolderValid(entity.path)) {
                        console.error(`invalid folder : ${entity.path}`);
                        continue;
                    }
                    const existing = r.find((i) => i.externalPath === entity.path);
                    if (!existing) {
                        await this.prepareAndImportUncompressedPack({ destinationFolderPath: entity.path, externalPath: entity.path, id: entity.path, supportsCompressedData: false });
                    }
                } catch (error) {
                    await Folder.fromPath(entity.path).remove();
                    throw error;
                }
            }
        } catch (error) {
            DEV_LOG && console.error(error, error.stack);
            this.sendError(error);
        }
    }

    async prepareAndImportUncompressedPack({
        destinationFolderPath,
        externalPath,
        extraData,
        folderId,
        id,
        supportsCompressedData
    }: {
        destinationFolderPath: string;
        externalPath?: string;
        id: string;
        supportsCompressedData: boolean;
        folderId?: number;
        extraData?: Partial<Pack>;
    }) {
        // let folder = Folder.fromPath(destinationFolderPath);
        let folderPath = destinationFolderPath;
        if (extraData?.extra?.subPaths) {
            folderPath = path.join(folderPath, ...extraData?.extra?.subPaths);
            // folderPath = extraData?.extra?.subPaths.reduce((acc, val) => acc.getFolder(val, false), folder);
        }
        const telmiMetadataPath = path.join(folderPath, TELMI_DATA_FILE);
        const isTelmi = !!telmiMetadataPath && File.exists(telmiMetadataPath);
        // DEV_LOG && console.log('prepareAndImportUncompressedPack', id, destinationFolderPath, isTelmi);
        const storyJSON = JSON.parse(await getFileTextContentFromPackFile(folderPath, isTelmi ? TELMI_DATA_FILE : LUNII_DATA_FILE, supportsCompressedData)) as StoryJSON;
        if (__IOS__ && !isTelmi) {
            // no compressed on iOS!
            let needsSaving = false;
            const luniJSON = storyJSON;
            // we need to rewrite all images to jpg
            for (let index = 0; index < luniJSON.stageNodes.length; index++) {
                const action = luniJSON.stageNodes[index];
                if (action.image && action.image.endsWith('.bmp')) {
                    const newName = action.image.replace('.bmp', '.jpg');
                    const existingFilePath = path.join(folderPath, 'assets', action.image);
                    const uiimage = ContyImageUtils.loadPossible4Bitmap(existingFilePath);
                    // DEV_LOG && console.log('converting bmp', existingFilePath, uiimage);
                    if (uiimage) {
                        // DEV_LOG && console.log('converting saving new image', path.join(folder.path, 'assets', newName));
                        await new ImageSource(uiimage).saveToFileAsync(path.join(folderPath, 'assets', newName), 'jpg');
                        // DEV_LOG && console.log('converting saving new image done', path.join(folder.path, 'assets', newName));
                        File.fromPath(existingFilePath).removeSync();
                        needsSaving = true;
                        action.image = newName;
                    }
                }
            }
            if (needsSaving) {
                File.fromPath(path.join(folderPath, LUNII_DATA_FILE)).writeTextSync(JSON.stringify(storyJSON));
            }
        }
        const thumbnailFileName = storyJSON.image || storyJSON.thumbnail || 'thumbnail.png';
        DEV_LOG && console.log('thumbnailFileName', folderPath, thumbnailFileName);
        const thumbnailPath = path.join(folderPath, thumbnailFileName);
        let colors;
        DEV_LOG && console.log('prepareAndImportUncompressedPack', thumbnailPath);
        if (__ANDROID__ && File.exists(thumbnailPath)) {
            const start = Date.now();
            const image = loadImageSync(thumbnailPath, { resizeThreshold: 20 });
            DEV_LOG && console.log('image', image.android);
            // image.saveToFile(knownFolders.externalDocuments().getFile(thumbnailFileName).path, 'png');
            colors = JSON.parse(com.akylas.conty.Colors.Companion.getDominantColorsSync(image.android, 3));
            DEV_LOG && console.log('palette', `"${colors}"`, Date.now() - start, 'ms');
        }

        const { actionNodes, age, description, format, image, keywords, stageNodes, subtitle, thumbnail, title, version, ...extra } = storyJSON;
        await documentsService.importStory(
            id,
            supportsCompressedData,
            {
                size: getFileOrFolderSize(folderPath),
                type: isTelmi ? 'telmi' : 'studio',
                title,
                description,
                format,
                age,
                version,
                subtitle,
                keywords,
                ...(externalPath ? { externalPath } : {}),
                thumbnail: thumbnail || image,
                ...(extraData ?? {}),
                extra: {
                    colors,
                    ...extra,
                    ...(extraData?.extra || {})
                }
            },
            folderId
        );
    }

    async getUnzippedStorySubPaths(destinationFolderPath) {
        const subPaths: string[] = [];
        let folderTotest = Folder.fromPath(destinationFolderPath);
        let entities = await folderTotest.getEntities();
        while (entities.length === 1 && entities[0].isFolder === true) {
            subPaths.push(entities[0].name);
            folderTotest = folderTotest.getFolder(entities[0].name, false);
            entities = await folderTotest.getEntities();
        }
        DEV_LOG && console.log('getUnzippedStorySubPaths', destinationFolderPath, subPaths);
        return subPaths.length ? subPaths : undefined;
        // const children = await Folder.fromPath(destinationFolderPath).getEntities();
        // const needsFixing = children.length === 1 && children[0].isFolder === true;
        // DEV_LOG && console.log('fixUnzippedStory', destinationFolderPath, needsFixing);
        // if (needsFixing) {
        //     // it seem the zip was containing an inside folder
        //     await copyFolderContent(children[0].path, destinationFolderPath);
        //     await removeFolderContent(children[0].path, true);
        // }
    }

    async importFromFileInternal({ extraData, filePath, folderId, id }: { filePath: string; id: string; extraData?: Partial<Pack>; folderId?: number }) {
        try {
            const supportsCompressedData = documentsService.supportsCompressedData;
            const inputFilePath = filePath;
            let destinationFolderPath = inputFilePath;
            id = id || Date.now() + '';
            destinationFolderPath = path.join(this.dataFolder.path, `${id}.zip`);
            if (!supportsCompressedData) {
                destinationFolderPath = this.dataFolder.getFolder(id, true).path;
                // let tempPath;
                // if (inputFilePath.startsWith('content:/') && !destinationFolderPath.startsWith('content:/')) {
                //     tempPath = this.dataFolder.getFile(`${id}.zip`).path;
                //     File.fromPath(inputFilePath).copySync(tempPath);
                //     inputFilePath = tempPath;
                // }
                // if (!Folder.exists(destinationFolderPath)) {
                await unzip(inputFilePath, destinationFolderPath);
                // if (tempPath) {
                //     File.fromPath(tempPath).removeSync();
                // }
                // }
                const subPaths = await this.getUnzippedStorySubPaths(destinationFolderPath);
                if (subPaths) {
                    extraData = extraData || {};
                    extraData.extra = extraData.extra || {};
                    extraData.extra.subPaths = subPaths;
                }
            } else {
                await File.fromPath(inputFilePath).copy(destinationFolderPath);
            }
            await this.prepareAndImportUncompressedPack({ destinationFolderPath, id, supportsCompressedData, folderId, extraData });
        } catch (error) {
            this.sendError(error);
        }
    }
    async importFromFilesInternal({ files, folderId }: { files: string[]; folderId?: number }) {
        DEV_LOG && console.log(TAG, 'importFromFilesInternal', this.dataFolder.path, JSON.stringify(files));
        try {
            const supportsCompressedData = documentsService.supportsCompressedData;
            for (let index = 0; index < files.length; index++) {
                const inputFilePath = files[index];
                let destinationFolderPath = inputFilePath;
                let extraData: PackExtra;
                const id = Date.now() + '';
                destinationFolderPath = path.join(this.dataFolder.path, `${id}.zip`);
                if (!supportsCompressedData) {
                    destinationFolderPath = this.dataFolder.getFolder(id, true).path;
                    // let tempPath;
                    // if (inputFilePath.startsWith('content:/') && !destinationFolderPath.startsWith('content:/')) {
                    //     tempPath = this.dataFolder.getFile(`${id}.zip`).path;
                    //     File.fromPath(inputFilePath).copySync(tempPath);
                    //     inputFilePath = tempPath;
                    // }
                    // if (!Folder.exists(destinationFolderPath)) {
                    await unzip(inputFilePath, destinationFolderPath);
                    DEV_LOG && console.log('unzip done');
                    const subPaths = await this.getUnzippedStorySubPaths(destinationFolderPath);
                    if (subPaths) {
                        extraData = extraData || {};
                        extraData.subPaths = subPaths;
                    }
                    // }
                } else {
                    await File.fromPath(inputFilePath).copy(destinationFolderPath);
                }

                await this.prepareAndImportUncompressedPack({ destinationFolderPath, id, supportsCompressedData, folderId, extraData: extraData ? { extra: extraData } : undefined });
            }
        } catch (error) {
            this.sendError(error);
        }
    }
}

const worker = new ImportWorker(context);
const receivedMessage = worker.receivedMessage.bind(worker);
context.onmessage = (event) => {
    // DEV_LOG && console.log(TAG, 'onmessage', Date.now(), event);
    if (typeof event.data.messageData === 'string') {
        try {
            event.data.messageData = JSON.parse(event.data.messageData);
        } catch (error) {}
    }
    if (Array.isArray(event.data.nativeData)) {
        event.data.nativeData = (event.data.nativeData as string[]).reduce((acc, key) => {
            const actualKey = key.split('$$$')[1];
            acc[actualKey] = getWorkerContextValue(key);
            setWorkerContextValue(key, null);
            return acc;
        }, {});
    }
    if (typeof event.data.error === 'string') {
        try {
            event.data.error = JSON.parse(event.data.error);
        } catch (error) {}
    }
    receivedMessage(event);
};
