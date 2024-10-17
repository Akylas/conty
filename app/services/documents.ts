import { ApplicationSettings, EventData, File, Folder, ImageCache, Observable, Utils, knownFolders, path } from '@nativescript/core';
import { isObject, isString } from '@nativescript/core/utils';
import SqlQuery from 'kiss-orm/dist/Queries/SqlQuery';
import CrudRepository from 'kiss-orm/dist/Repositories/CrudRepository';
import { IPack, IPackFolder, LuniiPack, Pack, PackFolder, Tag, TelmiPack } from '~/models/Pack';
import { getRealPath } from '~/utils';
import { EVENT_PACK_ADDED } from '~/utils/constants';
import NSQLDatabase from './NSQLDatabase';

export const sql = SqlQuery.createFromTemplateString;
export const FOLDERS_SEPARATOR = '&&&';
export const FOLDER_COLOR_SEPARATOR = '&&';

export interface PackAddedEventData extends EventData {
    pack: Pack;
    folder?: PackFolder;
}
export interface PackUpdatedEventData extends EventData {
    pack: Pack;
    updateModifiedDate: boolean;
}
export interface PackDeletedEventData extends EventData {
    packIds: string[];
}

export interface PackMovedFolderEventData extends EventData {
    object: Pack;
    folder?: PackFolder;
    oldFolder?: PackFolder;
}

export interface FolderUpdatedEventData extends EventData {
    folder: PackFolder;
}

export type DocumentEvents = PackAddedEventData | PackUpdatedEventData | PackDeletedEventData;

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
        return File.fromPath(path.join(folderPath, asset)).readText();
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

export class FolderRepository extends BaseRepository<PackFolder, IPackFolder> {
    constructor(database: NSQLDatabase) {
        super({
            database,
            table: 'Folder',
            primaryKey: 'id',
            model: PackFolder
        });
    }

    async createTables() {
        await this.database.query(sql`
        CREATE TABLE IF NOT EXISTS "Folder" (
            id BIGINT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            color TEXT
        );
        `);
        return this.applyMigrations();
    }

    findFolders() {
        return this.search({
            select: sql`f.*, 
COUNT(pf.pack_id) AS count`,
            from: sql`Folder f`,
            postfix: sql`
LEFT JOIN PacksFolders pf ON f.id = pf.folder_id
LEFT JOIN Pack p ON pf.pack_id = p.id
GROUP BY f.id;`
        });
    }
}

