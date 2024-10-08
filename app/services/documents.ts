import { ApplicationSettings, EventData, File, Folder, ImageCache, Observable, Utils, knownFolders, path } from '@nativescript/core';
import SqlQuery from 'kiss-orm/dist/Queries/SqlQuery';
import CrudRepository from 'kiss-orm/dist/Repositories/CrudRepository';
import { IPack, LuniiPack, Pack, Tag, TelmiPack } from '~/models/Pack';
import { EVENT_PACK_ADDED, EVENT_PACK_DELETED } from '~/utils/constants';
import NSQLDatabase from './NSQLDatabase';
import { getRealPath } from '~/utils';
import { isObject, isString } from '@nativescript/core/utils';

const sql = SqlQuery.createFromTemplateString;

function cleanHTML(str: string) {
    return str?.replaceAll('&', '&amp;');
}

export async function getFileTextContentFromPackFile(folderPath, asset, compressed: boolean) {
    DEV_LOG && console.log('getFileTextContentFromPackFile', folderPath, asset, compressed);
    if (compressed) {
        return new Promise<string>((resolve, reject) => {
            try {
                com.akylas.conty.ZipMediaDataSource.readTextFromAsset(
                    Utils.android.getApplicationContext(),
                    folderPath,
                    asset,
                    'UTF-8',
                    new com.akylas.conty.ZipMediaDataSource.Callback({ onError: reject, onSuccess: resolve })
                );
            } catch (error) {
                console.error(error);
                reject(error);
            }
        });
    } else {
        return Folder.fromPath(folderPath).getFile(asset, false).readText();
        // return File.fromPath(path.join(folderPath, asset)).readText();
    }
}

// let dataFolder: Folder;

function cleanUndefined(obj) {
    Object.keys(obj).forEach(function (key) {
        if (typeof obj[key] === 'undefined') {
            delete obj[key];
        }
    });
    return obj;
}

export class BaseRepository<T, U = T, V = any> extends CrudRepository<T, U, V> {
    constructor(data) {
        super(data);
    }
    migrations = {
        // addGroupName: sql`ALTER TABLE Groups ADD COLUMN name TEXT`,
        // addGroupOnMap: sql`ALTER TABLE Groups ADD COLUMN onMap INTEGER`
    };
    async applyMigrations() {
        const migrations = this.migrations;
        if (!migrations) {
            return;
        }

        // For now disable it as we could have a issue if db is deleted while setting is kept
        // const settingsKey = `SQLITE_${this.table}_migrations`;
        // const appliedMigrations = JSON.parse(ApplicationSettings.getString(settingsKey, '[]'));

        // const actualMigrations = { ...migrations };
        // for (let index = 0; index < appliedMigrations.length; index++) {
        //     delete actualMigrations[appliedMigrations[index]];
        // }

        // const migrationKeys = Object.keys(migrations).filter((k) => appliedMigrations.indexOf(k) === -1);
        // for (let index = 0; index < migrationKeys.length; index++) {
        try {
            await this.database.migrate(migrations);
            // appliedMigrations.push(...Object.keys(migrations));
        } catch (error) {
            console.error(error, error.stack);
        }
        // }
        // ApplicationSettings.setString(settingsKey, JSON.stringify(appliedMigrations));
    }
}

export class TagRepository extends BaseRepository<Tag, Tag> {
    constructor(database: NSQLDatabase) {
        super({
            database,
            table: 'Tag',
            primaryKey: 'id',
            model: Tag
        });
    }

    async createTables() {
        await this.database.query(sql`
        CREATE TABLE IF NOT EXISTS "Tag" (
            id BIGINT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL
        );
        `);
        return this.applyMigrations();
    }
}

export class PackRepository extends BaseRepository<Pack, IPack> {
    constructor(
        private documentsService: DocumentsService,
        database: NSQLDatabase,
        public tagsRepository: TagRepository
    ) {
        super({
            database,
            table: 'Pack',
            primaryKey: 'id',
            model: Pack
        });
    }

