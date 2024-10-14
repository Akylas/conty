import { lc } from '@nativescript-community/l';
import { closeBottomSheet, showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
import { MDCAlertControlerOptions, alert } from '@nativescript-community/ui-material-dialogs';
import { HorizontalPosition, PopoverOptions, VerticalPosition } from '@nativescript-community/ui-popover';
import { closePopover, showPopover } from '@nativescript-community/ui-popover/svelte';
import { AlertOptions, Animation, AnimationDefinition, Application, GridLayout, ModalTransition, Screen, SharedTransition, SharedTransitionConfig, Utils, View } from '@nativescript/core';
import { debounce } from '@nativescript/core/utils';
import { showError } from '@shared/utils/showError';
import { navigate, showModal } from '@shared/utils/svelte/ui';
import { ComponentInstanceInfo, hideLoading, resolveComponentElement } from '@shared/utils/ui';
import { ComponentProps } from 'svelte';
import { get } from 'svelte/store';
import type BarAudioPlayer__SvelteComponent_ from '~/components/BarAudioPlayerWidget.svelte';
import BarAudioPlayer from '~/components/BarAudioPlayerWidget.svelte';
import type BottomSnack__SvelteComponent_ from '~/components/common/BottomSnack.svelte';
import BottomSnack from '~/components/common/BottomSnack.svelte';
import type OptionSelect__SvelteComponent_ from '~/components/common/OptionSelect.svelte';
import { Pack, Story } from '~/models/Pack';
import { getBGServiceInstance } from '~/services/BgService';
import { colors, fontScale, screenWidthDips, windowInset } from '~/variables';
import { BAR_AUDIO_PLAYER_HEIGHT } from '../constants';

export * from '@shared/utils/ui';

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
    try {
        const result = await showBottomSheet({
            view: component as any,
            props: {
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
            elevation: __ANDROID__ ? 3 : 0,
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

export async function showSettings(props?) {
    const Settings = (await import('~/components/settings/Settings.svelte')).default;
    navigate({
        page: Settings,
        props
    });
}

const animationDuration = 100;
function sendAnimationEvent(animationArgs) {
    let offset = 0;
    if (snackMessageVisible) {
        offset += 55;
    }
    if (barPlayerVisible) {
        offset += BAR_AUDIO_PLAYER_HEIGHT;
    }
    // if (offset !== 0) {
    //     offset += get(windowInset).bottom;
    // }
    Application.notify({ eventName: 'bottomOffsetAnimation', animationArgs, offset });
}

export interface ShowSnackMessageOptions {
    text: string;
    progress?: number;
    translateY?: number;
}
let snackMessage: ComponentInstanceInfo<GridLayout, BottomSnack__SvelteComponent_>;
let snackMessageVisible = false;
function getSnackMessage(props?) {
    if (!snackMessage) {
        try {
            snackMessage = resolveComponentElement(BottomSnack, props || {}) as ComponentInstanceInfo<GridLayout, BottomSnack__SvelteComponent_>;
            (Application.getRootView() as GridLayout).addChild(snackMessage.element.nativeView);
        } catch (error) {
            console.error(error, error.stack);
        }
    }
    return snackMessage;
}
export function updateSnackMessage(msg: Partial<ShowSnackMessageOptions>) {
    if (snackMessage) {
        const snackMessage = getSnackMessage();
        const props = Object.assign(
            {
                progress: snackMessage.viewInstance.progress,
                text: snackMessage.viewInstance.text
            },
            msg
        );
        snackMessage.viewInstance.$set(props);
    }
}

async function animateSnackMessage(y: number, update = true) {
    const animationArgs = [
        {
            target: snackMessage.element.nativeView,
            translate: { x: 0, y },
            duration: animationDuration
        }
    ];
    sendAnimationEvent(animationArgs);
    await new Animation(animationArgs).play();
    if (update) {
        updateSnackMessage({ translateY: y });
    }
}
export async function showSnackMessage(props: ShowSnackMessageOptions) {
    // DEV_LOG && console.log('showSnackMessage', JSON.stringify(props));
    if (snackMessage) {
        updateSnackMessage(props);
    } else {
        getSnackMessage(props);

        snackMessageVisible = true;
        await animateSnackMessage(barPlayerVisible ? -(BAR_AUDIO_PLAYER_HEIGHT + 10) : 0);
    }
}
export async function hideSnackMessage() {
    if (snackMessage) {
        snackMessageVisible = false;
        await animateSnackMessage(100, false);
        (Application.getRootView() as GridLayout).removeChild(snackMessage.element.nativeView);
        snackMessage.element.nativeElement._tearDownUI();
        snackMessage.viewInstance.$destroy();
        snackMessage = null;
    }
}

export type BarPlayerOptions = object;
let barPlayer: ComponentInstanceInfo<GridLayout, BarAudioPlayer__SvelteComponent_>;
let barPlayerVisible = false;
function getAudioPlayer(props?: BarPlayerOptions) {
    if (!barPlayer) {
        try {
            barPlayer = resolveComponentElement(BarAudioPlayer, props || {}) as ComponentInstanceInfo<GridLayout, BarAudioPlayer__SvelteComponent_>;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            (Application.getRootView().getViewById('inner-frame-holder') as GridLayout).addChild(barPlayer.element.nativeView);
        } catch (error) {
            console.error(error, error.stack);
        }
    }
    return barPlayer;
}
export async function showBarPlayer(props?: BarPlayerOptions) {
    // DEV_LOG && console.log('showSnackMessage', JSON.stringify(props));
    if (barPlayerVisible) {
        // updateSnackMessage(props);
    } else {
        const barPlayer = getAudioPlayer(props);
        DEV_LOG && console.log('showBarPlayer1', snackMessageVisible);
        const animationArgs = [
            {
                target: barPlayer.element.nativeView,
                translate: { x: 0, y: 0 },
                duration: animationDuration
            }
        ];
        barPlayerVisible = true;
        sendAnimationEvent(animationArgs);
        DEV_LOG && console.log('showBarPlayer', snackMessageVisible);
        if (snackMessageVisible) {
            await Promise.all([new Animation(animationArgs).play(), animateSnackMessage(-(BAR_AUDIO_PLAYER_HEIGHT + 10))]);
        } else {
            await new Animation(animationArgs).play();
        }
        updateAudioPlayer({ translateY: 0, ...props });
    }
}
export async function hideBarPlayer() {
    if (barPlayerVisible) {
        const animationArgs: AnimationDefinition[] = [
            {
                target: barPlayer.element.nativeView,
                translate: { x: 0, y: BAR_AUDIO_PLAYER_HEIGHT + (__IOS__ ? 50 : 5) + get(windowInset).bottom },
                duration: animationDuration
            }
        ];
        barPlayerVisible = false;
        sendAnimationEvent(animationArgs);
        if (snackMessageVisible) {
            await Promise.all([new Animation(animationArgs).play(), animateSnackMessage(0)]);
        } else {
            await new Animation(animationArgs).play();
        }
        // (Application.getRootView() as GridLayout).removeChild(barPlayer.element.nativeView);
        // barPlayer.element.nativeElement._tearDownUI();
        // barPlayer.viewInstance.$destroy();
        // barPlayer = null;
    }
}
export function updateAudioPlayer(props: Partial<BarPlayerOptions>) {
    if (barPlayer) {
        DEV_LOG && console.log('updateAudioPlayer', props);
        barPlayer.viewInstance.$set(props);
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
    DEV_LOG && console.log('showFullscreenPlayer');
    // if (__IOS__) {
    showModal({
        page: component,
        fullscreen: true,
        ios: __IOS__
            ? {
                  transition: SharedTransition.custom(new ModalTransition(), config)
              }
            : undefined,
        android: __ANDROID__
            ? {
                  style: Utils.android.resources.getId(':style/' + 'DialogAnimation')
              }
            : undefined
    } as any);
    // } else {
    //     navigate({
    //         page: component,
    //         transition: SharedTransition.custom(new PageTransition(), config)
    //     });
    // }
    // navigate({
    //     page: component,
    //     transition: { name: 'fade' }
    // });
}

export async function playPack(pack: Pack, showFullscreen = true) {
    const storyHandler = getBGServiceInstance().storyHandler;
    await storyHandler.playPack(pack);
    if (showFullscreen && storyHandler.playingPack) {
        showFullscreenPlayer();
    }
}

export async function playStory(story: Story, showFullscreen = true, updatePlaylist = true) {
    const storyHandler = getBGServiceInstance().storyHandler;
    await storyHandler.playStory(story, updatePlaylist);
    if (showFullscreen && storyHandler.playingStory) {
        showFullscreenPlayer();
    }
}
