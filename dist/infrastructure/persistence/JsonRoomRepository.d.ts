import type { RoomRepository } from '../../domain/room/RoomRepository.js';
import type { TaskRoom } from '../../domain/room/room-types.js';
export declare class JsonRoomRepository implements RoomRepository {
    private readonly storageFile;
    constructor(storageFile: string);
    loadAll(): Promise<TaskRoom[]>;
    saveAll(rooms: TaskRoom[]): Promise<void>;
}
