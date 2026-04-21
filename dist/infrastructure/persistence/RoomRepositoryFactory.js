import fs from 'node:fs';
import path from 'node:path';
import { JsonRoomRepository } from './JsonRoomRepository.js';
import { SqliteRoomRepository } from './SqliteRoomRepository.js';
export function inferStorageBackend(storageFile, explicitBackend) {
    if (explicitBackend) {
        return explicitBackend;
    }
    const extension = path.extname(storageFile).toLowerCase();
    if (extension === '.sqlite' || extension === '.db') {
        return 'sqlite';
    }
    return 'json';
}
export async function createRoomRepository(options) {
    const storageMode = inferStorageBackend(options.storageFile, options.backend);
    if (storageMode === 'json') {
        return {
            repository: new JsonRoomRepository(options.storageFile),
            storageMode,
        };
    }
    const repository = new SqliteRoomRepository(options.storageFile);
    const legacyJsonFile = options.legacyJsonFile ?? path.join(path.dirname(options.storageFile), 'rooms.json');
    if (!fs.existsSync(options.storageFile) && legacyJsonFile !== options.storageFile && fs.existsSync(legacyJsonFile)) {
        const legacyRooms = await new JsonRoomRepository(legacyJsonFile).loadAll();
        if (legacyRooms.length > 0) {
            await repository.saveAll(legacyRooms);
        }
    }
    return {
        repository,
        storageMode,
    };
}
//# sourceMappingURL=RoomRepositoryFactory.js.map