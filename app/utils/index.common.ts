import { Application, CSSUtils, Color, File, Folder } from '@nativescript/core';

function chunk<T>(array: T[], size) {
    return Array.from<T, T[]>({ length: Math.ceil(array.length / size) }, (value, index) => array.slice(index * size, index * size + size));
}

// type Many<T> = T | T[];
export function pick<T extends object, U extends keyof T>(object: T, ...props: U[]): Pick<T, U> {
    return props.reduce((o, k) => ((o[k] = object[k]), o), {} as any);
}
export function omit<T extends object, U extends keyof T>(object: T, ...props: U[]): Omit<T, U> {
    return Object.keys(object)
        .filter((key) => (props as string[]).indexOf(key) < 0)
        .reduce((newObj, key) => Object.assign(newObj, { [key]: object[key] }), {} as any);
}

export function cleanFilename(str) {
    return str.replace(/[|?*<\":>+\[\]'"]+/g, '').replace(/[\\\s\t\n\/]+/g, '_');
}

export function createColorMatrix(colorStr: string) {
    const color = new Color(colorStr);
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    return [r, r, r, 0, 0, g, g, g, 0, 0, b, b, b, 0, 0, 0, 0, 0, 1, 0];
}

export function timeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hashCode(s) {
    return s.split('').reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
    }, 0);
}
export async function requestManagePermission() {
    return true;
}
export function getAndroidRealPath(src: string) {
    return src;
}

export function getFileOrFolderSize(filePath: string) {
    if (__ANDROID__) {
        //@ts-ignore
        return com.akylas.conty.FileUtils.Companion.getFolderSize(new java.io.File(filePath));
    } else {
        if (Folder.exists(filePath)) {
            //@ts-ignore
            return NSFileManager.defaultManager.allocatedSizeOfDirectoryAt(NSURL.URLWithString(filePath));
        } else {
            return File.fromPath(filePath).size;
        }
    }
}

export function setCustomCssRootClass(className, oldClassName?) {
    const rootView = Application.getRootView();
    const rootModalViews = rootView._getRootModalViews();
    DEV_LOG && console.log('setCustomCssRootClass', rootView, className, oldClassName);
    function addCssClass(rootView, cssClass) {
        cssClass = `${CSSUtils.CLASS_PREFIX}${cssClass}`;
        CSSUtils.pushToSystemCssClasses(cssClass);
        rootView.cssClasses.add(cssClass);
        rootModalViews.forEach((rootModalView) => {
            rootModalView.cssClasses.add(cssClass);
        });
    }
    function removeCssClass(rootView, cssClass) {
        cssClass = `${CSSUtils.CLASS_PREFIX}${cssClass}`;
        CSSUtils.removeSystemCssClass(cssClass);
        rootView.cssClasses.delete(cssClass);
        rootModalViews.forEach((rootModalView) => {
            rootModalView.cssClasses.delete(cssClass);
        });
    }
    addCssClass(rootView, className);
    if (oldClassName) {
        removeCssClass(rootView, oldClassName);
    }
}
