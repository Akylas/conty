import BaseWorkerHandler from '@akylas/nativescript-app-utils/worker/BaseWorkerHandler';
import { lc } from '@nativescript-community/l';
import { EventData, Observable } from '@nativescript/core';
import { time } from '@nativescript/core/profiling';
import { Optional } from '@nativescript/core/utils/typescript-utils';
import { CustomError } from '@shared/utils/error';
import { showError } from '@shared/utils/showError';
import { Pack } from '~/models/Pack';
import { EVENT_IMPORT_STATE, EVENT_STATE } from '~/utils/constants';
import { hideSnackMessage, showSnackMessage } from '~/utils/ui';
import ImportWorker, { ImportStateEventData } from '~/workers/ImportWorker';
import { documentsService } from './documents';

export interface ImportEnabledEventData extends Optional<EventData<Observable>, 'object'> {
    enabled: boolean;
}

export class ImportService extends BaseWorkerHandler<ImportWorker> {
    constructor() {
        super(() => new Worker('~/workers/ImportWorker'));
    }
    async onWorkerEvent(eventData: any) {
        if (eventData.target === 'documentsService') {
            if (eventData.pack) {
                eventData.pack = await documentsService.packRepository.get(eventData.pack.id);
            }
            documentsService.notify({ ...eventData, object: eventData.object || documentsService });
        } else {
            // DEV_LOG && console.info('notifying event from worker', documentsService.id, eventData.eventName, Object.keys(eventData));
            this.notify({ ...eventData });
        }
    }
    handleError(error: any) {
        showError(error);
    }
    handleWorkerError(error: any) {
        showError(CustomError.fromObject(error));
    }
    enabled = false;
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
        await this.sendMessageToWorker('import_data', { showSnack }, shouldWait ? time() : undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
    async importContentFromFiles(files: { filePath: string; id?: string; extraData?: Partial<Pack> }[], folderId?: number, shouldWait = false) {
        DEV_LOG && console.log('importContentFromFiles', files, folderId);
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
        await this.sendMessageToWorker('delete_packs', data, shouldWait ? time() : undefined, undefined, false, 0, { db: documentsService.db.db.db });
    }
}
export const importService = new ImportService();
