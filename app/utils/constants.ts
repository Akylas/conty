import { Screen } from '@nativescript/core';
import { createColorMatrix } from './index.common';
import { SDK_VERSION } from '@nativescript/core/utils';

export const ALERT_OPTION_MAX_HEIGHT = Screen.mainScreen.heightDIPs * 0.47;
export const ANDROID_CONTENT = 'content://';
export const DEFAULT_INVERSE_IMAGES = false;

export const SETTINGS_LANGUAGE = 'language';
export const SETTINGS_REMOTE_SOURCES = 'remote_sources';
export const SETTINGS_COLOR_THEME = 'color_theme';
export const SETTINGS_INVERSE_IMAGES = 'inverse_images';
export const DEFAULT_COLOR_THEME = 'default';

export const EVENT_PACK_ADDED = 'packAdded';
export const EVENT_PACK_UPDATED = 'packUpdated';
export const EVENT_PACK_DELETED = 'packDeleted';
export const EVENT_IMPORT_STATE = 'importState';
export const EVENT_STATE = 'state';

export const BOTTOM_BUTTON_OFFSET = 100;

export const IMAGE_COLORMATRIX = createColorMatrix('#ffffff');
export const COLORMATRIX_BLACK_TRANSPARENT = [
    1,
    0,
    0,
    0,
    1, // Red stays the same
    0,
    1,
    0,
    0,
    1, // Green stays the same
    0,
    0,
    1,
    0,
    1, // Blue stays the same
    30,
    30,
    30,
    0,
    -255
]; // Alpha channel: Reduce alpha if the pixel is dark (near black)];
export const COLORMATRIX_INVERSED_BLACK_TRANSPARENT = [
    -1,
    0,
    0,
    0,
    255, // Red stays the same
    0,
    -1,
    0,
    0,
    255, // Green stays the same
    0,
    0,
    -1,
    0,
    255, // Blue stays the same
    0,
    0,
    0,
    1,
    0
]; // Alpha channel: Reduce alpha if the pixel is dark (near black)];
