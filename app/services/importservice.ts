import { setWorkerContextValue } from '@akylas/nativescript-app-utils';
import { lc } from '@nativescript-community/l';
import { EventData, Observable } from '@nativescript/core';
import { time } from '@nativescript/core/profiling';
import { Optional } from '@nativescript/core/utils/typescript-utils';
import { CustomError } from '@shared/utils/error';
import { showError } from '@shared/utils/showError';
import { Pack } from '~/models/Pack';
import { EVENT_IMPORT_STATE, EVENT_STATE } from '~/utils/constants';
import { hideSnackMessage, showSnackMessage } from '~/utils/ui';
import ImportWorker, { ImportStateEventData, WorkerEventType } from '~/workers/ImportWorker';
import { documentsService } from './documents';

export interface ImportEnabledEventData extends Optional<EventData<Observable>, 'object'> {
    enabled: boolean;
}

export class ImportService extends Observable {
    enabled = false;
    worker: ImportWorker;
    messagePromises: { [key: string]: { resolve: Function; reject: Function; timeoutTimer: number }[] } = {};
    async onWorkerMessage(event: {
        data: {
            id?: number;
            type: WorkerEventType;
            messageData?: string;
            nativeDatas?: { [k: string]: any };
        };
    }) {
        const data = event.data;
        const id = data.id;
        // DEV_LOG && console.log('onWorkerMessage', event);
        try {
            let messageData = data.messageData;
            if (typeof messageData === 'string') {
                try {
                    messageData = JSON.parse(messageData);
                } catch (error) {}
            }
            // DEV_LOG && console.info('onWorkerMessage', id, data.type, id && this.messagePromises.hasOwnProperty(id), Object.keys(this.messagePromises), messageData);
            if (id && this.messagePromises.hasOwnProperty(id)) {
                // DEV_LOG && console.log('worker response to promise',id);
                this.messagePromises[id].forEach(function (executor) {
                    executor.timeoutTimer && clearTimeout(executor.timeoutTimer);
                    // if (isError) {
                    // executor.reject(createErrorFromMessage(message));
                    // } else {
                    // const id = data.id;
                    // if (data.nativeDataKeys.length > 0) {
                    //     const nativeDatas: { [k: string]: any } = {};
                    //     if (__ANDROID__) {
                    //         data.nativeDataKeys.forEach((k) => {
                    //             nativeDatas[k] = com.akylas.documentscanner.WorkersContext.getValue(`${id}_${k}`);
                    //             com.akylas.documentscanner.WorkersContext.setValue(`${id}_${k}`, null);
                    //         });
                    //         data.nativeDatas = nativeDatas;
                    //     }
                    // }

                    executor.resolve(messageData);
                    // }
                });
                delete this.messagePromises[id];
            }
            const eventData = messageData as any;
            switch (data.type) {
                case 'event':
                    // DEV_LOG && console.info('worker event', documentsService.id, eventData.eventName, eventData.target, !!eventData.object, Object.keys(eventData), JSON.stringify(eventData.pack));
                    if (eventData.target === 'documentsService') {
                        if (eventData.pack) {
                            eventData.pack = await documentsService.packRepository.get(eventData.pack.id);
                        }
                        documentsService.notify({ ...eventData, object: eventData.object || documentsService });
                    } else {
                        // DEV_LOG && console.info('notifying event from worker', documentsService.id, eventData.eventName, Object.keys(eventData));
                        this.notify({ ...eventData });
                    }
                    break;

                case 'error':
                    showError(CustomError.fromObject(eventData.error));
                    break;

                case 'terminate':
                    DEV_LOG && console.info('worker stopped');
                    this.worker = null;
                    break;
            }
        } catch (error) {
            console.error(error, error.stack);
            showError(error);
        }
    }
    async sendMessageToWorker<T = any>(type: string, messageData?, id?: number, error?, isResponse = false, timeout = 0, nativeData?): Promise<T> {
        // DEV_LOG && console.info('Sync', 'sendMessageToWorker', type, id, timeout, isResponse, !isResponse && (id || timeout), messageData, nativeData, this.worker);
        if (!isResponse && (id || timeout)) {
            return new Promise((resolve, reject) => {
                // const id = Date.now().valueOf();
                id = id || time();
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
                const keys = Object.keys(nativeData);
                const nativeDataKeysPrefix = Date.now() + '$$$';
                keys.forEach((k) => {
                    setWorkerContextValue(nativeDataKeysPrefix + k, nativeData[k]._native || nativeData[k]);
                });
                const data = {
                    error: !!error ? JSON.stringify(error.toJSON() ? error.toJSON() : { message: error.toString(), ...error }) : undefined,
                    id,
                    nativeDataKeysPrefix,
                    messageData: !!messageData ? JSON.stringify(messageData) : undefined,
                    nativeData: keys.map((k) => nativeDataKeysPrefix + k),
                    type
                };
                // DEV_LOG && console.info('Sync', 'postMessage', JSON.stringify(data));

                this.worker.postMessage(data);
            });
        } else {
            // DEV_LOG && console.info('Sync', 'postMessage', 'test');
            const keys = Object.keys(nativeData);
            const nativeDataKeysPrefix = Date.now() + '$$$';
            keys.forEach((k) => {
                setWorkerContextValue(nativeDataKeysPrefix + k, nativeData[k]._native || nativeData[k]);
            });
            const data = {
                error: !!error ? JSON.stringify({ message: error.toString(), ...error }) : undefined,
                id,
                nativeDataKeysPrefix,
                messageData: !!messageData ? JSON.stringify(messageData) : undefined,
                nativeData: keys.map((k) => nativeDataKeysPrefix + k),
                type
            };
            // DEV_LOG && console.info('Sync', 'postMessage', JSON.stringify(data));
            this.worker.postMessage(data);
        }
    }
    ensureWorker() {
        if (!this.worker) {
            const worker = (this.worker = new Worker('~/workers/ImportWorkerBootstrap') as any);
            worker.onmessage = this.onWorkerMessage.bind(this);
        }
    }
    onImportState(event: ImportStateEventData) {
        this.importRunning = event.state === 'running';
        DEV_LOG && console.log('SyncService', 'onImportState', event.type, event.state, event.showSnack);
        if (event.showSnack === false) {
            return;
        }
        if (event.state === 'running' && event.type.indexOf('import') !== -1) {
            showSnackMessage({ text: lc('importing'), progress: -1 });
        } else if (event.state === 'running' && event.type === 'delete_packs') {
            showSnackMessage({ text: lc('deleting'), progress: -1 });
        } else {
            hideSnackMessage();
        }
    }
    async start() {
        if (this.enabled) {
            return;
        }
        this.enabled = true;
        DEV_LOG && console.log('ImportService', 'start', /* this.services.length,  */ this.enabled);
        if (this.enabled) {
            this.notify({ eventName: EVENT_STATE, enabled: this.enabled } as ImportEnabledEventData);
            // prefs.on(`key:${SETTINGS_REMOTE_AUTO_SYNC}`, this.onAutoSyncPrefChanged);
            // this.onAutoSyncPrefChanged();
            DEV_LOG && console.log('SyncService', 'start');
            this.on(EVENT_IMPORT_STATE, this.onImportState);
        }
    }

