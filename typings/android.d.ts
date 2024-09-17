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
            export namespace Utils {
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
                }
            }
            export namespace FileUtils {
                export class Companion {
                    static copyFile(context: android.content.Context, inputFilePath: string, destFolder: string, fileName: string, mimeType: string, overwrite: boolean);
                }
            }
        }
    }
}
