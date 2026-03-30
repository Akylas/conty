const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

const SRC_FOLDER = path.resolve(__dirname, 'src/');
const DIST_FOLDER = path.resolve(__dirname, '../app/assets/webview');
const ENTRY = path.resolve(SRC_FOLDER, 'index.ts');
module.exports = (env = {}, params = {}) => {
    Object.keys(env).forEach((k) => {
        if (env[k] === 'false' || env[k] === '0') {
            env[k] = false;
        } else if (env[k] === 'true' || env[k] === '1') {
            env[k] = true;
        }
    });
    const {
        production, // --env.production
        noconsole = true // --env.noconsole
    } = env;
    const mode = production !== undefined ? (!!production ? 'production' : 'development') : process.env.NODE_ENV || 'development';
    const platform = env && ((env.android && 'android') || (env.ios && 'ios'));
    const prod = mode === 'production';
    console.log('distFolder', env.distFolder)
    return {
        mode,
        entry: ENTRY,
        stats: 'none',
        resolve: {
            extensions: ['.mjs', '.js', '.ts'],
            mainFields: ['browser', 'module', 'main']
        },
        output: {
            path: env.distFolder || DIST_FOLDER,
            // publicPath: DIST_FOLDER,
            filename: 'airtableInjection.js',
            clean: true
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: true,
                        allowTsInNodeModules: true,
                        compilerOptions: {
                            sourceMap: false,
                            declaration: false
                        }
                    }
                    // loader: 'swc-loader',
                    // options: {
                    //     jsc: {
                    //         target: 'es2019',
                    //         parser: {
                    //             syntax: 'typescript'
                    //         }
                    //     }
                    // }
                },
                {
                    test: /\.js$/,
                    loader: 'swc-loader',
                    options: {
                        jsc: {
                            target: 'es2019'
                        }
                    }
                }
            ]
        },
        optimization: {
            usedExports: true,
            moduleIds: 'deterministic',
            runtimeChunk: false,
            splitChunks: false,
            minimize: prod,
            minimizer: [
                new TerserPlugin({
                    parallel: true,
                    terserOptions: {
                        ecma: 2019,
                        module: false,
                        toplevel: false,
                        keep_classnames: false,
                        keep_fnames: false,
                        output: {
                            comments: false
                        },
                        mangle: true,
                        compress: {
                            sequences: platform !== 'android',
                            passes: 2,
                            drop_console: prod && noconsole
                        }
                    }
                })
            ]
        },
        plugins: [],
        devtool: false
    };
};