    async createTables() {
        await Promise.all([
            this.database.query(sql`
            CREATE TABLE IF NOT EXISTS "Pack" (
                id TEXT PRIMARY KEY NOT NULL,
                importedDate BIGINT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
                createdDate BIGINT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
                modifiedDate BIGINT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
                title TEXT,
                description TEXT,
                thumbnail TEXT,
                uri TEXT,
                format TEXT,
                studio TEXT,
                authors TEXT,
                narrators TEXT,
                size INT,
                age INT,
                compressed INT,
                version INT
                );
        `),
            this.database.query(sql`
        CREATE TABLE IF NOT EXISTS "PacksTags" (
            pack_id TEXT,
            tag_id TEXT,
            PRIMARY KEY(pack_id, tag_id),
            FOREIGN KEY(pack_id) REFERENCES Pack(id) ON DELETE CASCADE,
            FOREIGN KEY(tag_id) REFERENCES Tag(id) ON DELETE CASCADE
        );
    `)
        ]);
        return this.applyMigrations();
    }

    migrations = Object.assign({
        addSubtitle: sql`ALTER TABLE Pack ADD COLUMN subtitle TEXT`,
        addKeywords: sql`ALTER TABLE Pack ADD COLUMN keywords TEXT`,
        addType: sql`ALTER TABLE Pack ADD COLUMN type TEXT`,
        addExtra: sql`ALTER TABLE Pack ADD COLUMN extra TEXT`
        // addColors: sql`ALTER TABLE Pack ADD COLUMN colors TEXT`
    });

    async createPack(data: Partial<Pack>) {
        const { extra, id, description, ...others } = data;
        // pack.createdDate = pack.modifiedDate = Date.now();
        DEV_LOG && console.log('createPack', id, JSON.stringify(others), extra);
        const pack = await this.create(
            cleanUndefined({
                id: id || Date.now() + '',
                ...others,
                description: cleanHTML(description),
                extra: isObject(extra) ? JSON.stringify(extra) : extra
                // colors: Array.isArray(data.colors) ? JSON.stringify(data.colors) : data.colors
            })
        );
        this.documentsService.notify({ eventName: EVENT_PACK_ADDED, pack } as PackAddedEventData);

        return pack;
    }

    async loadTagsRelationship(pack: Pack): Promise<Pack> {
        const tags = await this.tagsRepository.search({
            where: sql`
            "id" IN (
                SELECT "tag_id"
                FROM "PacksTags"
                WHERE "pack_id" = ${pack.id}
            )
        `
        });
        pack.tags = tags.map((g) => g.id);
        return pack;
    }

    async update(pack: Pack, data?: Partial<Pack>, updateModifiedDate = true) {
        // DEV_LOG && console.log('doc update', data);
        if (!data) {
            const toUpdate: Partial<Pack> = {};
            // if (updateModifiedDate) {
            //     toUpdate.modifiedDate = Date.now();
            // }
            await this.update(pack, toUpdate);
            return pack;
        }
        // if (updateModifiedDate && !data.modifiedDate) {
        //     data.modifiedDate = Date.now();
        // }
        const toSave: Partial<Document> = {};
        const toUpdate: any = {};
        Object.keys(data).forEach((k) => {
            const value = data[k];
            toSave[k] = value;
            if (typeof value === 'object' || Array.isArray(value)) {
                toUpdate[k] = JSON.stringify(value);
            } else {
                toUpdate[k] = value;
            }
        });

        await super.update(pack, toUpdate);
        Object.assign(pack, toSave);
        return pack;
    }
    async addTag(pack: Pack, tagId: string) {
        try {
            let tag;
            try {
                tag = await this.tagsRepository.get(tagId);
            } catch (error) {}
            // console.log('addGroupToItem', group);
            if (!tag) {
                tag = await this.tagsRepository.create({ id: tagId, title: tagId });
            }
            const relation = await this.database.query(sql` SELECT * FROM PacksTags WHERE "pack_id" = ${pack.id} AND "tag_id" = ${tagId}`);
            if (relation.length === 0) {
                await this.database.query(sql` INSERT INTO PacksTags ( pack_id, tag_id ) VALUES(${pack.id}, ${tagId})`);
            }
            pack.tags = pack.tags || [];
            pack.tags.push(tagId);
        } catch (error) {
            console.error(error, error.stack);
        }
    }

    async getItem(itemId: string) {
        const element = await this.get(itemId);
        return element;
    }
    async search(args: { postfix?: SqlQuery; select?: SqlQuery; where?: SqlQuery; orderBy?: SqlQuery }) {
        const result = await super.search({ ...args /* , postfix: sql`d LEFT JOIN PAGE p on p.pack_id = d.id` */ });
        return result;
    }

