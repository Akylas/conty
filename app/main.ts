// (com as any).tns.Runtime.getCurrentRuntime().enableVerboseLogging();
import { GestureRootView, install as installGestures } from '@nativescript-community/gesturehandler';
import { lc } from '@nativescript-community/l';
import { installMixins as installUIMixins } from '@nativescript-community/systemui';
import { overrideSpanAndFormattedString } from '@nativescript-community/text';
import SwipeMenuElement from '@nativescript-community/ui-collectionview-swipemenu/svelte';
import CollectionViewElement from '@nativescript-community/ui-collectionview/svelte';
import { initialize } from '@nativescript-community/ui-image';
import { install as installBottomSheets } from '@nativescript-community/ui-material-bottomsheet';
import { installMixins, themer } from '@nativescript-community/ui-material-core';
import PagerElement from '@nativescript-community/ui-pager/svelte';
import { installMixins as installColorFilters } from '@nativescript-community/ui-image-colorfilter';
import { Application } from '@nativescript/core';
import { Frame, NavigatedData, Page } from '@nativescript/core/ui';
import { FrameElement, PageElement, createElement, registerElement, registerNativeViewElement } from 'svelte-native/dom';
import { start as startThemeHelper } from '~/helpers/theme';
import { getBGServiceInstance } from '~/services/BgService';
import { startSentry } from '~/utils/sentry';
import PacksList from './components/PacksList.svelte';
import { setDocumentsService } from './models/Pack';
import { NestedScrollView } from './NestedScrollView';
import { networkService } from './services/api';
import { createSharedDocumentsService, documentsService } from './services/documents';
import { showError } from './utils/showError';
import { navigate } from './utils/svelte/ui';
import { importService } from './services/importservice';
import { time } from '@nativescript/core/profiling';
// import './app.scss';
declare module '@nativescript/core/application/application-common' {
    interface ApplicationCommon {
        servicesStarted: boolean;
    }
}
try {
    createSharedDocumentsService();
    startSentry();
    installGestures(true);
    installMixins();
    installBottomSheets();
    installUIMixins();
    installColorFilters();
    overrideSpanAndFormattedString();
    initialize({ isDownsampleEnabled: true });

    registerNativeViewElement('absolutelayout', () => require('@nativescript/core').AbsoluteLayout);
    registerElement('frame', () => new FrameElement());
    registerElement('page', () => new PageElement());
    registerNativeViewElement('gridlayout', () => require('@nativescript/core').GridLayout);
    registerNativeViewElement('scrollview', () => NestedScrollView);
    registerNativeViewElement('stacklayout', () => require('@nativescript/core').StackLayout);
    registerNativeViewElement('wraplayout', () => require('@nativescript/core').WrapLayout);
    registerNativeViewElement('image', () => require('@nativescript-community/ui-image').Img);
    registerNativeViewElement('flexlayout', () => require('@nativescript/core').FlexboxLayout);
    // registerNativeViewElement('textfield', () => require('@nativescript/core').TextField);
    // registerNativeViewElement('image', () => require('@nativescript/core').Image);
    registerNativeViewElement('span', () => require('@nativescript/core').Span);
    registerNativeViewElement('button', () => require('@nativescript/core').Button);
    registerNativeViewElement('nimage', () => require('@nativescript/core').Image);

    registerNativeViewElement('mdbutton', () => require('@nativescript-community/ui-material-button').Button, null, {}, { override: true });
    registerNativeViewElement('label', () => require('@nativescript-community/ui-label').Label, null, {}, { override: true });
    registerNativeViewElement('mdactivityindicator', () => require('@nativescript-community/ui-material-activityindicator').ActivityIndicator);
    registerNativeViewElement('mdprogress', () => require('@nativescript-community/ui-material-progress').Progress);
    registerNativeViewElement('mdcardview', () => require('@nativescript-community/ui-material-cardview').CardView);
    registerNativeViewElement('slider', () => require('@nativescript-community/ui-material-slider').Slider, null, {}, { override: true });
    registerNativeViewElement('switch', () => require('@nativescript-community/ui-material-switch').Switch, null, {}, { override: true });
    registerNativeViewElement('textfield', () => require('@nativescript-community/ui-material-textfield').TextField, null, {}, { override: true });
    registerNativeViewElement('textview', () => require('@nativescript-community/ui-material-textview').TextView, null, {}, { override: true });
    registerNativeViewElement('canvasview', () => require('@nativescript-community/ui-canvas').CanvasView);
    registerNativeViewElement('canvaslabel', () => require('@nativescript-community/ui-canvaslabel').CanvasLabel);
    registerNativeViewElement('cspan', () => require('@nativescript-community/ui-canvaslabel').Span);
    registerNativeViewElement('cgroup', () => require('@nativescript-community/ui-canvaslabel').Group);
    // registerNativeViewElement('svgview', () => require('@nativescript-community/ui-svg').SVGView);
    // registerNativeViewElement('svg', () => require('@nativescript-community/ui-svg').SVG);
    registerNativeViewElement('bottomsheet', () => require('@nativescript-community/ui-persistent-bottomsheet').PersistentBottomSheet);
    registerNativeViewElement('gesturerootview', () => require('@nativescript-community/gesturehandler').GestureRootView);
    registerNativeViewElement('awebview', () => require('@nativescript-community/ui-webview').AWebView);
    registerNativeViewElement('checkbox', () => require('@nativescript-community/ui-checkbox').CheckBox);
    CollectionViewElement.register();
    SwipeMenuElement.register();
    PagerElement.register();
    // DrawerElement.register();

    // Trace.addCategories(Trace.categories.NativeLifecycle);
    // Trace.addCategories(Trace.categories.Transition);
    // Trace.addCategories(Trace.categories.Animation);
    // Trace.addCategories(ChartTraceCategory);
    // Trace.enable();

    themer.createShape('round', {
        cornerFamily: 'rounded' as any,
        cornerSize: {
            value: 0.5,
            unit: '%'
        }
    });
    themer.createShape('medium', {
        cornerFamily: 'rounded' as any,
        cornerSize: 16
    });
    themer.createShape('small', {
        cornerFamily: 'rounded' as any,
        cornerSize: 12
    });

    themer.createShape('none', {
        cornerFamily: 'rounded' as any,
        cornerSize: 0
    });

    // we need to instantiate it to "start" it
    const bgService = getBGServiceInstance();
    let launched = false;
    async function start() {
        try {
            Application.servicesStarted = false;
            DEV_LOG && console.log('start');
            setDocumentsService(documentsService);
            await Promise.all([networkService.start(), bgService.start(), documentsService.start()]);
            Application.servicesStarted = true;
            DEV_LOG && console.log('servicesStarted');
            Application.notify({ eventName: 'servicesStarted' });
            try {
                await importService.updateContentFromDataFolder();
            } catch (error) {
                console.error('start import from data error', error, error.stack);
            }
        } catch (error) {
            showError(error, { forcedMessage: lc('startup_error') });
        }
    }
    Application.on(Application.launchEvent, async () => {
        DEV_LOG && console.log('launch');
        startThemeHelper();
        launched = true;
        start();
    });
    Application.on(Application.resumeEvent, () => {
        if (!launched) {
            // DEV_LOG && console.log('resume');
            launched = true;
            start();
        }
    });
    Application.on(Application.exitEvent, async () => {
        DEV_LOG && console.log('exit');
        launched = false;
        //  ocrService.stop();
        try {
            // wait for sync to stop to stop documentService as their could be writes to the db
            await importService.stop();
            documentsService.stop();
            bgService.handleAppExit();
        } catch (error) {
            console.error(error, error.stack);
        }
    });

    if (!PRODUCTION && DEV_LOG) {
        Page.on('navigatingTo', (event: NavigatedData) => {
            DEV_LOG && console.info('NAVIGATION', 'to', event.object, event.isBackNavigation);
        });
        Page.on('showingModally', (event: NavigatedData) => {
            DEV_LOG && console.info('NAVIGATION', 'MODAL', event.object, event.isBackNavigation);
        });
        Frame.on('showingModally', (event: NavigatedData) => {
            DEV_LOG && console.info('NAVIGATION', 'MODAL', event.object, event.isBackNavigation);
        });
        Frame.on('closingModally', (event: NavigatedData) => {
            DEV_LOG && console.info('NAVIGATION', 'CLOSING MODAL', event.object, event.isBackNavigation);
        });
        Page.on('closingModally', (event: NavigatedData) => {
            DEV_LOG && console.info('NAVIGATION', 'CLOSING MODAL', event.object, event.isBackNavigation);
        });
        GestureRootView.on('shownInBottomSheet', (event: NavigatedData) => {
            DEV_LOG && console.info('NAVIGATION', 'BOTTOMSHEET', event.object, event.isBackNavigation);
        });
        GestureRootView.on('closedBottomSheet', (event: NavigatedData) => {
            DEV_LOG && console.info('NAVIGATION', 'CLOSING BOTTOMSHEET', event.object, event.isBackNavigation);
        });
    }

    let rootFrame;
    let pageInstance;
    // we use custom start cause we want gesturerootview as parent of it all to add snacK message view
    new Promise((resolve, reject) => {
        //wait for launch
        Application.on(Application.launchEvent, () => {
            DEV_LOG && console.log('launch', !!pageInstance);
            resolve(pageInstance);
        });
        Application.on(Application.exitEvent, () => {
            DEV_LOG && console.log('exit', !!pageInstance);
            if (pageInstance) {
                pageInstance.$destroy();
                pageInstance = null;
            }
        });
        try {
            Application.run({
                create: () => {
                    const rootGridLayout = createElement('gesturerootview', window.document as any);
                    const rootFrame = createElement('frame', rootGridLayout.ownerDocument);
                    rootFrame.setAttribute('id', 'app-root-frame');
                    //very important here to use svelte-native navigate
                    // the throttle one wont return the pageInstance
                    pageInstance = navigate({
                        page: PacksList,
                        props: {},
                        frame: rootFrame as any
                    });
                    DEV_LOG && console.log('Application.run', !!pageInstance);
                    rootGridLayout.appendChild(rootFrame);
                    return rootGridLayout['nativeView'];
                }
            });
        } catch (e) {
            reject(e);
        }
    });
} catch (error) {
    console.error(error, error.stack);
}
