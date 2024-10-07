import { themer } from '@nativescript-community/ui-material-core';
import { Application, ApplicationSettings, Color, Frame, Page, Screen, Utils } from '@nativescript/core';
import { getCurrentFontScale } from '@nativescript/core/accessibility/font-scale';
import { get, writable } from 'svelte/store';
import { ColorThemes, getRealTheme, theme } from './helpers/theme';
import { SDK_VERSION, layout } from '@nativescript/core/utils';
import { DEFAULT_COLOR_THEME, SETTINGS_COLOR_THEME } from './utils/constants';
import { start as startThemeHelper, useDynamicColors } from '~/helpers/theme';
import { AppUtilsAndroid } from '@akylas/nativescript-app-utils';

export const colors = writable({
    colorPrimary: '',
    colorOnPrimary: '',
    colorPrimaryContainer: '',
    colorOnPrimaryContainer: '',
    colorSecondary: '',
    colorOnSecondary: '',
    colorSecondaryContainer: '',
    colorOnSecondaryContainer: '',
    colorTertiary: '',
    colorOnTertiary: '',
    colorTertiaryContainer: '',
    colorOnTertiaryContainer: '',
    colorError: '',
    colorOnError: '',
    colorErrorContainer: '',
    colorOnErrorContainer: '',
    colorOutline: '',
    colorOutlineVariant: '',
    colorBackground: '',
    colorOnBackground: '',
    colorSurface: '',
    colorOnSurface: '',
    colorSurfaceVariant: '',
    colorOnSurfaceVariant: '',
    colorOnSurfaceVariant2: '',
    colorSurfaceInverse: '',
    colorOnSurfaceInverse: '',
    colorPrimaryInverse: '',
    colorSurfaceContainer: '',
    colorSurfaceBright: '',
    colorSurfaceDim: '',
    colorSurfaceContainerLow: '',
    colorSurfaceContainerLowest: '',
    colorSurfaceContainerHigh: '',
    colorSurfaceContainerHighest: '',
    colorOnSurfaceDisabled: '',
    popupMenuBackground: ''
});
export const fonts = writable({
    mdi: ''
});
export const windowInset = writable({ top: 0, left: 0, right: 0, bottom: 0 });
export const actionBarButtonHeight = writable(0);
export const actionBarHeight = writable(0);
export const screenHeightDips = Screen.mainScreen.heightDIPs;
export const screenWidthDips = Screen.mainScreen.widthDIPs;
export const screenRatio = screenWidthDips / screenHeightDips;

export const fontScale = writable(1);
export const isRTL = writable(false);

function updateSystemFontScale(value) {
    fontScale.set(value);
}

