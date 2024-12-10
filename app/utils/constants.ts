import { Screen } from '@nativescript/core';
import { createColorMatrix } from './index.common';
import { SDK_VERSION } from '@nativescript/core/utils';

export const CARD_RATIO = 0.629;

export const ALERT_OPTION_MAX_HEIGHT = Screen.mainScreen.heightDIPs * 0.47;
export const ANDROID_CONTENT = 'content://';
export const DEFAULT_INVERSE_IMAGES = false;
export const DEFAULT_SHOW_SHUTDOWN_IN_NOTIF = false;

export const SETTINGS_LANGUAGE = 'language';
export const SETTINGS_REMOTE_SOURCES = 'remote_sources';
export const SETTINGS_COLOR_THEME = 'color_theme';
export const SETTINGS_INVERSE_IMAGES = 'inverse_images';
export const SETTINGS_PODCAST_MODE = 'podcast_mode';
export const SETTINGS_CURRENT_PLAYING = 'current_playing';
export const SETTINGS_SHOW_SHUTDOWN_IN_NOTIF = 'shutdown_notif_button';
export const SETTINGS_DRAW_FOLDERS_BACKGROUND = 'draw_folder_background';

export const DEFAULT_LOCALE = 'auto';
export const DEFAULT_COLOR_THEME = 'default';
export const DEFAULT_PODCAST_MODE = false;
export const DEFAULT_DRAW_FOLDERS_BACKGROUND = false;

export const EVENT_PACK_ADDED = 'packAdded';
export const EVENT_PACK_UPDATED = 'packUpdated';
export const EVENT_PACK_DELETED = 'packDeleted';
export const EVENT_IMPORT_STATE = 'importState';
export const EVENT_STATE = 'state';
export const EVENT_PACK_MOVED_FOLDER = 'packMovedFolder';
export const EVENT_FOLDER_UPDATED = 'folderUpdated';

export const BOTTOM_BUTTON_OFFSET = 100;
export const BAR_AUDIO_PLAYER_HEIGHT = 79;

const COLOR_MATRIX_FACTOR = __IOS__ ? 1 : 255;
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
    -COLOR_MATRIX_FACTOR
]; // Alpha channel: Reduce alpha if the pixel is dark (near black)];
export const COLORMATRIX_INVERSED_BLACK_TRANSPARENT = [
    -1,
    0,
    0,
    0,
    COLOR_MATRIX_FACTOR, // Red stays the same
    0,
    -1,
    0,
    0,
    COLOR_MATRIX_FACTOR, // Green stays the same
    0,
    0,
    -1,
    0,
    COLOR_MATRIX_FACTOR, // Blue stays the same
    0,
    0,
    0,
    1,
    0
]; // Alpha channel: Reduce alpha if the pixel is dark (near black)];
