import { getFile } from '@nativescript/core/http';
import * as https from '@nativescript-community/https';
import * as ProgressNotifications from '~/services/ProgressNotifications';
import { Application, ApplicationEventData, ApplicationSettings, File, Folder, Utils, knownFolders, path } from '@nativescript/core';
import { connectionType, getConnectionType, startMonitoring, stopMonitoring } from '@nativescript/core/connectivity';
import { EventData, Observable } from '@nativescript/core/data/observable';
import { throttle, wrapNativeException } from '@nativescript/core/utils';
import { cleanFilename, hashCode } from '~/utils';
import { HTTPError, NoNetworkError, TimeoutError } from '~/utils/error';
import { Zip } from '@nativescript/zip';
import { documentsService } from './documents';
import SqlQuery from '@akylas/kiss-orm/dist/Queries/SqlQuery';
import dayjs from 'dayjs';
import { confirm } from '@nativescript-community/ui-material-dialogs';
import { l, lc } from '@nativescript-community/l';
import { filesize } from 'filesize';
import { hideLoading, showLoading, showSnack, showSnackMessage } from '~/utils/ui';
import { request as permRequest } from '@nativescript-community/perms';
import { RemoteContent } from '~/models/Pack';
import { showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
import { ANDROID_CONTENT } from '~/utils/constants';
import { showError } from '~/utils/showError';

export type HTTPSOptions = https.HttpsRequestOptions;
export type { Headers } from '@nativescript-community/https';

const sql = SqlQuery.createFromTemplateString;

export const NetworkConnectionStateEvent = 'connected';
export interface NetworkConnectionStateEventData extends EventData {
    data: {
        connected: boolean;
        connectionType: connectionType;
    };
}

export interface HttpRequestOptions extends HTTPSOptions {
    queryParams?: object;
}

export function queryString(params, location) {
    const obj = {};
    let i, len, key, value;

    if (typeof params === 'string') {
        value = location.match(new RegExp('[?&]' + params + '=?([^&]*)[&#$]?'));
        return value ? value[1] : undefined;
    }

    const locSplit = location.split(/[?&]/);
    // _params[0] is the url

    const parts = [];
    for (i = 0, len = locSplit.length; i < len; i++) {
        const theParts = locSplit[i].split('=');
        if (!theParts[0]) {
            continue;
        }
        if (theParts[1]) {
            parts.push(theParts[0] + '=' + theParts[1]);
        } else {
            parts.push(theParts[0]);
        }
    }
    if (Array.isArray(params)) {
        let data;

        for (i = 0, len = params.length; i < len; i++) {
            data = params[i];
            if (typeof data === 'string') {
                parts.push(data);
            } else if (Array.isArray(data)) {
                parts.push(data[0] + '=' + data[1]);
            }
        }
    } else if (typeof params === 'object') {
        for (key in params) {
            value = params[key];
            if (typeof value === 'undefined') {
                delete obj[key];
            } else {
                if (typeof value === 'object') {
                    obj[key] = encodeURIComponent(JSON.stringify(value));
                } else {
                    obj[key] = encodeURIComponent(value);
                }
            }
        }
        for (key in obj) {
            parts.push(key + (obj[key] === true ? '' : '=' + obj[key]));
        }
    }

    return parts.splice(0, 2).join('?') + (parts.length > 0 ? '&' + parts.join('&') : '');
}

interface NetworkService {
    on(eventNames: 'connected', callback: (data: NetworkConnectionStateEventData) => void, thisArg?: any);
    on(eventNames: 'connection', callback: (e: EventData & { connectionType: connectionType; connected: boolean }) => void, thisArg?: any);
}

class NetworkService extends Observable {
    _connectionType: connectionType = connectionType.none;
    _connected = true;
    get connected() {
        return this._connected;
    }
    set connected(value: boolean) {
        if (this._connected !== value) {
            this._connected = value;
            this.notify({
                eventName: NetworkConnectionStateEvent,
                object: this,
                data: {
                    connected: value,
                    connectionType: this._connectionType
                }
            } as NetworkConnectionStateEventData);
        }
    }
    get connectionType() {
        return this._connectionType;
    }
    set connectionType(value: connectionType) {
        if (this._connectionType !== value) {
            this._connectionType = value;
            this.connected = value !== connectionType.none;
            // this.notify({ eventName: 'connection', object: this, connectionType: value, connected: this.connected });
        }
    }
    monitoring = false;
    start() {
        if (this.monitoring) {
            return;
        }
        this.monitoring = true;
        Application.on(Application.foregroundEvent, this.onAppForeground, this);
        Application.on(Application.backgroundEvent, this.onAppBackground, this);
        startMonitoring(this.onConnectionStateChange.bind(this));
        const folder = Folder.fromPath(knownFolders.externalDocuments().path).getFolder('cache');
        const diskLocation = folder.path;
        DEV_LOG && console.log('setCache', diskLocation);
        https.setCache({
            diskLocation,
            diskSize: 40 * 1024 * 1024,
            memorySize: 10 * 1024 * 1024
        });
        this.connectionType = getConnectionType();
    }
    stop() {
        if (!this.monitoring) {
            return;
        }
        Application.off(Application.foregroundEvent, this.onAppForeground, this);
        Application.off(Application.backgroundEvent, this.onAppBackground, this);
        this.monitoring = false;
        stopMonitoring();
    }
    background = true;
    onAppForeground(args: ApplicationEventData) {
        if (this.background) {
            this.background = false;
            this.connectionType = getConnectionType();
        }
    }
    onAppBackground(args: ApplicationEventData) {
        if (!this.background) {
            this.background = true;
        }
    }
    onConnectionStateChange(newConnectionType: connectionType) {
        this.connectionType = newConnectionType;
    }
}

export const networkService = new NetworkService();

async function handleRequestRetry(requestParams: HttpRequestOptions, retry = 0) {
    throw new HTTPError({
        statusCode: 401,
        message: 'HTTP error',
        requestParams
    });
}

export function wrapNativeHttpException(error, requestParams: HttpRequestOptions) {
    return wrapNativeException(error, (message) => {
        if (/(SocketTimeout|SocketException|UnknownHost)/.test(message)) {
            return new TimeoutError();
        } else {
            return new HTTPError({
                message,
                statusCode: -1,
                requestParams
            });
        }
    });
}
async function handleRequestResponse<T>(response: https.HttpsResponse<https.HttpsResponseLegacy<T>>, requestParams: HttpRequestOptions, requestStartTime, retry): Promise<T> {
    const statusCode = response.statusCode;
    let content: T;
    try {
        content = await response.content.toJSONAsync();
    } catch (err) {
        console.error(err, err.stack);
    }
    if (!content) {
        content = (await response.content.toStringAsync()) as any;
    }
    const isJSON = typeof content === 'object' || Array.isArray(content);
    if (Math.round(statusCode / 100) !== 2) {
        let jsonReturn;
        if (isJSON) {
            jsonReturn = content;
        } else {
            const match = /<title>(.*)\n*<\/title>/.exec(content as any as string);
            throw new HTTPError({
                statusCode,
                message: match ? match[1] : content.toString(),
                requestParams
            });
        }
        if (jsonReturn) {
            if (Array.isArray(jsonReturn)) {
                jsonReturn = jsonReturn[0];
            }
            // if (statusCode === 401 && jsonReturn.error === 'invalid_grant') {
            //     return this.handleRequestRetry(requestParams, retry);
            // }
            const error = jsonReturn.error_description || jsonReturn.error || jsonReturn;
            throw new HTTPError({
                statusCode: error.code || statusCode,
                message: error.error_description || error.form || error.message || error.error || error,
                requestParams
            });
        }
    }
    return content as any as T;
}
function getRequestHeaders(requestParams?: HttpRequestOptions) {
    const headers = requestParams?.headers ?? {};
    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}
export async function request<T = any>(requestParams: HttpRequestOptions, retry = 0) {
    if (!networkService.connected) {
        throw new NoNetworkError();
    }
    if (requestParams.queryParams) {
        requestParams.url = queryString(requestParams.queryParams, requestParams.url);
        delete requestParams.queryParams;
    }
    requestParams.headers = getRequestHeaders(requestParams);

    const requestStartTime = Date.now();
    DEV_LOG && console.log('request', requestParams);
    try {
        const response = await https.request<T>(requestParams);
        return handleRequestResponse<T>(response, requestParams, requestStartTime, retry);
    } catch (error) {
        throw wrapNativeHttpException(error, requestParams);
    }
}

export async function getHEAD<T>(arg: any) {
    return (await https.request<T>(typeof arg === 'string' ? { url: arg, method: 'HEAD' } : arg)).headers;
}

export async function downloadStories(story: RemoteContent) {
    let progressNotificationId;
    let destinationFilePath;
    try {
        // showSnack({ message: lc('preparing_download') });
        const size = parseInt((await getHEAD(story.download))['content-length'], 10);
        // const toDownload = await Promise.all(
        //     stories.map(async (s) => {
        //         const pageContent = await (await https.request<string>({ method: 'GET', url: stories[0].download })).content.toStringAsync();
        //         const actualUrl = pageContent.match(/<meta http-equiv="refresh" content="0; url=(.*)">/)[1];
        //         const size = parseInt((await getHEAD(actualUrl))['content-length'], 10);
        //         return {
        //             ...s,
        //             download: actualUrl,
        //             size
        //         };
        //     })
        // );
        // DEV_LOG &&
        //     console.log(
        //         'toDownload',
        //         toDownload.map((s) => ({ size: s.size, download: s.download }))
        //     );
        // const totalSize = toDownload.reduce((acc, cur) => acc + cur.size, 0);
        // const confirmed = await confirm({
        //     title: lc('download_stories'),
        //     message: lc(
        //         'confirm_download_stories',
        //         toDownload.length,
        //         filesize(
        //             toDownload.reduce((acc, cur) => acc + cur.size, 0),
        //             { output: 'string' }
        //         )
        //     )
        // });

        // if (!confirmed) {
        //     return;
        // }
        progressNotificationId = 52346 + hashCode(story.download);
        // const headers = await Promise.all(stories.map(getHEAD));

        // const newContentSize = headers['content-length'];
        // DEV_LOG && console.log('checkForStoryUpdate', url, storyId, workingDir, newContentSize, typeof newContentSize, lastSize !== newContentSize, Folder.exists(storyDirPath));

        // if (forceReload || lastSize !== newContentSize || !Folder.exists(storyDirPath)) {
        const runningRequestTag: string = story.download;
        const name = cleanFilename(story.title);

        const progressNotification = ProgressNotifications.show({
            id: progressNotificationId, //required
            icon: 'mdi-glasses',
            smallIcon: 'mdi-download',
            title: lc('downloading_story') + '...',
            message: filesize(size, { output: 'string' }),
            indeterminate: false,
            progress: 0,
            actions: [
                {
                    id: 'cancel',
                    text: 'mdi-close',
                    notifText: lc('cancel'),
                    callback: () => {
                        DEV_LOG && console.log('cancelling downloading request', runningRequestTag);
                        https.cancelRequest(runningRequestTag);
                    }
                }
            ]
        });
        function updateProgress(progress) {
            showSnackMessage({ text: l('downloading_story_progress', progress), progress });
        }
        updateProgress(0);
        DEV_LOG && console.log('progressNotification', progressNotification);

        // await Promise.all(
        // toDownload.map(async (s) => {
        const destinationFileName = `${name}.zip`;
        const destinationFolderPath = __IOS__ ? knownFolders.temp().path : documentsService.dataFolder.path;
        const androidUseContent = __ANDROID__ && destinationFolderPath.startsWith(ANDROID_CONTENT);
        const onProgress = throttle((current, total) => {
            const perc = Math.round((current / total) * 100);
            updateProgress(perc);
            ProgressNotifications.update(progressNotification, {
                rightIcon: `${perc}%`,
                progress: perc
            });
        }, 1000);
        // const existingStory = await documentsService.packRepository.search({
        //     where: sql`title = ${story.title}`
        // });
        // if (existingStory?.length) {
        //     throw new Error(`existing story ${story.title}`);
        // }
        const downloadFilePath = androidUseContent ? path.join(knownFolders.temp().path, destinationFileName) : path.join(destinationFolderPath, destinationFileName);
        const file = await getFile(
            {
                url: story.download,
                tag: runningRequestTag,
                method: 'GET',
                onProgress
            },
            downloadFilePath
        );

        DEV_LOG && console.log('downloaded', story.download, File.exists(file.path), file.size);
        if (File.exists(file.path) && file.size > 0) {
            destinationFilePath = downloadFilePath;
            if (__ANDROID__ && androidUseContent) {
                //we need to copy the file
                const context = Utils.android.getApplicationContext();
                destinationFilePath = com.akylas.conty.FileUtils.Companion.copyFile(context, downloadFilePath, destinationFolderPath, destinationFileName, 'application/zip', true);
            }
            if (__IOS__) {
                destinationFilePath = documentsService.dataFolder.getFolder(name).path;
                await Folder.fromPath(destinationFilePath).remove();
                // ProgressNotification.update(progressNotification, {
                //     title: $tc('uncompress_glasses_data', storyId),
                //     rightIcon: '0%',
                //     progress: 0
                // });
                await Zip.unzip({
                    archive: file.path,
                    directory: destinationFilePath,
                    overwrite: true
                    // onProgress: (percent) => {
                    //     ProgressNotifications.update(progressNotification, {
                    //         rightIcon: `${Math.round(percent)}%`,
                    //         progress: percent
                    //     });
                    // }
                });
                DEV_LOG && console.log('unzipped ', destinationFilePath);
            }

            await documentsService.importStory(name, destinationFilePath, __ANDROID__, {
                createdDate: dayjs(story.created_at).valueOf(),
                modifiedDate: dayjs(story.updated_at).valueOf(),
                size,
                age: story.age,
                title: story.title,
                description: story.description
            });
        }
        // })
        // );
    } catch (error) {
        showError(error);
        if (destinationFilePath && File.exists(destinationFilePath)) {
            File.fromPath(destinationFilePath).remove();
        }
    } finally {
        ProgressNotifications.dismiss(progressNotificationId);
    }
}
