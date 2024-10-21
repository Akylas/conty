<script context="module" lang="ts">
    import { CheckBox } from '@nativescript-community/ui-checkbox';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { openFilePicker, pickFolder, saveFile } from '@nativescript-community/ui-document-picker';
    import { showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { alert, confirm, login, prompt } from '@nativescript-community/ui-material-dialogs';
    import { showSnack } from '@nativescript-community/ui-material-snackbar';
    import { TextField } from '@nativescript-community/ui-material-textfield';
    import { TextView } from '@nativescript-community/ui-material-textview';
    import { ApplicationSettings, File, ObservableArray, Page, ScrollView, StackLayout, Utils, View } from '@nativescript/core';
    import { SDK_VERSION } from '@nativescript/core/utils';
    import dayjs from 'dayjs';
    import { Template } from 'svelte-native/components';
    import type { NativeViewElementNode } from 'svelte-native/dom';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import ListItemAutoSize from '~/components/common/ListItemAutoSize.svelte';
    import { getLocaleDisplayName, l, lc, onLanguageChanged, selectLanguage, slc } from '~/helpers/locale';
    import { getColorThemeDisplayName, getThemeDisplayName, onColorThemeChanged, onThemeChanged, selectColorTheme, selectTheme } from '~/helpers/theme';
    import { RemoteContentProvider } from '~/models/Pack';
    import { getBGServiceInstance } from '~/services/BgService';
    import { documentsService } from '~/services/documents';
    import { getRealPath, restartApp } from '~/utils';
    import {
        DEFAULT_DRAW_FOLDERS_BACKGROUND,
        DEFAULT_INVERSE_IMAGES,
        DEFAULT_PODCAST_MODE,
        DEFAULT_SHOW_SHUTDOWN_IN_NOTIF,
        SETTINGS_DRAW_FOLDERS_BACKGROUND,
        SETTINGS_INVERSE_IMAGES,
        SETTINGS_LANGUAGE,
        SETTINGS_PODCAST_MODE,
        SETTINGS_REMOTE_SOURCES,
        SETTINGS_SHOW_SHUTDOWN_IN_NOTIF
    } from '~/utils/constants';
    import { SilentError } from '@shared/utils/error';
    import { copyFolderContent, removeFolderContent } from '~/utils/file';
    import { Sentry } from '@shared/utils/sentry';
    import { share } from '@shared/utils/share';
    import { showError } from '@shared/utils/showError';
    import { createView, hideLoading, openLink, showAlertOptionSelect, showLoading, showSettings } from '~/utils/ui';
    import { colors, fonts, windowInset } from '~/variables';
    import IconButton from '../common/IconButton.svelte';
    const version = __APP_VERSION__ + ' Build ' + __APP_BUILD_NUMBER__;
    const storeSettings = {};
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    let { colorOnSurface, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors;
    $: ({ colorOnSurface, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors);
    $: ({ bottom: windowInsetBottom } = $windowInset);

    let collectionView: NativeViewElementNode<CollectionView>;
    let page: NativeViewElementNode<Page>;

    let items: ObservableArray<any>;

    export let title = null;
    export let reorderEnabled = false;
    export let actionBarButtons = [
        { icon: 'mdi-share-variant', id: 'share' },
        { icon: 'mdi-github', id: 'github' }
    ];
    export let subSettingsOptions: string = null;
    export let options: (page, updateImte) => any[] = null;
    if (!options && subSettingsOptions) {
        options = () => getSubSettings(subSettingsOptions);
        actionBarButtons = getSubSettingsActions(subSettingsOptions);
        title = getSubSettingsTitle(subSettingsOptions);
    }
    function getSubSettingsTitle(id: string) {
        switch (id) {
            case SETTINGS_REMOTE_SOURCES:
                return lc('remote_sources');
            default:
                break;
        }
    }
    function getDescription(item) {
        return typeof item.description === 'function' ? item.description(item) : item.description;
    }

    function getStoreSetting(k: string, defaultValue) {
        if (!storeSettings[k]) {
            storeSettings[k] = JSON.parse(ApplicationSettings.getString(k, defaultValue));
        }
        return storeSettings[k];
    }
    function getSubSettingsActions(id: string) {
        switch (id) {
            case SETTINGS_REMOTE_SOURCES:
                return [{ icon: 'mdi-plus', id: 'add_remote_source' }];
        }
        return [];
    }

    function addRemoteSource(source: RemoteContentProvider) {
        const sources = JSON.parse(ApplicationSettings.getString(SETTINGS_REMOTE_SOURCES, '[]')) as RemoteContentProvider[];
        if (sources.findIndex((s) => s.url === source.url) !== -1) {
            return alert({ message: lc('remote_source_already_added') });
        }
        sources.push(source);
        ApplicationSettings.setString(SETTINGS_REMOTE_SOURCES, JSON.stringify(sources));
        refresh();
    }
    function getSubSettings(id: string) {
        switch (id) {
            case SETTINGS_REMOTE_SOURCES:
                const sources = JSON.parse(ApplicationSettings.getString(SETTINGS_REMOTE_SOURCES, '[]')) as RemoteContentProvider[];
                DEV_LOG && console.log('sources', sources);
                const defaultSource = {
                    name: 'Raconte moi une histoire',
                    url: 'https://gist.githubusercontent.com/DantSu/3aea4c1fe15070bcf394a40b89aec33e/raw/stories.json',
                    attribution:
                        'La communauté <a href="https://monurl.ca/lunii.creations">Raconte moi une histoire</a> crée et partage des histoires et des outils pour gérer ce contenu sur la Lunii, spécifiquement conçus pour cet appareil',
                    image: 'https://cdn.discordapp.com/icons/911349645752541244/2300753397affc590b981bcb582f2a65.png'
                } as RemoteContentProvider;
                const hasDefaultSource =
                    sources.findIndex(
                        (s) =>
                            s.url === 'https://gist.githubusercontent.com/DantSu/3aea4c1fe15070bcf394a40b89aec33e/raw/stories.json' ||
                            s.url === 'https://gist.githubusercontent.com/UnofficialStories/32702fb104aebfe650d4ef8d440092c1/raw/luniicreations.json'
                    ) !== -1;
                return []
                    .concat(
                        hasDefaultSource
                            ? []
                            : ([
                                  {
                                      type: 'sectionheader',
                                      title: lc('proposed_sources')
                                  },
                                  {
                                      type: 'button',
                                      html: defaultSource.name + '<br/><small><small>' + defaultSource.attribution + '</small></small>',
                                      image: () => defaultSource.image,
                                      data: defaultSource,
                                      buttonText: lc('add'),
                                      onLinkTap: (e) => openLink(e.link),
                                      showBottomLine: true,
                                      titleProps: defaultSource.attribution ? { linkColor: colorPrimary, verticalTextAlignment: 'top', paddingTop: 10, paddingBottom: 10, fontSize: 18 } : undefined,
                                      onButtonTap: () => {
                                          addRemoteSource(defaultSource);
                                      }
                                  }
                              ] as any)
                    )
                    .concat([
                        {
                            type: 'sectionheader',
                            title: lc('added_remote_sources')
                        }
                    ] as any)
                    .concat(
                        sources.length
                            ? sources.map((s) => ({
                                  type: 'imageLeft',
                                  html: s.attribution ? defaultSource.name + '<br/><small><small>' + s.attribution + '</small></small>' : undefined,
                                  title: s.attribution ? undefined : s.name,
                                  showBottomLine: true,
                                  image: () => s.image,
                                  onLinkTap: (e) => openLink(e.link),
                                  titleProps: s.attribution ? { linkColor: colorPrimary, verticalTextAlignment: 'top', paddingTop: 10, paddingBottom: 10, fontSize: 18 } : undefined
                              }))
                            : [
                                  {
                                      description: () => lc('no_remote_source'),
                                      titleProps: { textAlignment: 'center' }
                                  }
                              ]
                    );
            default:
                break;
        }
        return null;
    }
    function refresh() {
        const newItems: any[] =
            options?.(page, updateItem) ||
            [
                {
                    type: 'header',
                    title: __IOS__ ? lc('show_love') : lc('donate')
                },
                {
                    type: 'sectionheader',
                    title: lc('general')
                },
                {
                    id: SETTINGS_LANGUAGE,
                    description: () => getLocaleDisplayName(),
                    title: lc('language')
                },
                {
                    id: 'theme',
                    description: () => getThemeDisplayName(),
                    title: lc('theme.title')
                },
                {
                    id: 'color_theme',
                    description: () => getColorThemeDisplayName(),
                    title: lc('color_theme.title')
                },
                {
                    type: 'switch',
                    id: 'auto_black',
                    title: lc('auto_black'),
                    value: ApplicationSettings.getBoolean('auto_black', false)
                },
                {
                    type: 'switch',
                    id: SETTINGS_INVERSE_IMAGES,
                    title: lc('inverse_images'),
                    description: lc('inverse_images_desc'),
                    value: ApplicationSettings.getBoolean(SETTINGS_INVERSE_IMAGES, DEFAULT_INVERSE_IMAGES)
                },
                {
                    type: 'switch',
                    id: SETTINGS_PODCAST_MODE,
                    title: lc('podcast_mode'),
                    description: lc('podcast_mode_desc'),
                    value: ApplicationSettings.getBoolean(SETTINGS_PODCAST_MODE, DEFAULT_PODCAST_MODE)
                },
                {
                    id: 'sub_settings',
                    settings: SETTINGS_REMOTE_SOURCES,
                    icon: 'mdi-cloud-download-outline',
                    title: getSubSettingsTitle(SETTINGS_REMOTE_SOURCES),
                    description: lc('remote_sources_desc')
                }
            ]
                .concat(
                    __ANDROID__ && (!PLAY_STORE_BUILD || SDK_VERSION < 30)
                        ? [
                              {
                                  id: 'data_location',
                                  title: lc('data_location'),
                                  description: documentsService.dataFolder.path
                                  //   rightBtnIcon: 'mdi-chevron-right'
                              }
                          ]
                        : ([] as any)
                )
                .concat(
                    __ANDROID__
                        ? [
                              {
                                  type: 'switch',
                                  id: SETTINGS_SHOW_SHUTDOWN_IN_NOTIF,
                                  title: lc('notif_shutdown_button'),
                                  description: lc('notif_shutdown_button_desc'),
                                  value: ApplicationSettings.getBoolean(SETTINGS_SHOW_SHUTDOWN_IN_NOTIF, DEFAULT_SHOW_SHUTDOWN_IN_NOTIF)
                              }
                              //   {
                              //       id: 'battery_optimisation',
                              //       title: lc('battery_optimization'),
                              //       description: lc('battery_optimization_desc'),
                              //       rightValue: getBGServiceInstance().isBatteryOptimized() ? lc('enabled') : lc('disabled')
                              //       //   rightBtnIcon: 'mdi-chevron-right'
                              //   }
                              //   {
                              //       id: 'accessibility_service',
                              //       title: lc('accessibility_service'),
                              //       description: lc('accessibility_service_desc'),
                              //       rightValue: getBGServiceInstance().isAccessibilityServiceEnabled() ? lc('enabled') : lc('disabled')
                              //       //   rightBtnIcon: 'mdi-chevron-right'
                              //   }
                          ]
                        : ([] as any)
                )
                .concat([
                    {
                        type: 'switch',
                        id: SETTINGS_DRAW_FOLDERS_BACKGROUND,
                        title: lc('folder_color_as_background'),
                        description: lc('folder_color_as_background_desc'),
                        value: ApplicationSettings.getBoolean(SETTINGS_DRAW_FOLDERS_BACKGROUND, DEFAULT_DRAW_FOLDERS_BACKGROUND)
                    }
                ] as any)
                .concat([
                    {
                        id: 'third_party',
                        // rightBtnIcon: 'mdi-chevron-right',
                        title: lc('third_parties'),
                        description: lc('list_used_third_parties')
                    }
                ] as any)
                .concat(
                    SENTRY_ENABLED || !PRODUCTION
                        ? [
                              {
                                  id: 'feedback',
                                  icon: 'mdi-bullhorn',
                                  title: lc('send_feedback')
                              }
                          ]
                        : ([] as any)
                )
                .concat(
                    PLAY_STORE_BUILD
                        ? [
                              //   {
                              //       id: 'share',
                              //       rightBtnIcon: 'mdi-chevron-right',
                              //       title: lc('share_application')
                              //   },
                              {
                                  type: 'rightIcon',
                                  id: 'review',
                                  rightBtnIcon: 'mdi-chevron-right',
                                  title: lc('review_application')
                              }
                          ]
                        : ([] as any)
                )

                .concat([
                    {
                        type: 'sectionheader',
                        title: lc('backup_restore')
                    },
                    {
                        id: 'export_settings',
                        title: lc('export_settings'),
                        description: lc('export_settings_desc')
                        // rightBtnIcon: 'mdi-chevron-right'
                    },
                    {
                        id: 'import_settings',
                        title: lc('import_settings'),
                        description: lc('import_settings_desc')
                        // rightBtnIcon: 'mdi-chevron-right'
                    }
                ] as any);

        items = new ObservableArray(newItems);
    }
    refresh();

    async function onLongPress(id, event) {
        try {
            switch (id) {
                case 'version':
                    if (SENTRY_ENABLED) {
                        throw new Error('test error');
                    }
            }
        } catch (error) {
            showError(error);
        }
    }
    function updateItem(item, key = 'key') {
        const index = items.findIndex((it) => it[key] === item[key]);
        if (index !== -1) {
            items.setItem(index, item);
        }
    }
    let checkboxTapTimer;
    function clearCheckboxTimer() {
        if (checkboxTapTimer) {
            clearTimeout(checkboxTapTimer);
            checkboxTapTimer = null;
        }
    }
    async function onRightIconTap(item, event) {
        try {
            const needsUpdate = await item.onRightIconTap?.(item, event);
            if (needsUpdate) {
                updateItem(item);
            }
        } catch (error) {
            showError(error);
        }
    }
    async function onButtonTap(item, event) {
        try {
            const needsUpdate = await item.onButtonTap?.(item, event);
            if (needsUpdate) {
                updateItem(item);
            }
        } catch (error) {
            showError(error);
        }
    }
    async function onTap(item, event) {
        try {
            if (item.type === 'checkbox' || item.type === 'switch') {
                // we dont want duplicate events so let s timeout and see if we clicking diretly on the checkbox
                const checkboxView: CheckBox = ((event.object as View).parent as View).getViewById('checkbox');
                clearCheckboxTimer();
                checkboxTapTimer = setTimeout(() => {
                    checkboxView.checked = !checkboxView.checked;
                }, 10);
                return;
            }
            switch (item.id) {
                case 'sub_settings': {
                    showSettings({
                        title: item.title,
                        subSettingsOptions: item.settings
                    });
                    break;
                }
                case 'github':
                    openLink(GIT_URL);
                    break;
                case SETTINGS_LANGUAGE:
                    await selectLanguage();
                    break;
                case 'theme':
                    await selectTheme();
                    break;
                case 'color_theme':
                    await selectColorTheme();
                    break;
                case 'share':
                    await share({
                        message: GIT_URL
                    });
                    break;
                case 'add_remote_source': {
                    const result = await login({
                        title: lc('add_source'),
                        autoFocus: true,
                        usernameTextFieldProperties: {
                            margin: 10,
                            hint: lc('name')
                        },
                        passwordTextFieldProperties: {
                            margin: 10,
                            hint: lc('remote_source_json_url'),
                            secure: false
                        }
                    });
                    if (result?.password && result?.userName) {
                        addRemoteSource({
                            name: result.userName,
                            url: result.password
                        });
                    } else {
                        throw new SilentError(lc('missing_name_or_url'));
                    }
                    break;
                }
                case 'review':
                    openLink(STORE_REVIEW_LINK);
                    break;
                case 'sponsor':
                case 'sponsor':
                    switch (item.type) {
                        case 'librepay':
                            openLink('https://liberapay.com/farfromrefuge');
                            break;
                        case 'patreon':
                            openLink('https://patreon.com/farfromrefuge');
                            break;

                        default:
                            // Apple wants us to use in-app purchase for donations => taking 30% ...
                            // so lets just open github and ask for love...
                            openLink(__IOS__ ? GIT_URL : SPONSOR_URL);
                            break;
                    }
                    break;
                case 'third_party':
                    const ThirdPartySoftwareBottomSheet = (await import('~/components/settings/ThirdPartySoftwareBottomSheet.svelte')).default;
                    showBottomSheet({
                        parent: this,
                        peekHeight: 400,
                        // skipCollapsedState: isLandscape(),
                        view: ThirdPartySoftwareBottomSheet
                    });
                    break;
                case 'feedback': {
                    if (SENTRY_ENABLED || !PRODUCTION) {
                        const view = createView(ScrollView);
                        const stackLayout = createView(StackLayout, {});
                        const commentsTF = createView(TextView, {
                            hint: lc('comments'),
                            variant: 'outline',
                            margin: 10,
                            height: 150,
                            returnKeyType: 'done'
                        });
                        const emailTF = createView(TextField, {
                            hint: lc('email'),
                            variant: 'outline',
                            autocapitalizationType: 'none',
                            margin: 10,
                            autocorrect: false,
                            keyboardType: 'email',
                            returnKeyType: 'next'
                        });
                        const nameTF = createView(TextField, {
                            hint: lc('name'),
                            margin: 10,
                            variant: 'outline',
                            returnKeyType: 'next'
                        });
                        stackLayout.addChild(nameTF);
                        stackLayout.addChild(emailTF);
                        stackLayout.addChild(commentsTF);
                        view.content = stackLayout;
                        const result = await confirm({
                            title: lc('send_feedback'),
                            okButtonText: l('send'),
                            cancelButtonText: l('cancel'),
                            view
                        });
                        if (result && nameTF.text?.length && commentsTF.text?.length) {
                            const eventId = Sentry.captureMessage('User Feedback');

                            Sentry.captureUserFeedback({
                                event_id: eventId,
                                name: nameTF.text,
                                email: emailTF.text,
                                comments: commentsTF.text
                            });
                            Sentry.flush();
                            showSnack({ message: l('feedback_sent') });
                        }
                    } else {
                        openLink(GIT_URL + '/issues');
                    }
                    break;
                }
                case 'export_settings':
                    // if (__ANDROID__ && SDK_VERSION < 29) {
                    //     const permRes = await request('storage');
                    //     if (!isPermResultAuthorized(permRes)) {
                    //         throw new Error(lc('missing_storage_perm_settings'));
                    //     }
                    // }
                    DEV_LOG && console.log('export_settings');
                    const jsonStr = ApplicationSettings.getAllJSON();
                    DEV_LOG && console.log('export_settings1', typeof jsonStr, jsonStr);
                    if (jsonStr) {
                        const result = await saveFile({
                            name: `${__APP_ID__}_settings_${dayjs().format('YYYY-MM-DD')}.json`,
                            data: jsonStr,
                            forceSAF: true
                        });
                        DEV_LOG && console.log('export_settings done', result, jsonStr);
                    }
                    break;
                case 'import_settings':
                    const result = await openFilePicker({
                        extensions: ['json'],

                        multipleSelection: false,
                        pickerMode: 0,
                        forceSAF: true
                    });
                    const filePath = result.files[0];
                    DEV_LOG && console.log('import_settings from file picker', filePath, filePath && File.exists(filePath));
                    if (filePath && File.exists(filePath)) {
                        showLoading();
                        const text = await File.fromPath(filePath).readText();
                        DEV_LOG && console.log('import_settings', text);
                        const json = JSON.parse(text);
                        const nativePref = ApplicationSettings.getNative();
                        if (__ANDROID__) {
                            const editor = (nativePref as android.content.SharedPreferences).edit();
                            editor.clear();
                            Object.keys(json).forEach((k) => {
                                if (k.startsWith('_')) {
                                    return;
                                }
                                const value = json[k];
                                const type = typeof value;
                                switch (type) {
                                    case 'boolean':
                                        editor.putBoolean(k, value);
                                        break;
                                    case 'number':
                                        editor.putLong(k, java.lang.Double.doubleToRawLongBits(double(value)));
                                        break;
                                    case 'string':
                                        editor.putString(k, value);
                                        break;
                                }
                            });
                            editor.apply();
                        } else {
                            const userDefaults = nativePref as NSUserDefaults;
                            const domain = NSBundle.mainBundle.bundleIdentifier;
                            userDefaults.removePersistentDomainForName(domain);
                            Object.keys(json).forEach((k) => {
                                if (k.startsWith('_')) {
                                    return;
                                }
                                const value = json[k];
                                const type = typeof value;
                                switch (type) {
                                    case 'boolean':
                                        userDefaults.setBoolForKey(value, k);
                                        break;
                                    case 'number':
                                        userDefaults.setDoubleForKey(value, k);
                                        break;
                                    case 'string':
                                        userDefaults.setObjectForKey(value, k);
                                        break;
                                }
                            });
                        }
                        await hideLoading();
                        if (__ANDROID__) {
                            const result = await confirm({
                                message: lc('restart_app'),
                                okButtonText: lc('restart'),
                                cancelButtonText: lc('later')
                            });
                            if (result) {
                                restartApp();
                            }
                        } else {
                            showSnack({ message: lc('please_restart_app') });
                        }
                    }
                    break;
                case 'battery_optimisation':
                    await getBGServiceInstance().checkBatteryOptimDisabled();
                    refreshCollectionView();
                    break;
                // case 'accessibility_service':
                //     await getBGServiceInstance().enableAccessibilityService();
                //     refreshCollectionView();
                //     break;
                case 'data_location': {
                    const result = await pickFolder({
                        permissions: {
                            read: true,
                            write: true,
                            recursive: true,
                            persistable: true
                        }
                    });
                    const resultPath = result.folders[0];
                    if (resultPath) {
                        const dstFolder = getRealPath(resultPath);
                        const srcFolder = documentsService.dataFolder.path;
                        DEV_LOG &&
                            console.log(
                                'move data location',
                                JSON.stringify({
                                    srcFolder,
                                    resultPath,
                                    dstFolder
                                })
                            );
                        let confirmed = true;
                        if (srcFolder !== getRealPath(resultPath, true)) {
                            confirmed = await confirm({
                                title: lc('move_data'),
                                message: lc('move_data_desc'),
                                okButtonText: lc('ok'),
                                cancelButtonText: lc('cancel')
                            });
                        }
                        if (confirmed) {
                            DEV_LOG && console.log('confirmed move data to', srcFolder, dstFolder);
                            showLoading(lc('moving_files'));
                            await copyFolderContent(srcFolder, dstFolder);
                            await removeFolderContent(srcFolder);
                            DEV_LOG && console.log('copyFolderContent done');
                        }
                        ApplicationSettings.setString('data_folder', dstFolder);
                        // documentsService.dataFolder = Folder.fromPath(dstFolder);
                        await alert({
                            cancelable: false,
                            message: lc('restart_app'),
                            okButtonText: lc('restart')
                        });
                        restartApp();
                        // item.text = dstFolder;
                        item.description = dstFolder;
                        updateItem(item);
                    }
                    break;
                }
                case 'setting': {
                    if (item.type === 'prompt') {
                        const result = await prompt({
                            title: item.title,
                            message: item.full_description || item.description,
                            okButtonText: l('save'),
                            cancelButtonText: l('cancel'),
                            textFieldProperties: item.textFieldProperties,
                            autoFocus: true,
                            defaultText: typeof item.rightValue === 'function' ? item.rightValue() : item.default
                        });
                        Utils.dismissSoftInput();
                        if (result) {
                            if (result.result && result.text.length > 0) {
                                if (item.valueType === 'string') {
                                    ApplicationSettings.setString(item.key, result.text);
                                } else {
                                    ApplicationSettings.setNumber(item.key, parseInt(result.text, 10));
                                }
                            } else {
                                ApplicationSettings.remove(item.key);
                            }
                            updateItem(item);
                        }
                    } else {
                        let selectedIndex = -1;
                        const currentValue = item.currentValue?.() ?? item.currentValue;
                        const options = item.values.map((k, index) => {
                            const selected = currentValue === k.value;
                            if (selected) {
                                selectedIndex = index;
                            }
                            return {
                                name: k.title || k.name,
                                data: k.value,
                                boxType: 'circle',
                                type: 'checkbox',
                                value: selected
                            };
                        });
                        const result = await showAlertOptionSelect(
                            {
                                height: Math.min(item.values.length * 56, 400),
                                rowHeight: 56,
                                selectedIndex,
                                options
                            },
                            {
                                title: item.title,
                                message: item.full_description
                            }
                        );
                        if (result?.data !== undefined) {
                            if (item.valueType === 'string') {
                                ApplicationSettings.setString(item.key, result.data);
                            } else {
                                ApplicationSettings.setNumber(item.key, parseInt(result.data, 10));
                            }
                            updateItem(item);
                        }
                    }

                    break;
                }
                default: {
                    const needsUpdate = await item.onTap?.(item, event);
                    if (needsUpdate) {
                        updateItem(item);
                    }
                    break;
                }
            }
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
        }
    }
    onLanguageChanged(refresh);

    function selectTemplate(item, index, items) {
        if (item.type) {
            if (item.type === 'prompt' || item.type === 'slider') {
                return 'default';
            }
            return item.type;
        }
        if (item.icon) {
            return 'leftIcon';
        }
        return 'default';
    }

    let ignoreNextOnCheckBoxChange = false;
    async function onCheckBox(item, event) {
        if (ignoreNextOnCheckBoxChange || item.value === event.value) {
            return;
        }
        const value = event.value;
        item.value = value;
        clearCheckboxTimer();
        DEV_LOG && console.log('onCheckBox', item.id, value);
        try {
            ignoreNextOnCheckBoxChange = true;
            switch (item.id) {
                default:
                    DEV_LOG && console.log('updating setting for checkbox', item.id, item.key, value);
                    ApplicationSettings.setBoolean(item.key || item.id, value);
                    break;
            }
        } catch (error) {
            showError(error);
        } finally {
            ignoreNextOnCheckBoxChange = false;
        }
    }
    function refreshCollectionView() {
        collectionView?.nativeView?.refresh();
    }
    onThemeChanged(refreshCollectionView);
    onColorThemeChanged(refreshCollectionView);
</script>

<page bind:this={page} id={title || $slc('settings.title')} actionBarHidden={true}>
    <gridlayout rows="auto,*">
        <collectionview bind:this={collectionView} accessibilityValue="settingsCV" itemTemplateSelector={selectTemplate} {items} {reorderEnabled} row={1} android:paddingBottom={windowInsetBottom}>
            <Template key="header" let:item>
                <gridlayout rows="auto,auto">
                    {#if __ANDROID__}
                        <gridlayout columns="*,auto,auto" margin="10 16 0 16">
                            <stacklayout
                                backgroundColor="#ea4bae"
                                borderRadius={10}
                                orientation="horizontal"
                                padding={10}
                                rippleColor="white"
                                verticalAlignment="center"
                                on:tap={(event) => onTap({ id: 'sponsor' }, event)}>
                                <label color="white" fontFamily={$fonts.mdi} fontSize={26} marginRight={10} text="mdi-heart" verticalAlignment="center" />
                                <label color="white" fontSize={12} text={item.title} textWrap={true} verticalAlignment="center" />
                            </stacklayout>
                            <image
                                borderRadius={6}
                                col={1}
                                height={40}
                                margin="0 10 0 10"
                                rippleColor="white"
                                src="~/assets/images/librepay.png"
                                verticalAlignment="center"
                                on:tap={(event) => onTap({ id: 'sponsor', type: 'librepay' }, event)} />
                            <image borderRadius={6} col={2} height={40} rippleColor="#f96754" src="~/assets/images/patreon.png" on:tap={(event) => onTap({ id: 'sponsor', type: 'patreon' }, event)} />
                        </gridlayout>
                    {/if}

                    <stacklayout horizontalAlignment="center" marginBottom={0} marginTop={20} row={1} verticalAlignment="center">
                        <image borderRadius="25" height={50} horizontalAlignment="center" src="res://icon" width={50} />
                        <label fontSize={13} marginTop={4} text={version} on:longPress={(event) => onLongPress('version', event)} />
                    </stacklayout>
                </gridlayout>
            </Template>
            <Template key="sectionheader" let:item>
                <label class="sectionHeader" {...item.additionalProps || {}} text={item.title} />
            </Template>
            <Template key="switch" let:item>
                <ListItemAutoSize
                    fontSize={20}
                    html={item.html}
                    leftIcon={item.icon}
                    onLinkTap={item.onLinkTap}
                    showBottomLine={item.showBottomLine}
                    subtitle={getDescription(item)}
                    title={item.title}
                    titleProps={item.titleProps}
                    on:tap={(event) => onTap(item, event)}>
                    <switch id="checkbox" checked={item.value} col={1} marginLeft={10} on:checkedChange={(e) => onCheckBox(item, e)} />
                </ListItemAutoSize>
            </Template>
            <Template key="checkbox" let:item>
                <ListItemAutoSize
                    fontSize={20}
                    html={item.html}
                    leftIcon={item.icon}
                    onLinkTap={item.onLinkTap}
                    showBottomLine={item.showBottomLine}
                    subtitle={getDescription(item)}
                    title={item.title}
                    titleProps={item.titleProps}
                    on:tap={(event) => onTap(item, event)}>
                    <checkbox id="checkbox" checked={item.value} col={1} marginLeft={10} on:checkedChange={(e) => onCheckBox(item, e)} />
                </ListItemAutoSize>
            </Template>
            <Template key="rightIcon" let:item>
                <ListItemAutoSize
                    fontSize={20}
                    onLinkTap={item.onLinkTap}
                    showBottomLine={item.showBottomLine}
                    subtitle={getDescription(item)}
                    title={item.title}
                    titleProps={item.titleProps}
                    on:tap={(event) => onTap(item, event)}>
                    <IconButton col={1} text={item.rightBtnIcon} on:tap={(event) => onRightIconTap(item, event)} />
                </ListItemAutoSize>
            </Template>
            <Template key="button" let:item>
                <ListItemAutoSize
                    columns="50,*,auto"
                    fontSize={20}
                    html={item.html}
                    mainCol={1}
                    onLinkTap={item.onLinkTap}
                    showBottomLine={item.showBottomLine}
                    subtitle={getDescription(item)}
                    text={item.text}
                    title={item.title}
                    titleProps={item.titleProps}
                    on:tap={(event) => onTap(item, event)}>
                    <image height={45} marginRight={4} marginTop={15} src={item.image()} verticalAlignment="top" width={45} />
                    <mdbutton col={2} marginTop={20} text={item.buttonText} verticalAlignment="top" on:tap={(event) => onButtonTap(item, event)} />
                </ListItemAutoSize>
            </Template>
            <Template key="leftIcon" let:item>
                <ListItemAutoSize
                    columns="auto,*,auto"
                    fontSize={20}
                    html={item.html}
                    leftIcon={item.icon}
                    mainCol={1}
                    onLinkTap={item.onLinkTap}
                    rightValue={item.rightValue}
                    showBottomLine={item.showBottomLine}
                    subtitle={getDescription(item)}
                    title={item.title}
                    titleProps={item.titleProps}
                    on:tap={(event) => onTap(item, event)}>
                    <label col={0} fontFamily={$fonts.mdi} fontSize={24} padding="0 10 0 0" text={item.icon} verticalAlignment="center" />
                </ListItemAutoSize>
            </Template>
            <Template key="imageLeft" let:item>
                <ListItemAutoSize
                    columns="50,*,auto"
                    html={item.html}
                    mainCol={1}
                    onLinkTap={item.onLinkTap}
                    showBottomLine={item.showBottomLine}
                    subtitle={getDescription(item)}
                    title={item.title}
                    titleProps={item.titleProps}
                    on:tap={(event) => onTap(item, event)}>
                    <image height={45} marginRight={10} marginTop={15} src={item.image()} verticalAlignment="top" visibility={!!item.image ? 'visible' : 'hidden'} />
                </ListItemAutoSize>
            </Template>
            <Template key="image" let:item>
                <ListItemAutoSize fontSize={20} html={item.html} showBottomLine={item.showBottomLine} subtitle={getDescription(item)} title={item.title} on:tap={(event) => onTap(item, event)}>
                    <image col={1} height={45} src={item.image()} />
                </ListItemAutoSize>
            </Template>
            <Template let:item>
                <ListItemAutoSize
                    fontSize={20}
                    html={item.html}
                    onLinkTap={item.onLinkTap}
                    rightValue={item.rightValue}
                    showBottomLine={item.showBottomLine}
                    subtitle={getDescription(item)}
                    title={item.title}
                    titleProps={item.titleProps}
                    on:tap={(event) => onTap(item, event)}>
                </ListItemAutoSize>
            </Template>
        </collectionview>
        <CActionBar canGoBack title={title || $slc('settings.title')}>
            {#each actionBarButtons as button}
                <mdbutton class="actionBarButton" text={button.icon} variant="text" on:tap={(event) => onTap({ id: button.id }, event)} />
            {/each}
        </CActionBar>
    </gridlayout>
</page>