export class PackRepository extends BaseRepository<Pack, IPack> {
    constructor(
        private documentsService: DocumentsService,
        database: NSQLDatabase,
        public tagsRepository: TagRepository,
        public foldersRepository: FolderRepository
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
    `),
            this.database.query(sql`
CREATE TABLE IF NOT EXISTS "PacksFolders" (
    pack_id TEXT,
    folder_id TEXT,
    PRIMARY KEY(pack_id, folder_id),
    FOREIGN KEY(pack_id) REFERENCES Document(id) ON DELETE CASCADE,
    FOREIGN KEY(folder_id) REFERENCES Folder(id) ON DELETE CASCADE
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
        const { description, extra, folders, id, ...others } = data;
        // pack.createdDate = pack.modifiedDate = Date.now();
        DEV_LOG && console.log('createPack', id, folders, JSON.stringify(others), extra);
        const pack = await this.create(
            cleanUndefined({
                id: id || Date.now() + '',
                ...others,
                description: cleanHTML(description),
                extra: isObject(extra) ? JSON.stringify(extra) : extra
                // colors: Array.isArray(data.colors) ? JSON.stringify(data.colors) : data.colors
            })
        );
        if (folders) {
            for (let index = 0; index < folders.length; index++) {
                await pack.setFolder(folders[index], false);
            }
            pack.folders = folders;
        }
        this.documentsService.notify({ eventName: EVENT_PACK_ADDED, pack, folder: folders ? { name: folders[0] } : undefined } as PackAddedEventData);

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

    async findPacks({ filter, folder, omitThoseWithFolders = false, order = 'id DESC' }: { filter?: string; folder?: PackFolder; omitThoseWithFolders?: boolean; order?: string }) {
        const args = {
            select: new SqlQuery([
                `p.*,
            group_concat(f.name || CASE WHEN f.color IS NOT NULL THEN '${FOLDER_COLOR_SEPARATOR}' || f.color ELSE '' END, '${FOLDERS_SEPARATOR}') AS folders`
            ]),
            from: sql`Pack p`,
            orderBy: new SqlQuery([`p.${order}`]),
            groupBy: sql`p.id`
        } as any;

        const foldersPostfix = `LEFT JOIN 
    PacksFolders pf ON p.id = pf.pack_id
LEFT JOIN 
    Folder f ON pf.folder_id = f.id`;
        if (filter?.length || folder) {
            if (filter?.length) {
                const where = `p.name LIKE '%${filter}%' OR p.description LIKE '%${filter}%'`;
                if (folder) {
                    // args.postfix = sql` LEFT JOIN Page p ON p.pack_id = d.id `;
                    args.where = new SqlQuery([`pf.folder_id = ${folder.id} AND (${where})`]);
                } else {
                    // args.postfix = sql` LEFT JOIN Page p ON p.pack_id = d.id `;
                    args.where = new SqlQuery([where]);
                }
            } else {
                args.where = new SqlQuery([`pf.folder_id = ${folder.id}`]);
            }
            args.postfix = new SqlQuery((args.postfix ? [args.postfix] : []).concat([foldersPostfix]));
        } else if (omitThoseWithFolders) {
            args.select = sql`p.*`;
            args.from = sql`Pack p`;
            args.where = sql`p.id NOT IN(SELECT pack_id FROM PacksFolders)`;
            // args.postfix = foldersPostfix;
        }
        return this.search(args);
    }

    async createModelFromAttributes(attributes): Promise<Pack> {
        const { compressed, extra, folders, id, thumbnail, type, ...others } = attributes;
        const pack = type === 'telmi' ? new TelmiPack(id) : new LuniiPack(id);
        Object.assign(pack, {
            id,
            type,
            folders: typeof folders === 'string' ? folders.split('#$%') : folders,
            extra: isString(extra) ? JSON.parse(extra) : extra,
            compressed,
            ...others
        });
        // needs to be done after so that pack.folderPath get get correct using extra.subPaths
        pack.thumbnail = compressed ? thumbnail : path.join(pack.folderPath.path, thumbnail);
        return pack;
    }
}
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
    folderRepository: FolderRepository;

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
        const nonContentPath = getRealPath(this.realDataFolderPath, false);
        DEV_LOG && console.log('DocumentsService', 'start', this.id, !!db, this.realDataFolderPath, nonContentPath);
        this.dataFolder = Folder.fromPath(nonContentPath, false);
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
        this.folderRepository = new FolderRepository(this.db);
        this.packRepository = new PackRepository(this, this.db, this.tagRepository, this.folderRepository);
        await this.packRepository.createTables();
        await this.tagRepository.createTables();
        await this.folderRepository.createTables();

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

    async importStory(id: string, compressed: boolean, data: Partial<Pack> = {}, folder?: string) {
        DEV_LOG && console.log('importStory ', id, compressed, folder, JSON.stringify(data));
        return this.packRepository.createPack({
            id,
            compressed: compressed ? 1 : 0,
            importedDate: Date.now(),
            // title: storyJSON.title,
            ...data,
            thumbnail: data.thumbnail || 'thumbnail.png',
            ...(folder ? { folders: [folder] } : {})
        });
    }
}
export let documentsService: DocumentsService;
export function createSharedDocumentsService() {
    if (!documentsService) {
        documentsService = new DocumentsService();
    }
}