    async createModelFromAttributes(attributes: Required<any> | Pack): Promise<Pack> {
        const { id, type, thumbnail, compressed, extra, ...others } = attributes;
        const pack = type === 'telmi' ? new TelmiPack(id) : new LuniiPack(id);
        Object.assign(pack, {
            id,
            type,
            extra: isString(extra) ? JSON.parse(extra) : extra,
            compressed,
            ...others
        });
        // needs to be done after so that pack.folderPath get get correct using extra.subPaths
        pack.thumbnail = compressed ? thumbnail : pack.folderPath.getFile(thumbnail, false).path;
        return pack;
    }
}

export interface PackAddedEventData extends EventData {
    pack: Pack;
}
export interface PackUpdatedEventData extends EventData {
    pack: Pack;
    updateModifiedDate: boolean;
}
export interface PackDeletedEventData extends EventData {
    packIds: string[];
}

export type DocumentEvents = PackAddedEventData | PackUpdatedEventData | PackDeletedEventData;

let ID = 0;
export class DocumentsService extends Observable {
    imageCache: ImageCache;

    static DB_NAME = 'db.sqlite';
    static DB_VERSION = 1;
    realDataFolderPath: string;
    rootDataFolder: string;
    dataFolder: Folder;
    id: number;
    // connection: Connection;
    started = false;
    db: NSQLDatabase;
    packRepository: PackRepository;
    tagRepository: TagRepository;

    constructor(withCache = true) {
        super();
        if (withCache) {
            this.imageCache = new ImageCache();
        }
        this.id = ID++;
    }
    async start(db?) {
        if (this.started) {
            return;
        }
        let rootDataFolder;
        if (__ANDROID__) {
            rootDataFolder = ApplicationSettings.getString('root_data_folder');
            if (rootDataFolder && !Folder.exists(rootDataFolder)) {
                rootDataFolder = null;
                ApplicationSettings.remove('root_data_folder');
            }
            if (!rootDataFolder) {
                rootDataFolder = knownFolders.externalDocuments().path;
                ApplicationSettings.setString('root_data_folder', rootDataFolder);
            }
        } else {
            // on iOS we cant store any knownFolders cause their path can change upon app upgrade
            rootDataFolder = knownFolders.externalDocuments().path;
        }
        this.rootDataFolder = rootDataFolder;
        this.realDataFolderPath = ApplicationSettings.getString('data_folder', path.join(rootDataFolder, 'data'));
        DEV_LOG && console.log('DocumentsService', 'start', this.id, !!db, this.realDataFolderPath);
        this.dataFolder = Folder.fromPath(getRealPath(this.realDataFolderPath, true));
        if (db) {
            this.db = new NSQLDatabase(db, {
                // for now it breaks
                // threading: true,
                transformBlobs: false
            } as any);
        } else {
            const filePath = path.join(rootDataFolder, DocumentsService.DB_NAME);
            DEV_LOG && console.log('DocumentsService', 'dbFileName', filePath, File.exists(filePath));

            this.db = new NSQLDatabase(filePath, {
                // for now it breaks
                // threading: true,
                transformBlobs: false
            } as any);
        }

        this.tagRepository = new TagRepository(this.db);
        this.packRepository = new PackRepository(this, this.db, this.tagRepository);
        await this.packRepository.createTables();
        await this.tagRepository.createTables();

        this.notify({ eventName: 'started' });
        this.started = true;
    }
    stop() {
        DEV_LOG && console.log('DocumentsService stop');
        if (!this.started) {
            return;
        }
        this.started = false;
        this.db && this.db.disconnect();
    }

    get supportsCompressedData() {
        return false;
    }

    async importStory(id: string, compressed: boolean, data: Partial<Pack> = {}) {
        DEV_LOG && console.log('importStory ', id, compressed, JSON.stringify(data));
        return this.packRepository.createPack({
            id,
            compressed: compressed ? 1 : 0,
            importedDate: Date.now(),
            // title: storyJSON.title,
            ...data,
            thumbnail: data.thumbnail || 'thumbnail.png'
        });
    }
}
export let documentsService: DocumentsService;
export function createSharedDocumentsService() {
    if (!documentsService) {
        documentsService = new DocumentsService();
    }
}
