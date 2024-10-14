import { AndroidActivityResultEventData, Application, File, Folder, Utils } from '@nativescript/core';
import { SDK_VERSION, wrapNativeException } from '@nativescript/core/utils';
import { ANDROID_CONTENT } from './constants';

export * from './index.common';

function _checkManagePermission() {
    return SDK_VERSION >= 30 && android.os.Environment.isExternalStorageManager();
}

let _hasManagePermission: boolean = _checkManagePermission();
export function hasManagePermission() {
    return !!_hasManagePermission;
}
export function checkManagePermission() {
    if (_hasManagePermission === undefined) {
        _hasManagePermission = _checkManagePermission();
    }
    return _hasManagePermission;
}
export async function askForManagePermission() {
    const activity = Application.android.startActivity;

    //If the draw over permission is not available open the settings screen
    //to grant the permission.
    return new Promise<boolean>((resolve, reject) => {
        const REQUEST_CODE = 6646;
        const onActivityResultHandler = (data: AndroidActivityResultEventData) => {
            if (data.requestCode === REQUEST_CODE) {
                Application.android.off(Application.android.activityResultEvent, onActivityResultHandler);
                _hasManagePermission = _checkManagePermission();
                resolve(_hasManagePermission);
            }
        };
        Application.android.on(Application.android.activityResultEvent, onActivityResultHandler);
        const intent = new android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, android.net.Uri.parse('package:' + __APP_ID__));
        activity.startActivityForResult(intent, REQUEST_CODE);
    });
}
export async function requestManagePermission() {
    if (!PLAY_STORE_BUILD && SDK_VERSION >= 30) {
        if (checkManagePermission()) {
            return true;
        }
        return askForManagePermission();
    }
    return true;
}
export function getRealPath(src: string, force = false) {
    DEV_LOG && console.log('getRealPath', src, _hasManagePermission, force);
    if (!force && !_hasManagePermission) {
        return src;
    }
    if (!src.startsWith(ANDROID_CONTENT)) {
        return src;
    }
    try {
        const uri = android.net.Uri.parse(src);
        const result = com.nativescript.documentpicker.FilePath.getPath(Utils.android.getApplicationContext(), uri);
        DEV_LOG && console.log('getRealPath1', result);
        if (result?.length) {
            return result;
        }
    } catch (error) {
        console.error(error, error.stack);
    }
    DEV_LOG && console.log('getRealPath2');
    let filePath = '';

    // ExternalStorageProvider
    // const uri  = android.net.Uri.parse(android.net.Uri.decode(src));
    const docId = android.net.Uri.decode(src);
    console.log('docId', docId);
    const split = docId.split(':');
    const type = split[split.length - 2];

    if ('primary' === type) {
        return android.os.Environment.getExternalStorageDirectory().getPath() + '/' + split[split.length - 1];
    } else {
        // if (Build.VERSION.SDK_INT > Build.VERSION_CODES.KITKAT) {
        //getExternalMediaDirs() added in API 21
        const external = Utils.android.getApplicationContext().getExternalMediaDirs();
        DEV_LOG && console.log('external', external, external.length);
        if (external.length > 1) {
            filePath = external[1].getAbsolutePath();
            DEV_LOG && console.log('filePath', filePath);
            filePath = filePath.substring(0, filePath.indexOf('Android')) + split[split.length - 1];
        }
        // } else {
        //     filePath = "/storage/" + type + "/" + split[1];
        // }
        return filePath;
    }
    return src;
}
export function cleanFilename(str: string) {
    return com.akylas.conty.Utils.Companion.cleanFilenameString(str)
        .replace(/[\(\)|?*<\":>+\[\]'"]+/g, '')
        .replace(/[\\\s\t\n\/]+/g, '_');
}
let callback;
function androidFunctionCallbackPromise<T>(onCallback: (calback: com.akylas.conty.utils.FunctionCallback) => void, transformer = (v) => v, errorHandler = (e) => wrapNativeException(e)) {
    return new Promise<T>((resolve, reject) => {
        callback = new com.akylas.conty.utils.FunctionCallback({
            onResult(e, result) {
                if (e) {
                    reject(errorHandler(e));
                    callback = null;
                } else {
                    try {
                        resolve(transformer(result));
                    } catch (error) {
                        reject(error);
                    } finally {
                        callback = null;
                    }
                }
            }
        });
        onCallback(callback);
    });
}

export async function unzip(srcPath: string, dstPath: string) {
    DEV_LOG && console.log('unzip', srcPath, dstPath);
    // if (srcPath.startsWith('content:/') && dstPath.startsWith('content:/')) {
    //     return androidFunctionCallbackPromise<any[]>((callback) => {
    //         com.akylas.conty.FileUtils.Companion.unzip(Utils.android.getApplicationContext(), srcPath, dstPath, callback, null);
    //     });
    // }
    return new Promise<void>((resolve, reject) => {
        com.akylas.conty.UnZip.unzip(
            Utils.android.getApplicationContext(),
            srcPath,
            dstPath,
            'unzip',
            new com.akylas.conty.UnZip.ZipCallback({
                onStart(worker, mode) {},
                onUnzipComplete(worker, zipFile) {
                    DEV_LOG && console.log('onUnzipComplete', worker, zipFile);
                    resolve();
                },
                onError(worker, e, mode) {
                    DEV_LOG && console.log('onError', e);
                    reject(wrapNativeException(e));
                }
            })
        );
    });
    // return Zip.unzip({
    //     archive: srcPath,
    //     directory: dstPath,
    //     overwrite: true
    //     // onProgress: (percent) => {
    //     //     ProgressNotifications.update(progressNotification, {
    //     //         rightIcon: `${Math.round(percent)}%`,
    //     //         progress: percent
    //     //     });
    //     // }
    // });
}
export function getFileOrFolderSize(filePath: string) {
    return com.akylas.conty.FileUtils.Companion.getFolderSize(Utils.android.getApplicationContext(), filePath);
}
export async function getAudioDuration(audioFile) {
    const uri = android.net.Uri.parse(audioFile);
    const mmr = new android.media.MediaMetadataRetriever();
    mmr.setDataSource(Utils.android.getApplicationContext(), uri);
    const durationStr = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
    return parseInt(durationStr, 10);
}
export function closeApp() {
    Application.android.startActivity.finish();
}
