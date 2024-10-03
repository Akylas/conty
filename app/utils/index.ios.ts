import { File, Folder } from '@nativescript/core';
import { Zip } from '@nativescript/zip';

export * from './index.common';

export function checkManagePermission() {
    return true;
}
export async function askForManagePermission() {
    return true;
}

// @NativeClass
// class SaveAlbumCompletion extends NSObject {
//     static ObjCExposedMethods = {
//         'didFinishSavingWithError:contextInfo:': {
//             returns: interop.types.void,
//             params: [UIImage, NSError, interop.Pointer]
//         }
//     };
//     resolve;
//     reject;
//     static initWithResolve(resolve, reject) {
//         const delegate = SaveAlbumCompletion.new() as SaveAlbumCompletion;
//         delegate.resolve = resolve;
//         delegate.reject = reject;
//         return delegate;
//     }

//     'didFinishSavingWithError:contextInfo:'(image: UIImage, error: NSError, contextInfo) {
//         if (error) {
//             this.reject(wrapNativeException(error));
//         } else {
//             this.resolve();
//         }
//     }
// }

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
//     const destinationPath = path.join(exportDirectory, destinationName);
//     if (overwrite && File.exists(destinationPath)) {
//         await File.fromPath(destinationPath).remove();
//     }
//     if (toGallery) {
//         await new Promise((resolve, reject) => {
//             UIImageWriteToSavedPhotosAlbum(imageSource.ios, SaveAlbumCompletion.initWithResolve(resolve, reject), 'didFinishSavingWithError:contextInfo:', null);
//         });
//     } else {
//         await imageSource.saveToFileAsync(destinationPath, imageFormat, imageQuality);
//     }
//     // destinationPaths.push(destinationPath);
//     if (reportName !== undefined) {
//         if (reportName) {
//             return destinationPath;
//         } else {
//             return exportDirectory;
//         }
//     }
// }
export function cleanFilename(str) {
    return ContyUtils.cleanFilenameString(str)
        .replace(/[\(\)|?*<\":>+\[\]'"]+/g, '')
        .replace(/[\\\s\t\n\/]+/g, '_');
}

export function unzip(srcPath, dstPath) {
    return Zip.unzip({
        archive: srcPath,
        directory: dstPath,
        overwrite: true
        // onProgress: (percent) => {
        //     ProgressNotifications.update(progressNotification, {
        //         rightIcon: `${Math.round(percent)}%`,
        //         progress: percent
        //     });
        // }
    });
}

export function getFileOrFolderSize(filePath: string) {
    if (Folder.exists(filePath)) {
        return NSFileManager.defaultManager.allocatedSizeOfDirectory(NSURL.URLWithString(filePath));
    } else {
        return File.fromPath(filePath).size;
    }
}

export async function getAudioDuration(audioFile) {
    const audioAsset = AVURLAsset.URLAssetWithURLOptions(NSURL.fileURLWithPath(audioFile), null);
    return new Promise<number>((resolve, reject) => {
        audioAsset.loadValuesAsynchronouslyForKeysCompletionHandler(['duration'], () => {
            resolve(CMTimeGetSeconds(audioAsset.duration) * 1000);
        });
    });
}
