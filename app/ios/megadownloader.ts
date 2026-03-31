import { getManager } from '@nativescript-community/https';
import { File } from '@nativescript/core';

export class MegaDownload {
    //@ts-expect-error MegaDownloaderBridge needs typings
    private static bridge: MegaDownloaderBridge;
    private static initialized = false;

    private static init() {
        if (!this.initialized) {
            const manager = getManager();
            //@ts-expect-error MegaDownloaderBridge needs typings
            this.bridge = MegaDownloaderBridge.alloc().initWithManager(manager);
            this.initialized = true;
        }
    }

    static getFile(
        options: {
            url: string;
            tag: string;
            onProgress?: (current: number, total: number) => void;
        },
        downloadPath: string
    ): Promise<File> {
        this.init();
        return new Promise((resolve, reject) => {
            this.bridge.download(
                options.url,
                options.tag,
                downloadPath,
                (current: number, total: number) => {
                    options.onProgress?.(current, total);
                },
                (filePath: string, error: NSError) => {
                    if (error) reject(error);
                    else resolve(File.fromPath(filePath));
                }
            );
        });
    }

    static cancel(tag: string) {
        this.init();
        this.bridge.cancel(tag);
    }
}
