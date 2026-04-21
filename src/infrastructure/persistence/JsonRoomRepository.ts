import fs from 'node:fs/promises';
import path from 'node:path';

import type { RoomRepository } from '../../domain/room/RoomRepository.js';
import type { PersistedRoomPayload, TaskRoom } from '../../domain/room/room-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class JsonRoomRepository implements RoomRepository {
  public constructor(private readonly storageFile: string) {}

  public async loadAll(): Promise<TaskRoom[]> {
    try {
      const payload = JSON.parse(await fs.readFile(this.storageFile, 'utf8')) as Partial<PersistedRoomPayload>;
      return Array.isArray(payload.rooms) ? payload.rooms : [];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  public async saveAll(rooms: TaskRoom[]): Promise<void> {
    await fs.mkdir(path.dirname(this.storageFile), { recursive: true });

    const payload: PersistedRoomPayload = {
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
