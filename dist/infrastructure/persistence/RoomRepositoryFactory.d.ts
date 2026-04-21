import type { RoomRepository } from '../../domain/room/RoomRepository.js';
export type StorageBackend = 'json' | 'sqlite';
export interface RoomRepositoryFactoryOptions {
    storageFile: string;
    backend?: StorageBackend;
    legacyJsonFile?: string;
}
export interface CreatedRoomRepository {
    repository: RoomRepository;
    storageMode: StorageBackend;
}
export declare function inferStorageBackend(storageFile: string, explicitBackend?: StorageBackend): StorageBackend;
export declare function createRoomRepository(options: RoomRepositoryFactoryOptions): Promise<CreatedRoomRepository>;
