import NSQLDatabase from '~/db/NSQLDatabase';
import SqlQuery from 'kiss-orm/dist/Queries/SqlQuery';
import { Feed, FeedEpisode } from './rssParser';

const sql = SqlQuery.createFromTemplateString;

export interface Podcast {
    id: number;
    feedUrl: string;
    title: string;
    description?: string;
    author?: string;
    image?: string;
    link?: string;
    language?: string;
    keywords?: string;
    lastRefresh: number;
    /** id of the linked pack, set once the first episode is downloaded */
    packId?: string;
}

export interface PodcastWithCounts extends Podcast {
    episodeCount: number;
    downloadedCount: number;
}

export interface PodcastEpisode {
    id: number;
    podcastId: number;
    guid: string;
    title: string;
    description?: string;
    pubDate: number;
    audioUrl: string;
    size: number;
    duration: number;
    episodeNumber?: number;
    image?: string;
    /** audio file name inside the pack assets folder, set when downloaded */
    file?: string;
    /** image file name inside the pack assets folder, set when downloaded */
    imageFile?: string;
}

export class PodcastRepository {
    constructor(public database: NSQLDatabase) {}

    async createTables() {
        await this.database.query(sql`
        CREATE TABLE IF NOT EXISTS "Podcast" (
            id INTEGER PRIMARY KEY NOT NULL,
            feedUrl TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT,
            author TEXT,
            image TEXT,
            link TEXT,
            language TEXT,
            keywords TEXT,
            lastRefresh INTEGER NOT NULL DEFAULT 0,
            packId TEXT
        );
        `);
        await this.database.query(sql`
        CREATE TABLE IF NOT EXISTS "PodcastEpisode" (
            id INTEGER PRIMARY KEY NOT NULL,
            podcastId INTEGER NOT NULL,
            guid TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            pubDate INTEGER NOT NULL DEFAULT 0,
            audioUrl TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            duration INTEGER NOT NULL DEFAULT 0,
            episodeNumber INTEGER,
            image TEXT,
            file TEXT,
            imageFile TEXT,
            UNIQUE (podcastId, guid)
        );
        `);
    }

    async listPodcasts(): Promise<PodcastWithCounts[]> {
        return this.database.query(sql`
        SELECT p.*,
            (SELECT COUNT(*) FROM PodcastEpisode e WHERE e.podcastId = p.id) AS episodeCount,
            (SELECT COUNT(*) FROM PodcastEpisode e WHERE e.podcastId = p.id AND e.file IS NOT NULL) AS downloadedCount
        FROM Podcast p
        ORDER BY p.title COLLATE NOCASE
        `);
    }

    async getPodcast(id: number): Promise<PodcastWithCounts | undefined> {
        const result: PodcastWithCounts[] = await this.database.query(sql`
        SELECT p.*,
            (SELECT COUNT(*) FROM PodcastEpisode e WHERE e.podcastId = p.id) AS episodeCount,
            (SELECT COUNT(*) FROM PodcastEpisode e WHERE e.podcastId = p.id AND e.file IS NOT NULL) AS downloadedCount
        FROM Podcast p
        WHERE p.id = ${id}
        `);
        return result[0];
    }

    async findPodcastByFeedUrl(feedUrl: string): Promise<Podcast | undefined> {
        const result: Podcast[] = await this.database.query(sql`SELECT * FROM Podcast WHERE feedUrl = ${feedUrl}`);
        return result[0];
    }

    async findPodcastByPackId(packId: string): Promise<Podcast | undefined> {
        const result: Podcast[] = await this.database.query(sql`SELECT * FROM Podcast WHERE packId = ${packId}`);
        return result[0];
    }

    async createPodcast(feedUrl: string, feed: Feed): Promise<number> {
        const { author, description, image, keywords, language, link, title } = feed.podcast;
        const id = Date.now();
        await this.database.insertAndGet(sql`
        INSERT INTO Podcast (id, feedUrl, title, description, author, image, link, language, keywords, lastRefresh)
        VALUES (${id}, ${feedUrl}, ${title}, ${description ?? null}, ${author ?? null}, ${image ?? null}, ${link ?? null}, ${language ?? null}, ${keywords ?? null}, ${Date.now()})
        `);
        return id;
    }

