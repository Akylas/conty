import { AndroidActivityResultEventData, Application, File, Folder, Utils, path } from '@nativescript/core';
import { SDK_VERSION } from '@nativescript/core/utils';

export * from './index.common';

export function restartApp() {
    com.akylas.conty.Utils.Companion.restartApp(Utils.android.getApplicationContext(), Application.android.startActivity);
}

export async function copyFolderContent(src: string, dst: string) {
    const folder = Folder.fromPath(src);
    // ensure we create the folder
    Folder.fromPath(dst);
    if (!Folder.exists(dst)) {
        throw new Error('failed copying folder ' + dst);
    }
    DEV_LOG && console.log('copyFolderContent ', src, dst, Folder.exists(dst));
    return Promise.all(
        (await folder.getEntities()).map((e) => {
            if (e instanceof File) {
                const dstFile = path.join(dst, e.name);
                DEV_LOG && console.log('copyFile ', e.path, dstFile);
                return e.copy(dstFile).then((r) => {
                    if (!File.exists(dstFile)) {
                        throw new Error('failed copying file ' + dstFile);
                    }
                });
            } else {
                const dstFolder = path.join(dst, e.name);
                return copyFolderContent(path.join(src, e.name), dstFolder);
            }
        })
    );
}
export async function removeFolderContent(src: string) {
    const folder = Folder.fromPath(src);
    return Promise.all((await folder.getEntities()).map((e) => e.remove()));
}
// export async function saveImage(
//     imageSource: ImageSource,
//     {
//         imageFormat,
//         fileName,
//         imageQuality,
//         exportDirectory,
//         toGallery = false,
//         overwrite = true,
//         reportName
//     }: { toGallery?: boolean; imageFormat: 'png' | 'jpeg' | 'jpg'; imageQuality; fileName: string; exportDirectory: string; reportName?: boolean; overwrite?: boolean }
// ) {
//     let destinationName = fileName;
//     if (!destinationName.endsWith(imageFormat)) {
//         destinationName += '.' + imageFormat;
//     }
//     // DEV_LOG && console.log('saveImage', fileName, imageFormat, imageQuality, exportDirectory, destinationName);
//     if (toGallery) {
//         await request('storage');
//         com.akylas.conty.utils.ImageUtil.Companion.saveBitmapToGallery(Utils.android.getApplicationContext(), imageSource.android, imageFormat, imageQuality, fileName);
//     } else if (exportDirectory.startsWith(ANDROID_CONTENT)) {
//         const context = Utils.android.getApplicationContext();
//         const outdocument = androidx.documentfile.provider.DocumentFile.fromTreeUri(context, android.net.Uri.parse(exportDirectory));
//         let outfile: androidx.documentfile.provider.DocumentFile;
//         if (overwrite) {
//             outfile = outdocument.findFile(destinationName) || outdocument.createFile('image/' + imageFormat, destinationName);
//         } else {
//             outfile = outdocument.createFile('image/' + imageFormat, destinationName) || outdocument.findFile(destinationName);
//         }
//         if (!outfile) {
//             throw new Error(`error creating file "${destinationName}" in "${exportDirectory}"`);
//         }

//         const stream = Utils.android.getApplicationContext().getContentResolver().openOutputStream(outfile.getUri());
//         (imageSource.android as android.graphics.Bitmap).compress(
//             imageFormat === 'png' ? android.graphics.Bitmap.CompressFormat.PNG : android.graphics.Bitmap.CompressFormat.JPEG,
//             imageQuality,
//             stream
//         );
//         if (reportName !== undefined) {
//             if (reportName) {
//                 return com.nativescript.documentpicker.FilePath.getPath(context, outfile.getUri());
//             } else {
//                 return com.nativescript.documentpicker.FilePath.getPath(context, outdocument.getUri());
//             }
//         }
//     } else {
//         const destinationPath = path.join(exportDirectory, destinationName);

//         if (overwrite && File.exists(destinationPath)) {
//             await File.fromPath(destinationPath).remove();
//         }
//         await imageSource.saveToFileAsync(destinationPath, imageFormat, imageQuality);
//         // destinationPaths.push(destinationPath);
//         if (reportName !== undefined) {
//             if (reportName) {
//                 return destinationPath;
//             } else {
//                 return exportDirectory;
//             }
//         }
//     }
// }
export function checkManagePermission() {
    return SDK_VERSION < 30 || android.os.Environment.isExternalStorageManager();
}
export async function askForManagePermission() {
    const activity = Application.android.startActivity;
    if (checkManagePermission()) {
        return true;
    }
    //If the draw over permission is not available open the settings screen
    //to grant the permission.
    return new Promise<boolean>((resolve, reject) => {
        const REQUEST_CODE = 6646;
        const onActivityResultHandler = (data: AndroidActivityResultEventData) => {
            if (data.requestCode === REQUEST_CODE) {
                Application.android.off(Application.android.activityResultEvent, onActivityResultHandler);
                resolve(android.provider.Settings.canDrawOverlays(activity));
            }
        };
        Application.android.on(Application.android.activityResultEvent, onActivityResultHandler);
        const intent = new android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, android.net.Uri.parse('package:' + __APP_ID__));
        activity.startActivityForResult(intent, REQUEST_CODE);
    });
}
export async function requestManagePermission() {
    if (SDK_VERSION >= 30) {
        await askForManagePermission();
        return checkManagePermission();
    }
    return true;
}
export function getAndroidRealPath(src: string) {
    if (__ANDROID__) {
        let filePath = '';

        // ExternalStorageProvider
        // const uri  = android.net.Uri.parse(android.net.Uri.decode(src));
        const docId = android.net.Uri.decode(src);
        // console.log('docId', docId);
        const split = docId.split(':');
        const type = split[split.length - 2];

        if ('primary' === type) {
            return android.os.Environment.getExternalStorageDirectory().getPath() + '/' + split[split.length - 1];
        } else {
            // if (Build.VERSION.SDK_INT > Build.VERSION_CODES.KITKAT) {
            //getExternalMediaDirs() added in API 21
            const external = Utils.android.getApplicationContext().getExternalMediaDirs();
            if (external.length > 1) {
                filePath = external[1].getAbsolutePath();
                filePath = filePath.substring(0, filePath.indexOf('Android')) + split[split.length - 1];
            }
            // } else {
            //     filePath = "/storage/" + type + "/" + split[1];
            // }
            return filePath;
        }
    }
    return src;
}
