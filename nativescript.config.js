const timelineEnabled = process.env['NS_TIMELINE'] === '1';
const sentryEnabled = process.env['NS_SENTRY'] === '1';
const loggingEnabled = sentryEnabled || process.env['NS_LOGGING'] === '1';
const playstoreBuild = process.env['PLAY_STORE_BUILD'] === '1';
const appId = process.env['APP_ID'] || 'com.akylas.conty';

module.exports = {
    ignoredNativeDependencies: ['@nativescript/detox']
        .concat(sentryEnabled ? [] : ['@nativescript-community/sentry'])
        .concat(playstoreBuild ? ['@akylas/non-playstore'] : ['@akylas/nativescript-inapp-purchase']),
    id: appId,
    appResourcesPath: process.env['APP_RESOURCES'] || 'App_Resources',
    buildPath: process.env['APP_BUILD_PATH'] || 'platforms',
    webpackPackageName: '@akylas/nativescript-webpack',
    webpackConfigPath: 'app.webpack.config.js',
    appPath: 'app',
    forceLog: loggingEnabled,
    profiling: timelineEnabled ? 'timeline' : undefined,
    i18n: {
        defaultLanguage: 'en'
    },
    ios: {
        runtimePackageName: '@akylas/nativescript-ios-runtime'
    },
    android: {
        runtimePackageName: '@akylas/nativescript-android-runtime',
        gradleVersion: '8.14.3',
        markingMode: 'none',
        codeCache: true,
        enableMultithreadedJavascript: false,
        handleTimeZoneChanges: true,
        ...(loggingEnabled
            ? {
                  forceLog: true,
                  maxLogcatObjectSize: 40096
              }
            : {})
    },
    cssParser: 'rework',
    hooks: [
        {
            type: 'after-prepareNativeApp',
            script: 'tools/scripts/after-prepareNativeApp.js'
        }
    ]
};