    importRunning = false;
    async stop() {
        this.off(EVENT_IMPORT_STATE, this.onImportState);
        if (this.importRunning) {
            // if sync is running wait for it to be finished
            await new Promise((resolve) => this.once(EVENT_IMPORT_STATE, resolve));
        }
        this.worker?.stop();
        this.worker = null;
        // this.services.forEach((service) => service.stop());
    }
    async updateContentFromDataFolder({ showSnack = true }: { showSnack?: boolean } = {}, shouldWait = false) {
        this.ensureWorker();
        await this.sendMessageToWorker('import_data', { showSnack }, shouldWait ? time() : undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
    async importContentFromFiles(files: { filePath: string; id?: string; extraData?: Partial<Pack> }[], folderId?: number, shouldWait = false) {
        DEV_LOG && console.log('importContentFromFiles', files, folderId);
        this.ensureWorker();
        await this.sendMessageToWorker('import_from_files', { files, folderId }, shouldWait ? time() : undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
    // async importContentFromFile(data: { filePath: string; id?: string; extraData?; folderId?: number }) {
    //     DEV_LOG && console.log('importContentFromFile', JSON.stringify(data));
    //     this.ensureWorker();
    //     await this.sendMessageToWorker('import_from_file', data, undefined, undefined, false, 0, { db: documentsService.db.db.db });
    // }
    async deletePacks(packs: Pack[], shouldWait = false) {
        const data = packs.map((s) => ({ id: s.id, folders: s.folders }));
        DEV_LOG && console.log('deleteDocuments', JSON.stringify(data));
        this.ensureWorker();
        await this.sendMessageToWorker('delete_packs', data, shouldWait ? time() : undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
}
export const importService = new ImportService();
