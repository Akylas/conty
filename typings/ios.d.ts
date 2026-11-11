declare class ContyUtils {
    static cleanFilenameString(str: string): string;
}
declare class ContyImageUtils {
    static loadPossible4Bitmap(key: string): UIImage?;
}
declare interface NSFileManager {
    allocatedSizeOfDirectory(url: NSURL);
}

declare function CGSizeMake(width: number, height: number): CGSize;

declare function CGRectMake(x: number, y: number, width: number, height: number): CGRect;
