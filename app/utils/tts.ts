import type { TNSTextToSpeech } from '@nativescript-community/texttospeech';

let engine: TNSTextToSpeech;
let pendingSpeech: ((completed: boolean) => void) | undefined;

// loaded lazily: the android module touches native classes as soon as it is imported
async function getEngine() {
    if (!engine) {
        const { TNSTextToSpeech } = await import('@nativescript-community/texttospeech');
        engine = new TNSTextToSpeech();
    }
    return engine;
}

/** feeds give `en-us`, `fr`, `pt-BR`... */
export function normalizeLocale(language?: string) {
    if (!language) {
        return undefined;
    }
    const [lang, region] = language.trim().split(/[-_]/);
    return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
}

/** Interrupts the current speech, if any. */
export function stopSpeaking() {
    if (pendingSpeech) {
        const resolve = pendingSpeech;
        pendingSpeech = undefined;
        engine?.pause();
        resolve(false);
    }
}

/** Speaks `text` and resolves once finished. Resolves `false` if it was interrupted or if TTS is not available. */
export function speak(text: string, language?: string) {
    stopSpeaking();
    return new Promise<boolean>((resolve) => {
        pendingSpeech = resolve;
        getEngine()
            .then((ttsEngine) => {
                // interrupted while the engine was loading
                if (pendingSpeech !== resolve) {
                    return;
                }
                return ttsEngine.speak({
                    text,
                    locale: normalizeLocale(language),
                    queue: false,
                    finishedCallback: () => {
                        if (pendingSpeech === resolve) {
                            pendingSpeech = undefined;
                            resolve(true);
                        }
                    }
                });
            })
            .catch((error) => {
                console.error('tts error', error);
                if (pendingSpeech === resolve) {
                    pendingSpeech = undefined;
                }
                resolve(false);
            });
    });
}
