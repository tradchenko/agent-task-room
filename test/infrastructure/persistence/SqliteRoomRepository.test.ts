import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ROOM_STATUS, type TaskRoom } from '../../../src/domain/room/room-types.js';
import { SqliteRoomRepository } from '../../../src/infrastructure/persistence/SqliteRoomRepository.js';

const tempDirectories: string[] = [];

async function makeTempDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-task-room-sqlite-'));
  tempDirectories.push(directory);
  return directory;
}

function buildRoom(roomId: string, overrides?: Partial<TaskRoom>): TaskRoom {
  return {
    roomId,
    title: `Комната ${roomId}`,
    taskInput: {
      taskDescription: 'Нужно синхронизировать feature flag rollout и API контракт.',
      jiraUrl: null,
      comment: 'Есть внешние артефакты и решения.',
    },
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    status: ROOM_STATUS.ACTIVE_DISCUSSION,
    statusReason: 'Идёт обсуждение.',
    statusFingerprint: 'fp',
    closedAt: null,
    closedBy: null,
    resolution: null,
    participants: {},
    messages: [
      {
        sequence: 1,
        authorType: 'human',
        authorId: 'Lead',
        kind: 'human_note',
        title: 'Проверить rollout',
        body: 'Нужно перепроверить feature flag rollout.',
        references: ['TASK-1'],
        createdAt: '2026-04-21T00:01:00.000Z',
      },
    ],
    humanFeedback: [],
    artifacts: [
      {
        artifactId: 'artifact-1',
        kind: 'github_pr',
        title: 'PR с rollout plan',
        uri: 'https://github.com/example/repo/pull/77',
        summary: 'Содержит proposed rollout plan.',
        content: null,
        tags: ['rollout', 'feature-flag'],
        authorType: 'participant',
        authorId: 'host-agent',
        authorLabel: 'Host Agent',
        createdAt: '2026-04-21T00:02:00.000Z',
        updatedAt: '2026-04-21T00:02:00.000Z',
      },
    ],
    decisionLog: [
      {
        decisionId: 'decision-1',
        title: 'Сначала перепроверить rollout',
        summary: 'Без этого human confirmation преждевременен.',
        rationale: 'Нужно согласовать risk profile.',
        references: ['DEC-1'],
        status: 'proposed',
        authorType: 'participant',
        authorId: 'peer-agent',
        authorLabel: 'Peer Agent',
        createdAt: '2026-04-21T00:03:00.000Z',
        updatedAt: '2026-04-21T00:03:00.000Z',
      },
    ],
    nextSequence: 2,
    sharedPrompt: 'Prompt',
    ...overrides,
  };
}

