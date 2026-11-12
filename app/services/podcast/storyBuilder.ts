/**
 * Builds the Lunii `story.json` of the pack linked to a podcast.
 * Graph: cover (square one) -> menu of episodes (no audio, title is spoken with TTS) -> episode story stage.
 * Pure module: no NativeScript imports so it can be run/tested anywhere.
 */
export interface StoryEpisode {
    id: number | string;
    title: string;
    pubDate: number;
    episodeNumber?: number;
    /** file name inside the pack `assets` folder */
    audioFile: string;
    /** file name inside the pack `assets` folder */
    imageFile?: string;
    /** ms */
    duration: number;
}

export interface StoryPodcast {
    title: string;
    description?: string;
    author?: string;
    keywords?: string;
    language?: string;
    podcastId: number | string;
}

export interface PodcastStageNode {
    uuid: string;
    type: string;
    name: string;
    image?: string;
    audio?: string;
    duration?: number;
    episode?: number;
    squareOne: boolean;
    okTransition?: { actionNode?: string; stageNode?: string; optionIndex: number };
    homeTransition?: { actionNode?: string; stageNode?: string; optionIndex: number };
    controlSettings: { wheel: boolean; ok: boolean; home: boolean; pause: boolean; autoplay: boolean };
}

export interface PodcastActionNode {
    id: string;
    name: string;
    options: string[];
}

export interface PodcastStoryJSON {
    format: string;
    title: string;
    version: number;
    description: string;
    subtitle?: string;
    keywords?: string;
    age: number;
    podcast: true;
    podcastId: number | string;
    episodeCount: number;
    language?: string;
    stageNodes: PodcastStageNode[];
    actionNodes: PodcastActionNode[];
}

const COVER_ID = 'podcast-cover';
const MENU_ACTION_ID = 'podcast-menu';

/** Episode number used for ordering in podcast mode: `itunes:episode` else chronological rank (1 = oldest). */
export function getEpisodeNumbers(episodes: StoryEpisode[]) {
    const chronological = [...episodes].sort((first, second) => first.pubDate - second.pubDate);
    return new Map(chronological.map((episode, index) => [episode.id, episode.episodeNumber ?? index + 1]));
}

export function buildStoryJSON(podcast: StoryPodcast, episodes: StoryEpisode[]): PodcastStoryJSON {
    const numbers = getEpisodeNumbers(episodes);
    // menu is newest first
    const sorted = [...episodes].sort((first, second) => second.pubDate - first.pubDate);
    const stageNodes: PodcastStageNode[] = [
        {
            uuid: COVER_ID,
            type: 'cover',
            name: podcast.title,
            squareOne: true,
            okTransition: { actionNode: MENU_ACTION_ID, optionIndex: 0 },
            controlSettings: { wheel: true, ok: true, home: false, pause: false, autoplay: false }
        }
    ];
    const actionNodes: PodcastActionNode[] = [
        {
            id: MENU_ACTION_ID,
            name: podcast.title,
            options: sorted.map((episode) => `episode-${episode.id}-menu`)
        }
    ];
    sorted.forEach((episode, index) => {
        const menuId = `episode-${episode.id}-menu`;
        const storyId = `episode-${episode.id}-story`;
        const actionId = `episode-${episode.id}-action`;
        stageNodes.push(
            {
                uuid: menuId,
                type: 'menu.optionstage',
                name: episode.title,
                image: episode.imageFile,
                squareOne: false,
                okTransition: { actionNode: actionId, optionIndex: 0 },
                homeTransition: { stageNode: COVER_ID, optionIndex: 0 },
                controlSettings: { wheel: true, ok: true, home: true, pause: false, autoplay: false }
            },
            {
                uuid: storyId,
                type: 'story',
                name: episode.title,
                image: episode.imageFile,
                audio: episode.audioFile,
                duration: episode.duration,
                episode: numbers.get(episode.id),
                squareOne: false,
                // back to the menu, selected on this episode
                homeTransition: { actionNode: MENU_ACTION_ID, optionIndex: index },
                controlSettings: { wheel: false, ok: false, home: true, pause: true, autoplay: false }
            }
        );
        actionNodes.push({ id: actionId, name: episode.title, options: [storyId] });
    });
    return {
        format: 'v2',
        title: podcast.title,
        version: 1,
        description: podcast.description || '',
        subtitle: podcast.author,
        keywords: podcast.keywords,
        age: 0,
        podcast: true,
        podcastId: podcast.podcastId,
        episodeCount: episodes.length,
        language: podcast.language,
        stageNodes,
        actionNodes
    };
}
