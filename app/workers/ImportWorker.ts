import '@nativescript/core/globals';
import SqlQuery from '@akylas/kiss-orm/dist/Queries/SqlQuery';
import { getWorkerContextValue, loadImageSync, setWorkerContextValue } from '@akylas/nativescript-app-utils';
import { BaseWorker, WorkerEvent } from '@akylas/nativescript-app-utils/worker/BaseWorker';
import Queue from '@akylas/nativescript-app-utils/worker/queue';
import { ApplicationSettings, type EventData, File, Folder, ImageSource, Observable, path } from '@nativescript/core';
import '@nativescript/core/globals';
import type { Optional } from '@nativescript/core/utils/typescript-utils';
import { doInBatch } from '@shared/utils/batch';
import { LUNII_DATA_FILE, Pack, PackExtra, StoryJSON, TELMI_DATA_FILE, setDocumentsService } from '~/models/Pack';
import { DocumentsService, PackDeletedEventData, getFileTextContentFromPackFile } from '~/services/documents';
import { getFileOrFolderSize, unzip } from '~/utils';
import { EVENT_IMPORT_STATE, EVENT_PACK_DELETED } from '~/utils/constants';

const context: Worker = self as any;

export interface ImportStateEventData extends Optional<EventData<Observable>, 'object'> {
    state: 'finished' | 'running';
    showSnack?: boolean;
    type: 'import_from_files' | 'import_data' | 'delete_packs';
}

let documentsService: DocumentsService;

const TAG = '[importWorker]';