    /** refresh the feed level metadata. */
    async updatePodcastFromFeed(id: number, feed: Feed) {
        const { author, description, image, keywords, language, link, title } = feed.podcast;
        await this.database.insertAndGet(sql`
        UPDATE Podcast SET title = ${title}, description = ${description ?? null}, author = ${author ?? null}, image = ${image ?? null},
            link = ${link ?? null}, language = ${language ?? null}, keywords = ${keywords ?? null}, lastRefresh = ${Date.now()}
        WHERE id = ${id}
        `);
    }

    async setPodcastPackId(id: number, packId: string | null) {
        await this.database.insertAndGet(sql`UPDATE Podcast SET packId = ${packId} WHERE id = ${id}`);
    }

    async deletePodcast(id: number) {
        await this.database.insertAndGet(sql`DELETE FROM PodcastEpisode WHERE podcastId = ${id}`);
        await this.database.insertAndGet(sql`DELETE FROM Podcast WHERE id = ${id}`);
    }

    /** Inserts new episodes and updates the metadata of known ones (never touches the downloaded file). Returns the number of new episodes. */
    async upsertEpisodes(podcastId: number, episodes: FeedEpisode[]) {
        const known: { guid: string }[] = await this.database.query(sql`SELECT guid FROM PodcastEpisode WHERE podcastId = ${podcastId}`);
        const knownGuids = new Set(known.map((row) => row.guid));
        let created = 0;
        await this.database.db.transaction(async () => {
            for (const episode of episodes) {
                if (knownGuids.has(episode.guid)) {
                    await this.database.insertAndGet(sql`
                    UPDATE PodcastEpisode SET title = ${episode.title}, description = ${episode.description ?? null}, audioUrl = ${episode.audioUrl},
                        episodeNumber = ${episode.episodeNumber ?? null}, image = ${episode.image ?? null}
                    WHERE podcastId = ${podcastId} AND guid = ${episode.guid}
                    `);
                } else {
                    knownGuids.add(episode.guid);
                    created++;
                    await this.database.insertAndGet(sql`
                    INSERT INTO PodcastEpisode (podcastId, guid, title, description, pubDate, audioUrl, size, duration, episodeNumber, image)
                    VALUES (${podcastId}, ${episode.guid}, ${episode.title}, ${episode.description ?? null}, ${episode.pubDate}, ${episode.audioUrl},
                        ${episode.size}, ${episode.duration}, ${episode.episodeNumber ?? null}, ${episode.image ?? null})
                    `);
                }
            }
        });
        return created;
    }

    /** newest first. `search` filters on title. */
    async listEpisodes(podcastId: number, search?: string): Promise<PodcastEpisode[]> {
        if (search) {
            return this.database.query(sql`
            SELECT * FROM PodcastEpisode WHERE podcastId = ${podcastId} AND title LIKE ${'%' + search + '%'} ORDER BY pubDate DESC, id DESC
            `);
        }
        return this.database.query(sql`SELECT * FROM PodcastEpisode WHERE podcastId = ${podcastId} ORDER BY pubDate DESC, id DESC`);
    }

    async listDownloadedEpisodes(podcastId: number): Promise<PodcastEpisode[]> {
        return this.database.query(sql`SELECT * FROM PodcastEpisode WHERE podcastId = ${podcastId} AND file IS NOT NULL ORDER BY pubDate DESC, id DESC`);
    }

    async getEpisode(id: number): Promise<PodcastEpisode | undefined> {
        const result: PodcastEpisode[] = await this.database.query(sql`SELECT * FROM PodcastEpisode WHERE id = ${id}`);
        return result[0];
    }

    async setEpisodeDownloaded(id: number, data: { file: string; imageFile?: string; duration: number; size: number }) {
        await this.database.insertAndGet(sql`
        UPDATE PodcastEpisode SET file = ${data.file}, imageFile = ${data.imageFile ?? null}, duration = ${data.duration}, size = ${data.size} WHERE id = ${id}
        `);
    }

    async clearEpisodeDownloaded(id: number) {
        await this.database.insertAndGet(sql`UPDATE PodcastEpisode SET file = NULL, imageFile = NULL WHERE id = ${id}`);
    }

    async clearPodcastDownloaded(podcastId: number) {
        await this.database.insertAndGet(sql`UPDATE PodcastEpisode SET file = NULL, imageFile = NULL WHERE podcastId = ${podcastId}`);
    }
}
