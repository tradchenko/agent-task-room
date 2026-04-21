import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RoomService } from '../../../src/domain/room/RoomService.js';
import { JsonRoomRepository } from '../../../src/infrastructure/persistence/JsonRoomRepository.js';
import { TaskRoomHttpServer } from '../../../src/infrastructure/http/TaskRoomHttpServer.js';

describe('TaskRoomHttpServer', () => {
  let tempDirectory: string;
  let server: TaskRoomHttpServer;
  let roomService: RoomService;
  let roomId = '';

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-task-room-server-'));
    const repository = new JsonRoomRepository(path.join(tempDirectory, 'rooms.json'));
    roomService = new RoomService(repository);
    await roomService.load();

    const opened = await roomService.openRoom({
      title: 'Проверка HTTP сервера',
      taskDescription: 'Проверить health и human message',
      initiatorId: 'host-agent',
    });

    roomId = opened.roomId;

    await roomService.joinRoom({
      roomId,
      participantId: 'peer-agent',
    });

    server = new TaskRoomHttpServer({
      host: '127.0.0.1',
      port: 0,
      mcpPath: '/mcp',
      sharedToken: 'secret-token',
      storageFile: path.join(tempDirectory, 'rooms.json'),
      roomService,
    });

    await server.start();
  });

  afterEach(async () => {
    await server?.stop();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  it('отдаёт health-ответ', async () => {
    const response = await fetch(`${server.baseUrl}/health`);
    const payload = (await response.json()) as { ok: boolean; service: string; serverPid?: number };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.service).toBe('agent-task-room');
    expect(payload.serverPid).toBeTypeOf('number');
  });

  it('объясняет назначение MCP endpoint при GET-запросе', async () => {
    const response = await fetch(`${server.baseUrl}/mcp?token=secret-token`);
    const payload = (await response.json()) as { ok: boolean; kind: string; message: string };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.kind).toBe('mcp-endpoint');
    expect(payload.message).toContain('MCP endpoint');
  });

  it('не даёт писать в api без токена', async () => {
    const response = await fetch(`${server.baseUrl}/api/rooms/${roomId}/human-message`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        humanLabel: 'Lead',
        title: 'Без токена',
        body: 'Это сообщение должно быть отклонено.',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('сохраняет human message через api при наличии токена', async () => {
    const messageResponse = await fetch(`${server.baseUrl}/api/rooms/${roomId}/human-message`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret-token',
      },
      body: JSON.stringify({
        humanLabel: 'Lead',
        title: 'Сообщение из UI',
        body: 'Нужно отдельно проверить итоговые риски.',
        references: ['TASK-42'],
      }),
    });

    expect(messageResponse.status).toBe(200);

    const updatesResponse = await fetch(`${server.baseUrl}/api/rooms/${roomId}/updates?afterSequence=0&limit=50`, {
      headers: {
        authorization: 'Bearer secret-token',
      },
    });
    const updatesPayload = (await updatesResponse.json()) as { updates: Array<{ kind: string; body: string }> };
    const lastUpdate = updatesPayload.updates.at(-1);

    expect(lastUpdate?.kind).toBe('human_note');
    expect(lastUpdate?.body).toContain('итоговые риски');
  });

  it('сохраняет human artifact и decision log через api при наличии токена', async () => {
    const artifactResponse = await fetch(`${server.baseUrl}/api/rooms/${roomId}/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret-token',
      },
      body: JSON.stringify({
        humanLabel: 'Lead',
        kind: 'github_pr',
        title: 'PR с предложенным исправлением',
        uri: 'https://github.com/example/repo/pull/42',
        summary: 'Нужно перепроверить риски перед merge.',
        tags: ['github', 'review'],
      }),
    });

    const decisionResponse = await fetch(`${server.baseUrl}/api/rooms/${roomId}/decisions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret-token',
      },
      body: JSON.stringify({
        humanLabel: 'Lead',
        title: 'Сначала перепроверить миграцию',
        summary: 'Без этого решение рано подтверждать.',
        rationale: 'Нужно сверить rollout plan и риски отката.',
        status: 'proposed',
        references: ['DEC-42'],
      }),
    });

    expect(artifactResponse.status).toBe(200);
    expect(decisionResponse.status).toBe(200);

    const roomResponse = await fetch(`${server.baseUrl}/api/rooms/${roomId}`, {
      headers: {
        authorization: 'Bearer secret-token',
      },
    });
    const roomPayload = (await roomResponse.json()) as {
      room: {
        artifacts: Array<{ kind: string; title: string }>;
        decisionLog: Array<{ title: string; status: string }>;
      };
    };

    expect(roomPayload.room.artifacts.some((artifact) => artifact.kind === 'github_pr')).toBe(true);
    expect(roomPayload.room.decisionLog.some((decision) => decision.status === 'proposed')).toBe(true);
  });

  it('позволяет второму участнику войти в комнату через http invite endpoint', async () => {
    const response = await fetch(`${server.baseUrl}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret-token',
      },
      body: JSON.stringify({
        participantId: 'browser-peer',
        participantLabel: 'Browser Peer',
        role: 'peer',
      }),
    });

    const payload = (await response.json()) as {
      room: {
        participants: Array<{ participantId: string; label: string; role: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(
      payload.room.participants.some(
        (participant) =>
          participant.participantId === 'browser-peer' &&
          participant.label === 'Browser Peer' &&
          participant.role === 'peer',
      ),
    ).toBe(true);
  });

  it('отдаёт отдельный ui-ассет и главная страница ссылается на него', async () => {
    const htmlResponse = await fetch(`${server.baseUrl}/`);
    const html = await htmlResponse.text();
    const assetResponse = await fetch(`${server.baseUrl}/assets/task-room-ui.js`);
    const assetBody = await assetResponse.text();

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('/assets/task-room-ui.js');
    expect(html).toContain('quickActionRequestContextButton');
    expect(html).toContain('quickActionCopyJoinCommandButton');
    expect(assetResponse.status).toBe(200);
    expect(assetBody).toContain('class TaskRoomBrowserApp');
  });

  it('отдаёт join-страницу для браузерного invite flow', async () => {
    const response = await fetch(`${server.baseUrl}/join/${roomId}?token=secret-token`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="invitePanel"');
    expect(html).toContain('id="joinRoomButton"');
    expect(html).toContain('id="humanStepsList"');
  });

  it('отдаёт поиск по комнатам и unified history через api', async () => {
    await roomService.postHumanMessage({
      roomId,
      humanLabel: 'Lead',
      title: 'Проверить rollout plan',
      body: 'Нужно синхронизировать feature flag rollout между проектами.',
      references: ['TASK-HISTORY-1'],
    });

    await roomService.addArtifact({
      roomId,
      humanLabel: 'Lead',
      kind: 'github_issue',
      title: 'Issue с rollout деталями',
      uri: 'https://github.com/example/repo/issues/77',
      summary: 'Тут собраны внешние риски.',
      tags: ['rollout', 'risk'],
    });

    await roomService.recordDecision({
      roomId,
      humanLabel: 'Lead',
      title: 'Сначала перепроверить rollout',
      summary: 'Иначе human confirmation будет преждевременным.',
      rationale: 'Нужно согласовать риск-профиль.',
      status: 'proposed',
      references: ['DEC-HISTORY-1'],
    });

    const searchResponse = await fetch(`${server.baseUrl}/api/rooms/search?q=feature%20flag&limit=10`, {
      headers: {
        authorization: 'Bearer secret-token',
      },
    });
    const historyResponse = await fetch(`${server.baseUrl}/api/rooms/${roomId}/history?limit=20`, {
      headers: {
        authorization: 'Bearer secret-token',
      },
    });

    const searchPayload = (await searchResponse.json()) as {
      rooms: Array<{ roomId: string; snippet: string | null }>;
    };
    const historyPayload = (await historyResponse.json()) as {
      entries: Array<{ entryType: string; title: string | null }>;
    };

    expect(searchResponse.status).toBe(200);
    expect(searchPayload.rooms.some((room) => room.roomId === roomId)).toBe(true);
    expect(searchPayload.rooms[0]?.snippet).toContain('feature flag');

    expect(historyResponse.status).toBe(200);
    expect(historyPayload.entries.some((entry) => entry.entryType === 'message')).toBe(true);
    expect(historyPayload.entries.some((entry) => entry.entryType === 'artifact')).toBe(true);
    expect(historyPayload.entries.some((entry) => entry.entryType === 'decision')).toBe(true);
  });
});
