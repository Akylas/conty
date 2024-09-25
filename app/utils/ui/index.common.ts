import { InAppBrowser } from '@akylas/nativescript-inappbrowser';
import { lc } from '@nativescript-community/l';
import { AlertDialog, MDCAlertControlerOptions, alert } from '@nativescript-community/ui-material-dialogs';
import { SnackBarOptions, showSnack as mdShowSnack } from '@nativescript-community/ui-material-snackbar';
import { HorizontalPosition, PopoverOptions, VerticalPosition } from '@nativescript-community/ui-popover';
import { closePopover, showPopover } from '@nativescript-community/ui-popover/svelte';
import {
    AlertOptions,
    Animation,
    AnimationDefinition,
    Application,
    GridLayout,
    ModalTransition,
    PageTransition,
    Screen,
    SharedTransition,
    SharedTransitionConfig,
    Utils,
    View,
    ViewBase
} from '@nativescript/core';
import { debounce } from '@nativescript/core/utils';
import { ComponentProps } from 'svelte';
import { NativeViewElementNode, ShowModalOptions, createElement } from 'svelte-native/dom';
import { get } from 'svelte/store';
import type BottomSnack__SvelteComponent_ from '~/components/common/BottomSnack.svelte';
import type LoadingIndicator__SvelteComponent_ from '~/components/common/LoadingIndicator.svelte';
import LoadingIndicator from '~/components/common/LoadingIndicator.svelte';
import type OptionSelect__SvelteComponent_ from '~/components/common/OptionSelect.svelte';
import { colors, fontScale, screenWidthDips } from '~/variables';
import { navigate, showModal } from '../svelte/ui';
import { showError } from '../showError';
import BottomSnack from '~/components/common/BottomSnack.svelte';
import { getBGServiceInstance } from '~/services/BgService';
import { Pack } from '~/models/Pack';
import { closeBottomSheet, showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';

export function timeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openLink(url) {
    try {
        const { colorPrimary } = get(colors);
        const available = await InAppBrowser.isAvailable();
        if (available) {
            const result = await InAppBrowser.open(url, {
                // iOS Properties
                dismissButtonStyle: 'close',
                preferredBarTintColor: colorPrimary,
                preferredControlTintColor: 'white',
                readerMode: false,
                animated: true,
                enableBarCollapsing: false,
                // Android Properties
                showTitle: true,
                toolbarColor: colorPrimary,
                secondaryToolbarColor: 'white',
                enableUrlBarHiding: true,
                enableDefaultShare: true,
                forceCloseOnRedirection: false
            });
            return result;
        } else {
            Utils.openUrl(url);
        }
    } catch (error) {
        alert({
            title: 'Error',
            message: error.message,
            okButtonText: 'Ok'
        });
    }
}

export interface ShowLoadingOptions {
    title?: string;
    text: string;
    progress?: number;
    onButtonTap?: () => void;
}

let loadingIndicator: AlertDialog & { instance?: LoadingIndicator__SvelteComponent_ };
let showLoadingStartTime: number = null;
function getLoadingIndicator() {
    if (!loadingIndicator) {
        const componentInstanceInfo = resolveComponentElement(LoadingIndicator, {});
        const view: View = componentInstanceInfo.element.nativeView;
        // const stack = new StackLayout()
        loadingIndicator = new AlertDialog({
            view,
            cancelable: false
        });
        loadingIndicator.instance = componentInstanceInfo.viewInstance as LoadingIndicator__SvelteComponent_;
    }
    return loadingIndicator;
}
export function updateLoadingProgress(msg: Partial<ShowLoadingOptions>) {
    if (showingLoading()) {
        const loadingIndicator = getLoadingIndicator();
        const props = {
            progress: msg.progress
        };
        if (msg.text) {
            props['text'] = msg.text;
        }
        loadingIndicator.instance.$set(props);
    }
}
export async function showLoading(msg?: string | ShowLoadingOptions) {
    try {
        const text = (msg as any)?.text || (typeof msg === 'string' && msg) || lc('loading');
        const indicator = getLoadingIndicator();
        indicator.instance.onButtonTap = msg?.['onButtonTap'];
        const props = {
            showButton: !!msg?.['onButtonTap'],
            text,
            title: (msg as any)?.title,
            progress: null
        };
        if (msg && typeof msg !== 'string' && msg?.hasOwnProperty('progress')) {
            props.progress = msg.progress;
        } else {
            props.progress = null;
        }
        indicator.instance.$set(props);
        if (showLoadingStartTime === null) {
            showLoadingStartTime = Date.now();
            indicator.show();
        }
    } catch (error) {
        showError(error, { silent: true });
    }
}
export function showingLoading() {
    return showLoadingStartTime !== null;
}
export async function hideLoading() {
    if (!loadingIndicator) {
        return;
    }
    const delta = showLoadingStartTime ? Date.now() - showLoadingStartTime : -1;
    if (__IOS__ && delta >= 0 && delta < 1000) {
        await timeout(1000 - delta);
        // setTimeout(() => hideLoading(), 1000 - delta);
        // return;
    }
    showLoadingStartTime = null;
    if (loadingIndicator) {
        loadingIndicator.hide();
    }
}

export interface ComponentInstanceInfo<T extends ViewBase = View, U = SvelteComponent> {
    element: NativeViewElementNode<T>;
    viewInstance: U;
}
export function resolveComponentElement<T>(viewSpec: typeof SvelteComponent<T>, props?: T): ComponentInstanceInfo {
    const dummy = createElement('fragment', window.document as any);
    const viewInstance = new viewSpec({ target: dummy, props });
    const element = dummy.firstElement() as NativeViewElementNode<View>;
    return { element, viewInstance };
}
export async function showAlertOptionSelect<T>(props?: ComponentProps<OptionSelect__SvelteComponent_>, options?: Partial<AlertOptions & MDCAlertControlerOptions>) {
    const component = (await import('~/components/common/OptionSelect.svelte')).default;
    let componentInstanceInfo: ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
    try {
        componentInstanceInfo = resolveComponentElement(component, {
            onClose: (result) => {
                view.bindingContext.closeCallback(result);
            },
            onCheckBox(item, value, e) {
                view.bindingContext.closeCallback(item);
            },
            trackingScrollView: 'collectionView',
            ...props
        }) as ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
        const view: View = componentInstanceInfo.element.nativeView;
        const result = await alert({
            view,
            okButtonText: lc('cancel'),
            ...(options ? options : {})
        });
        return result;
    } catch (err) {
        throw err;
    } finally {
        componentInstanceInfo.element.nativeElement._tearDownUI();
        componentInstanceInfo.viewInstance.$destroy();
        componentInstanceInfo = null;
    }
}

export async function showBottomsheetOptionSelect<T>(props?: ComponentProps<OptionSelect__SvelteComponent_>, options?: Partial<AlertOptions & MDCAlertControlerOptions>) {
    const component = (await import('~/components/common/OptionSelect.svelte')).default;
    // let componentInstanceInfo: ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
    try {
        // componentInstanceInfo = resolveComponentElement(component, {
        //     onClose: (result) => {
        //         view.bindingContext.closeCallback(result);
        //     },
        //     onCheckBox(item, value, e) {
        //         view.bindingContext.closeCallback(item);
        //     },
        //     trackingScrollView: 'collectionView',
        //     ...props
        // }) as ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
        // const view: View = componentInstanceInfo.element.nativeView;
        const result = await showBottomSheet({
            view: component as any,
            props: {
                // onClose(result) {
                //     this.bindingContext.closeCallback(result);
                // },
                onCheckBox(item, value, e) {
                    closeBottomSheet(item);
                },
                trackingScrollView: 'collectionView',
                ...props
            },
            ...(options ? options : {})
        });
        return result;
    } catch (err) {
        throw err;
    } finally {
        // componentInstanceInfo.element.nativeElement._tearDownUI();
        // componentInstanceInfo.viewInstance.$destroy();
        // componentInstanceInfo = null;
    }
}

export async function showPopoverMenu<T = any>({
    options,
    anchor,
    onClose,
    onLongPress,
    props,
    horizPos,
    vertPos,
    closeOnClose = true
}: { options; anchor; onClose?; onLongPress?; props?; closeOnClose? } & Partial<PopoverOptions>) {
    const { colorSurfaceContainer } = get(colors);
    const OptionSelect = (await import('~/components/common/OptionSelect.svelte')).default;
    const rowHeight = (props?.rowHeight || 60) * get(fontScale);
    const result: T = await showPopover({
        backgroundColor: colorSurfaceContainer,
        view: OptionSelect,
        anchor,
        horizPos: horizPos ?? HorizontalPosition.ALIGN_LEFT,
        vertPos: vertPos ?? VerticalPosition.CENTER,
        props: {
            borderRadius: 10,
            elevation: 3,
            margin: 4,
            fontWeight: 500,
            backgroundColor: colorSurfaceContainer,
            containerColumns: 'auto',
            rowHeight: !!props?.autoSizeListItem ? null : rowHeight,
            height: Math.min(rowHeight * options.length, props?.maxHeight ?? 300),
            width: 200 * get(fontScale),
            options,
            onLongPress,
            onClose: async (item) => {
                if (closeOnClose) {
                    if (__IOS__) {
                        // on iOS we need to wait or if onClose shows an alert dialog it wont work
                        await closePopover();
                    } else {
                        closePopover();
                    }
                }
                try {
                    await onClose?.(item);
                } catch (error) {
                    showError(error);
                } finally {
                    hideLoading();
                }
            },
            ...(props || {})
        }
    });
    return result;
}

export function createView<T extends View>(claz: new () => T, props: Partial<Pick<T, keyof T>> = {}, events?) {
    const view: T = new claz();
    Object.assign(view, props);
    if (events) {
        Object.keys(events).forEach((k) => view.on(k, events[k]));
    }
    return view;
}
export async function showSliderPopover({
    debounceDuration = 100,
    min = 0,
    max = 100,
    step = 1,
    horizPos = HorizontalPosition.ALIGN_LEFT,
    anchor,
    vertPos = VerticalPosition.CENTER,
    width = 0.8 * screenWidthDips,
    value,
    onChange,
    title,
    icon,
    valueFormatter,
    formatter
}: {
    title?;
    debounceDuration?;
    icon?;
    min?;
    max?;
    step?;
    formatter?;
    valueFormatter?;
    horizPos?;
    anchor;
    vertPos?;
    width?;
    value?;
    onChange?;
}) {
    const component = (await import('~/components/common/SliderPopover.svelte')).default;
    const { colorSurfaceContainer } = get(colors);

    return showPopover({
        backgroundColor: colorSurfaceContainer,
        view: component,
        anchor,
        horizPos,
        vertPos,
        props: {
            title,
            icon,
            min,
            max,
            step,
            width,
            formatter,
            valueFormatter,
            value,
            onChange: debounceDuration ? debounce(onChange, debounceDuration) : onChange
        }

        // trackingScrollView: 'collectionView'
    });
}
export async function showSnack(options: SnackBarOptions) {
    try {
        return mdShowSnack(options);
    } catch (error) {}
}

export async function showSettings(props?) {
    const Settings = (await import('~/components/settings/Settings.svelte')).default;
    navigate({
        page: Settings,
        props
    });
}

export interface ShowSnackMessageOptions {
    text: string;
    progress?: number;
    translateY?: number;
}
let snackMessage: ComponentInstanceInfo<GridLayout, BottomSnack__SvelteComponent_>;
function getSnackMessage(props?) {
    if (!snackMessage) {
        snackMessage = resolveComponentElement(BottomSnack, props || {}) as ComponentInstanceInfo<GridLayout, BottomSnack__SvelteComponent_>;
        try {
            (Application.getRootView() as GridLayout).addChild(snackMessage.element.nativeView);
        } catch (error) {
            console.error(error, error.stack);
        }
        DEV_LOG && console.log('snackMessage', snackMessage);
    }
    return snackMessage;
}
export function updateSnackMessage(msg: Partial<ShowSnackMessageOptions>) {
    if (snackMessage) {
        const snackMessage = getSnackMessage();
        const props = {
            progress: msg.progress
        };
        if (msg.text) {
            props['text'] = msg.text;
        }
        snackMessage.viewInstance.$set(props);
    }
}
export async function showSnackMessage(props: ShowSnackMessageOptions) {
    if (snackMessage) {
        updateSnackMessage(props);
    } else {
        const snackMessage = getSnackMessage(props);
        const animationArgs = [
            {
                target: snackMessage.element.nativeView,
                translate: { x: 0, y: 0 },
                duration: 100
            }
        ];
        Application.notify({ eventName: 'snackMessageAnimation', animationArgs });
        await new Animation(animationArgs).play();
        updateSnackMessage({ translateY: 0 });
    }
}
export async function hideSnackMessage() {
    if (snackMessage) {
        const animationArgs: AnimationDefinition[] = [
            {
                target: snackMessage.element.nativeView,
                translate: { x: 0, y: 100 },
                duration: 100
            }
        ];
        Application.notify({ eventName: 'snackMessageAnimation', animationArgs });
        await new Animation(animationArgs).play();
        (Application.getRootView() as GridLayout).removeChild(snackMessage.element.nativeView);
        snackMessage.element.nativeElement._tearDownUI();
        snackMessage.viewInstance.$destroy();
        snackMessage = null;
    }
}

export async function showFullscreenPlayer() {
    const config: SharedTransitionConfig = {
        interactive: {
            dismiss: {
                finishThreshold: 0.5
            }
        },
        pageStart: {
            opacity: 1,
            x: 0,
            // good practice to use heightPixels on Android
            // whereas on iOS, good to use heightDIPs (rely on defaults here)
            y: __ANDROID__ ? Screen.mainScreen.heightPixels : null
        },
        pageEnd: {
            duration: 300,
            spring: { tension: 70, friction: 9, mass: 1 }
        },
        pageReturn: {
            duration: 300,
            opacity: 1,
            spring: { tension: 70, friction: 9, mass: 2 }
        }
    };
    const component = (await import('~/components/FullscreenPlayer.svelte')).default;
    DEV_LOG && console.log('showFullscreenPlayer', config);
    if (__IOS__) {
        showModal({
            page: component,
            fullscreen: true,
            transition: SharedTransition.custom(new ModalTransition(), config)
        } as any);
    } else {
        navigate({
            page: component,
            transition: SharedTransition.custom(new PageTransition(), config)
        });
    }
    // navigate({
    //     page: component,
    //     transition: { name: 'fade' }
    // });
}

export async function playPack(pack: Pack, showFullscreen = true) {
    await getBGServiceInstance().storyHandler.playPack(pack);
    if (showFullscreen) {
        showFullscreenPlayer();
    }
}
