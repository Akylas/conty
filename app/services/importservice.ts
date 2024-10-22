import { time } from '@nativescript/core/profiling';
import { EventData } from '@nativescript-community/ui-image';
import { Observable } from '@nativescript/core';
import { Pack } from '~/models/Pack';
import { EVENT_IMPORT_STATE, EVENT_STATE } from '~/utils/constants';
import { CustomError } from '@shared/utils/error';
import { showError } from '@shared/utils/showError';
import ImportWorker, { ImportStateEventData, WorkerEventType } from '~/workers/ImportWorker';
import { documentsService } from './documents';
import { lc } from '@nativescript-community/l';
import { hideSnackMessage, showSnackMessage } from '~/utils/ui';
import { getWorkerContextValue, loadImageSync, setWorkerContextValue } from '@akylas/nativescript-app-utils';

export interface ImportEnabledEventData extends EventData {
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
        // DEV_LOG && console.log('onWorkerMessage', event);
        const data = event.data;
        const id = data.id;
        try {
            let messageData = data.messageData;
            if (typeof messageData === 'string') {
                try {
                    messageData = JSON.parse(messageData);
                } catch (error) {}
            }
            // DEV_LOG && console.error(TAG, 'onWorkerMessage', id, data.type, id && this.messagePromises.hasOwnProperty(id), Object.keys(this.messagePromises), messageData);
            if (id && this.messagePromises.hasOwnProperty(id)) {
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
                    DEV_LOG && console.info('worker event', documentsService.id, eventData.eventName, eventData.target, !!eventData.object, Object.keys(eventData), JSON.stringify(eventData.pack));
                    if (eventData.target === 'documentsService') {
                        if (eventData.pack) {
                            eventData.pack = await documentsService.packRepository.get(eventData.pack.id);
                        }
                        documentsService.notify({ ...eventData, object: eventData.object || documentsService });
                    } else {
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
        DEV_LOG && console.log('SyncService', 'onImportState', event.type, event.state);
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
    async stop() {
        this.off(EVENT_IMPORT_STATE, this.onImportState);
        // if (this.syncRunning) {
        //     // if sync is running wait for it to be finished
        //     await new Promise((resolve) => this.once(EVENT_SYNC_STATE, resolve));
        // }
        // this.services.forEach((service) => service.stop());
    }
    async updateContentFromDataFolder() {
        this.ensureWorker();
        await this.sendMessageToWorker('import_data', undefined, undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
    async importContentFromFiles(files: string[], folder?: string) {
        DEV_LOG && console.log('importContentFromFiles', files, folder);
        this.ensureWorker();
        await this.sendMessageToWorker('import_from_files', { files, folder }, undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
    async importContentFromFile(data: { filePath: string; id?: string; extraData?; folder?: string }) {
        DEV_LOG && console.log('importContentFromFile', JSON.stringify(data));
        this.ensureWorker();
        await this.sendMessageToWorker('import_from_file', data, undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
    async deletePacks(packs: Pack[]) {
        const data = packs.map((s) => ({ id: s.id, folders: s.folders }));
        DEV_LOG && console.log('deleteDocuments', JSON.stringify(data));
        this.ensureWorker();
        await this.sendMessageToWorker('delete_packs', data, undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
}
export const importService = new ImportService();