export default class ImportWorker extends BaseWorker {
    constructor(protected context) {
        DEV_LOG && console.log(TAG, 'constructor');

        super(context);

        this.queue.on('done', () => {
            this.notify({ eventName: EVENT_IMPORT_STATE, state: 'finished' } as ImportStateEventData);
            // ensure we unregister preferences or it will crash once the worker is closed
            // prefs.destroy();
            this.stop();
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
    replyToPromise(data) {
        if (data.id) {
            (global as any).postMessage({
                messageData: JSON.stringify({ eventName: data.type }),
                type: 'event',
                id: data.id
            });
        }
    }
    async receivedMessage(event: WorkerEvent) {
        const data = event.data;
        switch (data.type) {
            case 'import_data':
                await worker.handleStart(event);
                await this.importFromCurrentDataFolderQueue(event.data.messageData);
                DEV_LOG && console.log('importFromCurrentDataFolderQueue done');
                break;
            case 'import_from_files':
                await worker.handleStart(event);
                await this.importFromFilesQueue(event.data.messageData);
                break;
            // case 'import_from_file':
            //     await worker.handleStart(event);
            //     this.importFromFileQueue(event.data.messageData);
            //     break;
            case 'delete_packs':
                await worker.handleStart(event);
                await this.deletePacksQueue(event.data.messageData);
                DEV_LOG && console.log('deletePacksQueue done');

                break;
            case 'stop':
                await worker.stop(data.messageData?.error, data.id);
                break;
        }
    }

    queue = new Queue();
    async importFromCurrentDataFolderQueue(args: { showSnack?: boolean }) {
        return this.queue.add(() => this.importFromCurrentDataFolderInternal(args));
    }
    async importFromFilesQueue({ files, folderId, showSnack }: { files: { filePath: string; id?: string; extraData?: Partial<Pack> }[]; folderId?: number; showSnack?: boolean }) {
        return this.queue.add(() => this.importFromFilesInternal({ files, folderId, showSnack }));
    }
    async deletePacksQueue(data: { id: string; folders: number[] }[]) {
        return this.queue.add(() => this.deletePacks(data));
    }
    async deletePacks(ids: { id: string; folders: number[] }[]) {
        DEV_LOG && console.log('deletePacks', ids);
        // await this.packRepository.delete(model);
        const database = documentsService.db;
        if (!database.isOpen()) {
            return;
        }
        this.notify({ eventName: EVENT_IMPORT_STATE, state: 'running', type: 'delete_packs' } as ImportStateEventData);
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
        DEV_LOG && console.log('deletePacks done', ids);
    }
    // async importFromFileQueue(data) {
    //     return this.queue.add(() => this.importFromFileInternal(data));
    // }

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
        const database = documentsService.db;
        if (!database.isOpen()) {
            return;
        }
        this.notify({ eventName: EVENT_IMPORT_STATE, state: 'running', type: 'import_data', showSnack } as ImportStateEventData);
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
        const r = (await database.query(new SqlQuery([`SELECT id,compressed,externalPath FROM Pack WHERE id IN (${existToTest.join(',')})`]))) as {
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
                DEV_LOG && console.error('error importing zip', error, error.stack);
                await Folder.fromPath(entity.path).remove();
                throw error;
            }
        }
        DEV_LOG && console.log(TAG, 'importFromCurrentDataFolderInternal done', this.dataFolder.path);
    }

    async prepareAndImportUncompressedPack({
        destinationFolderPath,
        externalPath,
        extraData,
        fileName,
        folderId,
        id,
        supportsCompressedData
    }: {
        fileName?: string;
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
        DEV_LOG && console.log('prepareAndImportUncompressedPack', id, destinationFolderPath, telmiMetadataPath, isTelmi);
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
        const thumbnailFileName = File.exists(path.join(folderPath, 'thumbnail.png')) ? 'thumbnail.png' : storyJSON.image || storyJSON.thumbnail;
        DEV_LOG && console.log('thumbnailFileName', folderPath, thumbnailFileName);
        const thumbnailPath = thumbnailFileName ? (thumbnailFileName.startsWith('http') ? thumbnailFileName : path.join(folderPath, thumbnailFileName)) : null;
        let colors;
        DEV_LOG && console.log('prepareAndImportUncompressedPack', thumbnailPath);
        if (__ANDROID__ && thumbnailPath && !storyJSON.official && File.exists(thumbnailPath)) {
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
                title: title || fileName,
                description,
                format,
                age,
                version,
                subtitle,
                keywords,
                ...(externalPath ? { externalPath } : {}),
                thumbnail: thumbnailFileName,
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
        DEV_LOG && console.log('getUnzippedStorySubPaths', destinationFolderPath, subPaths, entities);
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

    // async importFromFileInternal({ extraData, filePath, folderId, id }: { filePath: string; id: string; extraData?: Partial<Pack>; folderId?: number }) {
    //     try {
    //         const database = documentsService.db;
    //         if (!database.isOpen()) {
    //             return;
    //         }
    //         DEV_LOG && console.log('importFromFileInternal', extraData, filePath, folderId, id);
    //         const supportsCompressedData = documentsService.supportsCompressedData;
    //         const inputFilePath = filePath;
    //         let destinationFolderPath = inputFilePath;
    //         id = id || Date.now() + '';
    //         destinationFolderPath = path.join(this.dataFolder.path, `${id}.zip`);
    //         if (!supportsCompressedData) {
    //             destinationFolderPath = this.dataFolder.getFolder(id, true).path;
    //             await unzip(inputFilePath, destinationFolderPath);
    //             const subPaths = await this.getUnzippedStorySubPaths(destinationFolderPath);
    //             if (subPaths) {
    //                 extraData = extraData || {};
    //                 extraData.extra = extraData.extra || {};
    //                 extraData.extra.subPaths = subPaths;
    //             }
    //         } else {
    //             await File.fromPath(inputFilePath).copy(destinationFolderPath);
    //         }
    //         await this.prepareAndImportUncompressedPack({ destinationFolderPath, id, supportsCompressedData, folderId, extraData });
    //     } catch (error) {
    //         this.sendError(error);
    //     }
    // }
    async importFromFilesInternal({ files, folderId, showSnack }: { files: { filePath: string; id?: string; extraData?: Partial<Pack> }[]; folderId?: number; showSnack?: boolean }) {
        const database = documentsService.db;
        if (!database.isOpen()) {
            return;
        }
        this.notify({ eventName: EVENT_IMPORT_STATE, state: 'running', type: 'import_from_files', showSnack } as ImportStateEventData);
        DEV_LOG && console.log(TAG, 'importFromFilesInternal', this.dataFolder.path, JSON.stringify(files));
        const supportsCompressedData = documentsService.supportsCompressedData;
        for (let index = 0; index < files.length; index++) {
            const fileData = files[index];
            const inputFilePath = fileData.filePath;
            let destinationFolderPath = inputFilePath;
            let extraData: Partial<Pack> = fileData.extraData;
            const id = Date.now() + '';
            const fileName = inputFilePath.split('/').pop().replace('.zip', 'replaceValue');
            destinationFolderPath = path.join(this.dataFolder.path, `${id}.zip`);
            if (!supportsCompressedData) {
                destinationFolderPath = this.dataFolder.getFolder(id, true).path;
                await unzip(inputFilePath, destinationFolderPath);
                DEV_LOG && console.log('unzip done');
                const subPaths = await this.getUnzippedStorySubPaths(destinationFolderPath);
                if (subPaths) {
                    extraData = extraData || {};
                    extraData.extra = extraData.extra || {};
                    extraData.extra.subPaths = subPaths;
                }
            } else {
                await File.fromPath(inputFilePath).copy(destinationFolderPath);
            }

            await this.prepareAndImportUncompressedPack({ destinationFolderPath, id, supportsCompressedData, folderId, extraData, fileName });
        }
    }
}

const worker = new ImportWorker(context);
