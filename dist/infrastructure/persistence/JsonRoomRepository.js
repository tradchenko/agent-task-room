import fs from 'node:fs/promises';
import path from 'node:path';
function nowIso() {
    return new Date().toISOString();
}
export class JsonRoomRepository {
    storageFile;
    constructor(storageFile) {
        this.storageFile = storageFile;
    }
    async loadAll() {
        try {
            const payload = JSON.parse(await fs.readFile(this.storageFile, 'utf8'));
            return Array.isArray(payload.rooms) ? payload.rooms : [];
        }
        catch (error) {
            const nodeError = error;
            if (nodeError.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    async saveAll(rooms) {
        await fs.mkdir(path.dirname(this.storageFile), { recursive: true });
        const payload = {
            version: 1,
            savedAt: nowIso(),
            rooms,
        };
        const tempFile = `${this.storageFile}.${process.pid}.${Date.now()}.tmp`;
        // Сначала пишем во временный файл, затем атомарно переименовываем его,
        // чтобы не оставить битый JSON после внезапного завершения процесса.
        await fs.writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        await fs.rename(tempFile, this.storageFile);
    }
}
//# sourceMappingURL=JsonRoomRepository.js.map