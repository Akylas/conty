import { ParserEvent, ParserEventType, XmlParser } from '@nativescript/core/xml';

export interface FeedPodcast {
    title: string;
    description?: string;
    author?: string;
    image?: string;
    link?: string;
    language?: string;
    keywords?: string;
}

export interface FeedEpisode {
    guid: string;
    title: string;
    description?: string;
    /** timestamp in ms, 0 if unknown */
    pubDate: number;
    audioUrl: string;
    /** bytes, 0 if unknown */
    size: number;
    /** ms, 0 if unknown */
    duration: number;
    episodeNumber?: number;
    image?: string;
}

export interface Feed {
    podcast: FeedPodcast;
    episodes: FeedEpisode[];
}

interface OpenElement {
    name: string;
    text: string;
}

function getAttribute(attributes: object | undefined, name: string): string | undefined {
    if (!attributes) {
        return undefined;
    }
    const entry = Object.entries(attributes).find(([key]) => key === name);
    return typeof entry?.[1] === 'string' ? entry[1] : undefined;
}

export function stripHtml(html: string) {
    return html
        .replace(/<br\s*\/?>|<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Parses `SS`, `MM:SS` or `HH:MM:SS` (itunes:duration) into ms. Returns 0 when invalid. */
export function parseDuration(value: string | undefined) {
    if (!value) {
        return 0;
    }
    const parts = value.trim().split(':');
    if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) {
        return 0;
    }
    const seconds = parts.reduce((total, part) => total * 60 + parseFloat(part), 0);
    return Math.round(seconds * 1000);
}

function parseInteger(value: string | undefined) {
    const result = parseInt(value, 10);
    return isNaN(result) ? undefined : result;
}

function nonEmpty(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export function parseFeed(xml: string): Feed {
    const podcast: FeedPodcast = { title: '' };
    const episodes: FeedEpisode[] = [];
    const stack: OpenElement[] = [];
    let currentEpisode: Partial<FeedEpisode> | undefined;
    let hasChannel = false;
    let parseError: Error | undefined;

    function parentName() {
        return stack.length > 1 ? stack[stack.length - 2].name : undefined;
    }

    function onStart(event: ParserEvent) {
        const name = event.elementName;
        stack.push({ name, text: '' });
        if (name === 'channel') {
            hasChannel = true;
        } else if (name === 'item' && parentName() === 'channel') {
            currentEpisode = {};
        } else if (name === 'enclosure' && currentEpisode) {
            currentEpisode.audioUrl = getAttribute(event.attributes, 'url');
            currentEpisode.size = parseInteger(getAttribute(event.attributes, 'length')) || 0;
        } else if (name === 'itunes:image') {
            const href = getAttribute(event.attributes, 'href');
            if (currentEpisode) {
                currentEpisode.image = href;
            } else if (stack.length === 3 && !podcast.image) {
                podcast.image = href;
            }
        }
    }

    function onEnd() {
        const element = stack.pop();
        if (!element) {
            return;
        }
        const text = nonEmpty(element.text);
        const parent = stack.length ? stack[stack.length - 1].name : undefined;
        if (element.name === 'item' && parent === 'channel') {
            if (currentEpisode?.audioUrl) {
                episodes.push({
                    guid: currentEpisode.guid || currentEpisode.audioUrl,
                    title: currentEpisode.title || '',
                    description: currentEpisode.description,
                    pubDate: currentEpisode.pubDate || 0,
                    audioUrl: currentEpisode.audioUrl,
                    size: currentEpisode.size || 0,
                    duration: currentEpisode.duration || 0,
                    episodeNumber: currentEpisode.episodeNumber,
                    image: currentEpisode.image
                });
            }
            currentEpisode = undefined;
            return;
        }
        if (!text) {
            return;
        }
        if (currentEpisode) {
            if (parent !== 'item') {
                return;
            }
            switch (element.name) {
                case 'title':
                    currentEpisode.title = text;
                    break;
                case 'guid':
                    currentEpisode.guid = text;
                    break;
                case 'description':
                case 'itunes:summary':
                case 'content:encoded':
                    // prefer the first non empty one (description is usually first), content:encoded is richer but verbose
                    currentEpisode.description = currentEpisode.description || stripHtml(text);
                    break;
                case 'pubDate':
                    currentEpisode.pubDate = Date.parse(text) || 0;
                    break;
                case 'itunes:duration':
                    currentEpisode.duration = parseDuration(text);
                    break;
                case 'itunes:episode':
                    currentEpisode.episodeNumber = parseInteger(text);
                    break;
            }
        } else if (parent === 'channel') {
            switch (element.name) {
                case 'title':
                    podcast.title = text;
                    break;
                case 'description':
                case 'itunes:summary':
                    podcast.description = podcast.description || stripHtml(text);
                    break;
                case 'itunes:author':
                    podcast.author = text;
                    break;
                case 'link':
                    podcast.link = text;
                    break;
                case 'language':
                    podcast.language = text;
                    break;
                case 'itunes:keywords':
                    podcast.keywords = text;
                    break;
            }
        } else if (element.name === 'url' && parent === 'image' && stack.length === 3 && !podcast.image) {
            // <channel><image><url>
            podcast.image = text;
        }
    }

    function onText(event: ParserEvent) {
        const current = stack[stack.length - 1];
        if (current) {
            current.text += event.data;
        }
    }

    const parser = new XmlParser(
        (event) => {
            switch (event.eventType) {
                case ParserEventType.StartElement:
                    onStart(event);
                    break;
                case ParserEventType.EndElement:
                    onEnd();
                    break;
                case ParserEventType.Text:
                case ParserEventType.CDATA:
                    onText(event);
                    break;
            }
        },
        (error) => {
            parseError = error;
        },
        false
    );
    parser.parse(xml);
    if (parseError) {
        throw parseError;
    }
    if (!hasChannel || !podcast.title) {
        throw new Error('not a valid podcast feed');
    }
    return { podcast, episodes };
}