if (__ANDROID__) {
    Application.android.on(Application.android.activityCreateEvent, (event) => {
        DEV_LOG && console.log('activityCreateEvent', useDynamicColors);
        AppUtilsAndroid.prepareActivity(event.activity, useDynamicColors);
    });
    Page.on('shownModally', function (event) {
        AppUtilsAndroid.prepareWindow(event.object['_dialogFragment'].getDialog().getWindow());
    });
    Frame.on('shownModally', function (event) {
        AppUtilsAndroid.prepareWindow(event.object['_dialogFragment'].getDialog().getWindow());
    });
}
const onInitRootView = function () {
    // we need a timeout to read rootView css variable. not 100% sure why yet
    if (__ANDROID__) {
        // setTimeout(() => {
        const rootView = Application.getRootView();
        if (rootView) {
            AppUtilsAndroid.listenForWindowInsets((inset) => {
                windowInset.set({
                    top: Utils.layout.toDeviceIndependentPixels(inset[0]),
                    bottom: Utils.layout.toDeviceIndependentPixels(Math.max(inset[1], inset[4])),
                    left: Utils.layout.toDeviceIndependentPixels(inset[2]),
                    right: Utils.layout.toDeviceIndependentPixels(inset[3])
                });
            });
        }
        const rootViewStyle = rootView?.style;
        fonts.set({ mdi: rootViewStyle.getCssVariable('--mdiFontFamily') });
        actionBarHeight.set(parseFloat(rootViewStyle.getCssVariable('--actionBarHeight')));
        actionBarButtonHeight.set(parseFloat(rootViewStyle.getCssVariable('--actionBarButtonHeight')));
        const context = Utils.android.getApplicationContext();

        const resources = Utils.android.getApplicationContext().getResources();
        updateSystemFontScale(resources.getConfiguration().fontScale);
        isRTL.set(resources.getConfiguration().getLayoutDirection() === 1);

        // ActionBar
        // resourceId = resources.getIdentifier('status_bar_height', 'dimen', 'android');
        let nActionBarHeight = Utils.layout.toDeviceIndependentPixels(AppUtilsAndroid.getDimensionFromInt(context, 16843499 /* actionBarSize */));
        // let nActionBarHeight = 0;
        // if (resourceId > 0) {
        //     nActionBarHeight = Utils.layout.toDeviceIndependentPixels(resources.getDimensionPixelSize(resourceId));
        // }
        if (nActionBarHeight > 0) {
            actionBarHeight.set(nActionBarHeight);
            rootViewStyle?.setUnscopedCssVariable('--actionBarHeight', nActionBarHeight + '');
        } else {
            nActionBarHeight = parseFloat(rootViewStyle.getCssVariable('--actionBarHeight'));
            actionBarHeight.set(nActionBarHeight);
        }
        const nActionBarButtonHeight = nActionBarHeight - 10;
        actionBarButtonHeight.set(nActionBarButtonHeight);
        rootViewStyle?.setUnscopedCssVariable('--actionBarButtonHeight', nActionBarButtonHeight + '');
        DEV_LOG && console.log('actionBarHeight', nActionBarHeight);
        // }, 0);
    }

    if (__IOS__) {
        const rootView = Application.getRootView();
        const rootViewStyle = rootView?.style;
        fonts.set({ mdi: rootViewStyle.getCssVariable('--mdiFontFamily') });
        // const safeAreaInsets = UIApplication.sharedApplication.keyWindow.safeAreaInsets;
        // const inset = {
        //     left : layout.round(layout.toDevicePixels(safeAreaInsets.left)),
        // 	top : layout.round(layout.toDevicePixels(safeAreaInsets.top)),
        // 	right : layout.round(layout.toDevicePixels(safeAreaInsets.right)),
        // 	bottom: layout.round(layout.toDevicePixels(safeAreaInsets.bottom))
        // }
        // DEV_LOG && console.log('rootView.getSafeAreaInsets()', inset);
        // windowInset.set(inset);

        const currentColors = get(colors);
        Object.keys(currentColors).forEach((c) => {
            currentColors[c] = rootViewStyle.getCssVariable('--' + c);
        });
        colors.set(currentColors);
        updateSystemFontScale(getCurrentFontScale());
        Application.on(Application.fontScaleChangedEvent, (event) => updateSystemFontScale(event.newValue));
        actionBarHeight.set(parseFloat(rootViewStyle.getCssVariable('--actionBarHeight')));
        actionBarButtonHeight.set(parseFloat(rootViewStyle.getCssVariable('--actionBarButtonHeight')));
    }
    startThemeHelper();
    // updateThemeColors(getRealTheme(theme));
    // DEV_LOG && console.log('initRootView', get(navigationBarHeight), get(statusBarHeight), get(actionBarHeight), get(actionBarButtonHeight), get(fonts));
    Application.off(Application.initRootViewEvent, onInitRootView);
    // getRealThemeAndUpdateColors();
};
Application.on(Application.initRootViewEvent, onInitRootView);
if (__ANDROID__) {
    Application.android.on(Application.android.activityStartedEvent, () => {
        const resources = Utils.android.getApplicationContext().getResources();
        isRTL.set(resources.getConfiguration().getLayoutDirection() === 1);
    });
}

