import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonRoomRepository } from '../../../src/infrastructure/persistence/JsonRoomRepository.js';
import { ROOM_STATUS, type TaskRoom } from '../../../src/domain/room/room-types.js';

const tempDirectories: string[] = [];

async function makeTempDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-task-room-'));
  tempDirectories.push(directory);
  return directory;
}

describe('JsonRoomRepository', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0, tempDirectories.length).map((directory) =>
        fs.rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('сохраняет комнаты в json и затем читает их обратно', async () => {
    const directory = await makeTempDir();
    const storageFile = path.join(directory, 'rooms.json');
    const repository = new JsonRoomRepository(storageFile);
    const room: TaskRoom = {
      roomId: 'room-1',
      title: 'Проверка json',
      taskInput: {
        taskDescription: 'Проверить roundtrip',
        jiraUrl: null,
        comment: 'Комментарий',
      },
      createdAt: '2026-04-20T00:00:00.000Z',
      updatedAt: '2026-04-20T00:00:00.000Z',
      status: ROOM_STATUS.OPEN,
      statusReason: 'Ожидается второй участник.',
      statusFingerprint: 'fingerprint',
      closedAt: null,
      closedBy: null,
      resolution: null,
      participants: {},
      messages: [],
      humanFeedback: [],
      nextSequence: 1,
      sharedPrompt: 'Prompt',
    };

    await repository.saveAll([room]);
    const restored = await repository.loadAll();

    expect(restored).toHaveLength(1);
    expect(restored[0]?.roomId).toBe('room-1');
    expect(restored[0]?.taskInput.comment).toBe('Комментарий');
  });

  it('если файла ещё нет, возвращает пустой список', async () => {
    const directory = await makeTempDir();
    const repository = new JsonRoomRepository(path.join(directory, 'rooms.json'));

    const restored = await repository.loadAll();

    expect(restored).toEqual([]);
  });
});
