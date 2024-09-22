declare namespace com {
    export namespace tns {
        export class NativeScriptException {
            static getStackTraceAsString(ex): string;
        }
    }
    export namespace akylas {
        export namespace conty {
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
            export namespace WorkersContext {
                export class Companion {
                    public static getValue(key): any;
                    public static setValue(key: string, value);
                }
            }
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
                    static prepareActivity(arg0: androidx.appcompat.app.AppCompatActivity, applyDynamicColors: boolean);
                    static prepareWindow(arg0: android.view.Window);
                    static applyDayNight(context: android.content.Context, applyDynamicColors: boolean);
                    static applyDynamicColors(context: android.content.Context);
                    static getDimensionFromInt(context: android.content.Context, intToGet);
                    static getColorFromInt(context: android.content.Context, intToGet);
                    static getColorFromName(context: android.content.Context, intToGet);
                    static restartApp(context: android.content.Context, activity: android.app.Activity);
                    static getSystemLocale(): java.util.Locale;
                    static cleanFilenameString(str: string): string;
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
