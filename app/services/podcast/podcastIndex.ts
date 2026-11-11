import { request } from '~/services/api';
import { sha1 } from '~/utils';

export interface PodcastSearchResult {
    id: number;
    title: string;
    author?: string;
    description?: string;
    image?: string;
    feedUrl: string;
}

interface PodcastIndexFeed {
    id: number;
    title: string;
    url: string;
    description?: string;
    author?: string;
    image?: string;
    artwork?: string;
}

/** Podcast Index needs an API key, injected at build time from PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET. */
export const podcastSearchAvailable = !!PODCAST_INDEX_KEY && !!PODCAST_INDEX_SECRET;

export async function searchPodcasts(term: string): Promise<PodcastSearchResult[]> {
    const date = Math.floor(Date.now() / 1000);
    const result = await request<{ feeds?: PodcastIndexFeed[] }>({
        url: `https://api.podcastindex.org/api/1.0/search/byterm?max=40&q=${encodeURIComponent(term.trim())}`,
        method: 'GET',
        headers: {
            'User-Agent': 'Conty',
            'X-Auth-Date': date + '',
            'X-Auth-Key': PODCAST_INDEX_KEY,
            Authorization: sha1(PODCAST_INDEX_KEY + PODCAST_INDEX_SECRET + date)
        }
    });
    return (result.feeds ?? []).map((feed) => ({
        id: feed.id,
        title: feed.title,
        author: feed.author,
        description: feed.description,
        image: feed.artwork || feed.image,
        feedUrl: feed.url
    }));
}