describe('SqliteRoomRepository', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0, tempDirectories.length).map((directory) =>
        fs.rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('сохраняет комнаты в sqlite и затем читает их обратно', async () => {
    const directory = await makeTempDir();
    const storageFile = path.join(directory, 'rooms.sqlite');
    const repository = new SqliteRoomRepository(storageFile);

    await repository.saveAll([buildRoom('room-1')]);
    const restored = await repository.loadAll();

    expect(restored).toHaveLength(1);
    expect(restored[0]?.roomId).toBe('room-1');
    expect(restored[0]?.artifacts[0]?.kind).toBe('github_pr');
    expect(restored[0]?.decisionLog[0]?.status).toBe('proposed');
  });

  it('умеет искать комнаты и отдавать unified history', async () => {
    const directory = await makeTempDir();
    const storageFile = path.join(directory, 'rooms.sqlite');
    const repository = new SqliteRoomRepository(storageFile);

    await repository.saveAll([
      buildRoom('room-1'),
      buildRoom('room-2', {
        title: 'Другая комната',
        taskInput: {
          taskDescription: 'Проверить другой кейс',
          jiraUrl: null,
          comment: null,
        },
        messages: [],
        artifacts: [],
        decisionLog: [],
      }),
    ]);

    const search = await repository.searchRooms({
      query: 'feature flag rollout',
      status: ROOM_STATUS.ACTIVE_DISCUSSION,
      limit: 10,
    });
    const history = await repository.getRoomHistory('room-1', 10);

    expect(search.rooms).toHaveLength(1);
    expect(search.rooms[0]?.roomId).toBe('room-1');
    expect(search.rooms[0]?.snippet).toContain('feature flag');

    expect(history.entries).toHaveLength(3);
    expect(history.entries[0]?.entryType).toBe('decision');
    expect(history.entries.some((entry) => entry.entryType === 'artifact')).toBe(true);
    expect(history.entries.some((entry) => entry.entryType === 'message')).toBe(true);
  });

  it('ищет по participant context и human feedback и сохраняет label участника в history', async () => {
    const directory = await makeTempDir();
    const storageFile = path.join(directory, 'rooms.sqlite');
    const repository = new SqliteRoomRepository(storageFile);

    await repository.saveAll([
      buildRoom('room-context', {
        participants: {
          'host-agent': {
            participantId: 'host-agent',
            role: 'initiator',
            label: 'Host Agent',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
            context: {
              systemScope: 'billing-api',
              summary: 'Исследую refresh queue и потерю токена после race condition.',
              constraints: ['Нельзя менять внешний контракт ответа'],
              artifacts: ['LOG-REFRESH-1'],
              confidence: 'high',
              updatedAt: '2026-04-21T00:00:00.000Z',
            },
            finalPosition: null,
          },
        },
        messages: [
          {
            sequence: 1,
            authorType: 'participant',
            authorId: 'host-agent',
            kind: 'finding',
            title: 'Нашёл расхождение',
            body: 'Refresh queue теряет токен после повторного запроса.',
            references: ['LOG-REFRESH-1'],
            createdAt: '2026-04-21T00:01:00.000Z',
          },
        ],
        humanFeedback: [
          {
            verdict: 'keep_session_active',
            comment: 'Нужен отдельный анализ refresh queue перед подтверждением.',
            humanLabel: 'Lead',
            createdAt: '2026-04-21T00:04:00.000Z',
          },
        ],
        artifacts: [],
        decisionLog: [],
        nextSequence: 2,
      }),
    ]);

    const participantSearch = await repository.searchRooms({
      query: 'race condition',
      limit: 10,
    });
    const humanFeedbackSearch = await repository.searchRooms({
      query: 'анализ refresh queue',
      limit: 10,
    });
    const history = await repository.getRoomHistory('room-context', 10);
    const participantMessage = history.entries.find((entry) => entry.kind === 'finding');

    expect(participantSearch.rooms).toHaveLength(1);
    expect(participantSearch.rooms[0]?.roomId).toBe('room-context');
    expect(participantSearch.rooms[0]?.matchSource).toContain('participant');

    expect(humanFeedbackSearch.rooms).toHaveLength(1);
    expect(humanFeedbackSearch.rooms[0]?.roomId).toBe('room-context');
    expect(humanFeedbackSearch.rooms[0]?.matchSource).toContain('human_feedback');

    expect(participantMessage?.authorLabel).toBe('Host Agent');
  });

  it('переживает сохранение legacy room без новых коллекций', async () => {
    const directory = await makeTempDir();
    const storageFile = path.join(directory, 'rooms.sqlite');
    const repository = new SqliteRoomRepository(storageFile);

    const legacyRoom = {
      roomId: 'legacy-room',
      title: 'Legacy room',
      taskInput: {
        taskDescription: 'Старый snapshot без artifacts и decision log',
        jiraUrl: null,
        comment: null,
      },
      createdAt: '2026-04-20T18:30:36.340Z',
      updatedAt: '2026-04-20T18:30:36.341Z',
      status: ROOM_STATUS.OPEN,
      statusReason: 'Ожидается подключение второго участника.',
      statusFingerprint: '{"status":"OPEN","reason":"Ожидается подключение второго участника."}',
      closedAt: null,
      closedBy: null,
      resolution: null,
      participants: {
        host: {
          participantId: 'host',
          role: 'initiator',
          label: 'Host',
          createdAt: '2026-04-20T18:30:36.340Z',
          updatedAt: '2026-04-20T18:30:36.340Z',
          context: null,
          finalPosition: null,
        },
      },
      messages: [
        {
          sequence: 1,
          authorType: 'system',
          authorId: 'system',
          kind: 'system_note',
          title: 'Комната создана',
          body: 'Старый snapshot.',
          references: [],
          createdAt: '2026-04-20T18:30:36.340Z',
        },
      ],
      humanFeedback: [],
      nextSequence: 2,
      sharedPrompt: 'Legacy prompt',
    } as unknown as TaskRoom;

    await expect(repository.saveAll([legacyRoom])).resolves.toBeUndefined();

    const restored = await repository.loadAll();

    expect(restored).toHaveLength(1);
    expect(restored[0]?.roomId).toBe('legacy-room');
  });
});
