import SqlQuery from '@akylas/kiss-orm/dist/Queries/SqlQuery';
import { time } from '@akylas/nativescript/profiling';
import { ApplicationSettings, type EventData, File, Folder, Observable, Utils, path } from '@nativescript/core';
import '@nativescript/core/globals';
import type { Optional } from '@nativescript/core/utils/typescript-utils';
import { setDocumentsService } from '~/models/Pack';
import { DocumentsService, getFileTextContentFromPackFile } from '~/services/documents';
import { getFileOrFolderSize, unzip } from '~/utils';
import { EVENT_IMPORT_STATE } from '~/utils/constants';
import Queue from './queue';

const context: Worker = self as any;

export interface ImportStateEventData extends EventData {
    state: 'finished' | 'running';
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
            DEV_LOG && console.log('queue empty!');
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
        // DEV_LOG && console.log(TAG, 'notify', data.eventName);
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
            DEV_LOG && console.warn('ImportWorker', 'handleStart', documentsService.id, event.data.nativeData.db);
        }
    }

    async receivedMessage(event: WorkerEvent) {
        const handled = this.receivedMessageBase(event);
        DEV_LOG && console.log(TAG, 'receivedMessage', handled, event.data.type);
        if (!handled) {
            try {
                const data = event.data;
                switch (data.type) {
                    case 'import_data':
                        await worker.handleStart(event);
                        this.importFromCurrentDataFolderQueue();
                        break;
                    case 'import_from_files':
                        await worker.handleStart(event);
                        this.importFromFilesQueue(event.data.messageData);
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
    async importFromCurrentDataFolderQueue() {
        return this.queue.add(() => this.importFromCurrentDataFolderInternal());
    }
    async importFromFilesQueue(files: string[]) {
        return this.queue.add(() => this.importFromFilesInternal(files));
    }
    async importFromCurrentDataFolderInternal() {
        try {
            const supportsCompressedData = documentsService.supportsCompressedData;
            DEV_LOG && console.log(TAG, 'importFromCurrentDataFolderInternal', this.dataFolder.path);
            const entities = await this.dataFolder.getEntities();
            DEV_LOG &&
                console.log(
                    'updateContentFromDataFolder',
                    supportsCompressedData,
                    entities.map((e) => e.name)
                );
            // entities.forEach(e=>{
            //     if (typeof e['getFolder'] === 'function') {

            //     }
            // })
            // we remove duplicates
            const existToTest = [...new Set(entities.map((e) => '"' + (e._extension ? e.name.slice(0, -e._extension.length) : e.name) + '"'))];
            DEV_LOG && console.log('existToTest', existToTest);
            const r = (await documentsService.packRepository.database.query(new SqlQuery([`SELECT id,compressed FROM Pack WHERE id IN (${existToTest.join(',')})`]))) as {
                id: string;
                compressed: 1 | 0;
            }[];
            DEV_LOG && console.log('updateContentFromDataFolder1 in db', r);
            for (let index = 0; index < entities.length; index++) {
                const entity = entities[index];
                let id = entity._extension ? entity.name.slice(0, -entity._extension?.length) : entity.name;
                const compressed = entity.name.endsWith('.zip');
                const existing = r.find((i) => i.id === id);
                let inputFilePath = entity.path;
                DEV_LOG && console.log('updateContentFromDataFolder handling', id, compressed, JSON.stringify(existing));
                if (!existing) {
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
                        // if (!Folder.exists(destinationFolderPath)) {
                        await unzip(inputFilePath, destinationFolderPath);
                        // }
                        DEV_LOG && console.log('deleting zip', inputFilePath);
                        await File.fromPath(inputFilePath).remove();
                    }
                    if (!supportsCompressedData) {
                        const testPath = Folder.fromPath(destinationFolderPath).getFile('story.json', false).path;
                        const sizeTest = File.exists(testPath) && File.fromPath(testPath).size;
                        if (!sizeTest) {
                            // broken folder, let s remove it
                            await Folder.fromPath(destinationFolderPath).remove();
                            continue;
                        }
                    }
                    const storyJSON = JSON.parse(await getFileTextContentFromPackFile(destinationFolderPath, 'story.json', supportsCompressedData && compressed));
                    await documentsService.importStory(id, destinationFolderPath, supportsCompressedData && compressed, {
                        size: getFileOrFolderSize(destinationFolderPath),
                        title: storyJSON.title,
                        description: storyJSON.description,
                        format: storyJSON.format,
                        age: storyJSON.age,
                        version: storyJSON.version,
                        subtitle: storyJSON.subtitle,
                        keywords: storyJSON.keywords
                    });
                } else if (compressed && !supportsCompressedData) {
                    // we have an entry in db using a zip. Let s unzip and update the existing pack to use the unzipped Version
                    const destinationFolderPath = this.dataFolder.getFolder(id, true).path;
                    DEV_LOG && console.log('we need to unzip existing entry in db', entity.path, destinationFolderPath);
                    // if (!Folder.exists(destinationFolderPath)) {
                    await unzip(entity.path, destinationFolderPath);
                    (await documentsService.packRepository.get(id)).save({
                        compressed: 0
                    });
                    // }
                    await File.fromPath(entity.path).remove();
                } else if (supportsCompressedData && compressed && existing.compressed === 0) {
                    (await documentsService.packRepository.get(id)).save({
                        compressed: 1
                    });
                }
            }
        } catch (error) {
            DEV_LOG && console.error(error, error.stack);
            this.sendError(error);
        }
    }

    async importFromFilesInternal(files: string[]) {
        DEV_LOG && console.log(TAG, 'importFromFilesInternal', this.dataFolder.path, JSON.stringify(files));
        try {
            const supportsCompressedData = documentsService.supportsCompressedData;
            for (let index = 0; index < files.length; index++) {
                const inputFilePath = files[index];
                let destinationFolderPath = inputFilePath;
                const id = Date.now() + '';
                destinationFolderPath = path.join(this.dataFolder.path, `${id}.zip`);
                if (!supportsCompressedData) {
                    destinationFolderPath = this.dataFolder.getFolder(id, true).path;
                    // if (!Folder.exists(destinationFolderPath)) {
                    await unzip(inputFilePath, destinationFolderPath);
                    // }
                } else {
                    await File.fromPath(inputFilePath).copy(destinationFolderPath);
                }
                const storyJSON = JSON.parse(await getFileTextContentFromPackFile(destinationFolderPath, 'story.json', supportsCompressedData));
                await documentsService.importStory(id, destinationFolderPath, supportsCompressedData, {
                    size: getFileOrFolderSize(destinationFolderPath),
                    title: storyJSON.title,
                    description: storyJSON.description,
                    format: storyJSON.format,
                    age: storyJSON.age,
                    version: storyJSON.version,
                    subtitle: storyJSON.subtitle,
                    keywords: storyJSON.keywords
                });
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
            if (__ANDROID__) {
                const native = (acc[actualKey] = com.akylas.conty.WorkersContext.Companion.getValue(key));
                com.akylas.conty.WorkersContext.Companion.setValue(key, null);
            } else {
                acc[actualKey] = WorkerContext.getValue(key);
                WorkerContext.setValue(key, null);
            }
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
