import type { RoomRepository, SearchableRoomRepository } from '../../domain/room/RoomRepository.js';
import type { RoomHistoryEntry, RoomSearchResult, SearchRoomsInput, TaskRoom } from '../../domain/room/room-types.js';
export declare class SqliteRoomRepository implements RoomRepository, SearchableRoomRepository {
    private readonly storageFile;
    constructor(storageFile: string);
    loadAll(): Promise<TaskRoom[]>;
    saveAll(rooms: TaskRoom[]): Promise<void>;
    searchRooms(input: SearchRoomsInput): Promise<{
        rooms: RoomSearchResult[];
    }>;
    getRoomHistory(roomId: string, limit?: number): Promise<{
        entries: RoomHistoryEntry[];
    }>;
    private withDatabase;
    private ensureSchema;
    private normalizeLimit;
    private parseReferences;
    private buildSearchText;
    private buildSearchResult;
    private collectSearchSources;
    private buildHistoryEntries;
    private resolveHistoryAuthorLabel;
    private buildSnippet;
}
