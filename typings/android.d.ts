declare namespace com {
    export namespace tns {
        export class NativeScriptException {
            static getStackTraceAsString(ex): string;
        }
    }
    export namespace akylas {
        export namespace conty {
            export namespace UnZip {
                export class ZipCallback extends java.lang.Object {
                    public constructor(implementation: {
                        onStart(worker: string, mode: number);
                        onUnzipComplete(worker: string, extractedFolder: string);
                        onError(worker: string, e: Exception, mode: number);
                    });
                    public onStart(worker: string, mode: number);
                    public onZipComplete(worker: string, zipFile: string);
                    public onUnzipComplete(worker: string, extractedFolder: string);
                    public onError(worker: string, e: Exception, mode: number);
                }
                export function unzip(context: Context, zipFile: string, destinationFolder: string, workerIdentifier: string, callback: ZipCallback);
            }
            class ZipMediaDataSource extends android.media.MediaDataSource {
                constructor(zipPath: string, asset: string);
            }
            export namespace ZipMediaDataSource {
                function readBitmapFromAsset(context: android.content.Context, zip: string, asset: string, callback: Callback);
                function readTextFromAsset(context: android.content.Context, zip: string, asset: string, encoding: string, callback: Callback);
                class Callback {
                    constructor({ onError, onSuccess });
                }
            }
            class BgService extends globalAndroid.app.Service {}
            class BgServiceBinder extends globalAndroid.os.Binder {}
            class ActionReceiver extends globalAndroid.content.BroadcastReceiver {}
            class CustomMediaButtonReceiver extends androidx.media.session.MediaButtonReceiver {}

            export namespace utils {
                export class FunctionCallback extends java.lang.Object {
                    public static class: java.lang.Class<FunctionCallback>;
                    /**
                     * Constructs a new instance of the com.akylas.documentscanner.utils.FunctionCallback interface with the provided implementation. An empty constructor exists calling super() when extending the interface class.
                     */
                    public constructor(implementation: { onResult(param0: java.lang.Exception, param1: any): void });
                    public constructor();
                    public onResult(param0: java.lang.Exception, param1: any): void;
                }
            }
            export namespace Utils {
                export class ProgressCallback extends java.lang.Object {
                    public constructor(implementation: { onProgress(param0: number, param1: number, param2: number): void });
                    public constructor();
                    public onProgress(param0: number, param1: number, param2: number): void;
                }
                export class Companion {
                    static cleanFilenameString(str: string): string;
                }
            }
            export namespace Colors {
                export class Companion {
                    static createPaletteSync(bitmap: android.graphics.Bitmap): {
                        vibrant: string;
                        muted: string;
                        darkVibrant: string;
                        darkMuted: string;
                        lightVibrant: string;
                        lightMuted;
                    };
                    static getDominantColors(bitmap: android.graphics.Bitmap, k: number, callback: FunctionCallback);
                    static getDominantColorsSync(bitmap: android.graphics.Bitmap, k: number, resizeThreshod?: number): string;
                }
            }
            export namespace FileUtils {
                export class Companion {
                    static copyFile(context: android.content.Context, inputFilePath: string, destFolder: string, fileName: string, mimeType: string, overwrite: boolean);
                    static unzip(context: android.content.Context, src: string, src: string, callback?: FunctionCallback, progress?: ProgressCallback);
                    static getFolderSize(file: java.io.File): number;
                }
            }
        }
    }
}
