declare class ContyUtils {
    static cleanFilenameString(str: string): string;
}
declare class WorkerContext {
    static setValue(key: string, value: any);
    static getValue(key: string);
}
declare interface NSFileManager {
    allocatedSizeOfDirectory(url: NSURL);
}

declare interface NSLocale {
    ISO639_2LanguageCode();
}