export function updateThemeColors(theme: string, colorTheme: ColorThemes = ApplicationSettings.getString(SETTINGS_COLOR_THEME, DEFAULT_COLOR_THEME) as ColorThemes) {
    try {
        DEV_LOG && console.log('updateThemeColors', theme);
        const currentColors = get(colors);
        let rootView = Application.getRootView();
        if (rootView?.parent) {
            rootView = rootView.parent as any;
        }
        const rootViewStyle = rootView?.style;
        if (!rootViewStyle) {
            return;
        }
        // rootViewStyle?.setUnscopedCssVariable('--fontScale', fontScale + '');
        if (__ANDROID__) {
            const activity = Application.android.startActivity;
            // we also update system font scale so that our UI updates correcly
            fontScale.set(Utils.android.getApplicationContext().getResources().getConfiguration().fontScale);
            Object.keys(currentColors).forEach((c) => {
                if (c.endsWith('Disabled')) {
                    return;
                }
                if (c === 'colorBackground') {
                    currentColors.colorBackground = new Color(AppUtilsAndroid.getColorFromInt(activity, 16842801)).hex;
                } else if (c === 'popupMenuBackground') {
                    currentColors.popupMenuBackground = new Color(AppUtilsAndroid.getColorFromInt(activity, 16843126)).hex;
                } else {
                    currentColors[c] = new Color(AppUtilsAndroid.getColorFromName(activity, c)).hex;
                }
            });
        } else {
            const themeColors = require(`~/themes/${colorTheme}.json`);
            // TODO: define all color themes for iOS
            if (theme === 'dark' || theme === 'black') {
                Object.assign(currentColors, themeColors.dark);
            } else {
                Object.assign(currentColors, themeColors.light);
            }
            // DEV_LOG && console.log('updateThemeColors', theme, colorTheme, JSON.stringify(currentColors));

            themer.setPrimaryColor(currentColors.colorPrimary);
            themer.setOnPrimaryColor(currentColors.colorOnPrimary);
            themer.setAccentColor(currentColors.colorPrimary);
            themer.setSecondaryColor(currentColors.colorSecondary);
            themer.setSurfaceColor(currentColors.colorSurface);
            themer.setOnSurfaceColor(currentColors.colorOnSurface);
        }
        if (theme === 'black') {
            currentColors.colorBackground = '#000000';
        }

        if (theme === 'dark') {
            currentColors.colorSurfaceContainerHigh = new Color(currentColors.colorSurfaceContainer).lighten(10).hex;
            currentColors.colorSurfaceContainerHighest = new Color(currentColors.colorSurfaceContainer).lighten(20).hex;
        } else {
            currentColors.colorSurfaceContainerHigh = new Color(currentColors.colorSurfaceContainer).darken(10).hex;
            currentColors.colorSurfaceContainerHighest = new Color(currentColors.colorSurfaceContainer).darken(20).hex;
        }
        currentColors.colorOnSurfaceVariant2 = new Color(currentColors.colorOnSurfaceVariant).setAlpha(170).hex;
        currentColors.colorOnSurfaceDisabled = new Color(currentColors.colorOnSurface).setAlpha(50).hex;
        Object.keys(currentColors).forEach((c) => {
            // DEV_LOG && console.log(c, currentColors[c]);
            rootViewStyle?.setUnscopedCssVariable('--' + c, currentColors[c]);
        });
        colors.set(currentColors);
        Application.notify({ eventName: 'colorsChange', colors: currentColors });
        DEV_LOG && console.log('changed colors', theme, rootView, [...rootView?.cssClasses], theme, JSON.stringify(currentColors));
        rootView?._onCssStateChange();
        const rootModalViews = rootView?._getRootModalViews();
        rootModalViews.forEach((rootModalView) => rootModalView._onCssStateChange());
    } catch (error) {
        console.error(error, error.stack);
    }
}
