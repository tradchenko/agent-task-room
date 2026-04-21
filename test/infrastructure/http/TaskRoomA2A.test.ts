import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ClientFactory, ClientFactoryOptions, DefaultAgentCardResolver, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import type { AgentCard, DataPart, Message, Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RoomService } from '../../../src/domain/room/RoomService.js';
import { TaskRoomHttpServer } from '../../../src/infrastructure/http/TaskRoomHttpServer.js';
import { JsonRoomRepository } from '../../../src/infrastructure/persistence/JsonRoomRepository.js';

function createAuthorizedFetch(token: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers ?? {});
    headers.set('authorization', `Bearer ${token}`);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

function getDataPart(message: Message): DataPart | undefined {
  return message.parts.find((part): part is DataPart => part.kind === 'data');
}

function getArtifactDataPart(event: TaskArtifactUpdateEvent): DataPart | undefined {
  return event.artifact.parts.find((part): part is DataPart => part.kind === 'data');
}

async function waitFor<T>(
  checker: () => T | null | undefined | Promise<T | null | undefined>,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await checker();

    if (result) {
      return result;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error('Не удалось дождаться ожидаемого результата.');
}

describe('TaskRoomHttpServer A2A', () => {
  let tempDirectory: string;
  let server: TaskRoomHttpServer;
  let roomService: RoomService;
  let roomId: string;
  let latestSequence: number;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-task-room-a2a-'));
    const repository = new JsonRoomRepository(path.join(tempDirectory, 'rooms.json'));
    roomService = new RoomService(repository);
    await roomService.load();

    const opened = await roomService.openRoom({
      title: 'A2A исходная комната',
      taskDescription: 'Проверить discovery и message/send',
      initiatorId: 'host-agent',
    });
    roomId = opened.roomId;
    latestSequence = (await roomService.getRoomUpdates(roomId, 0, 100)).latestSequence;

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

  it('отдаёт agent card с A2A endpoint-ами', async () => {
    const response = await fetch(`${server.baseUrl}/.well-known/agent-card.json`, {
      headers: {
        authorization: 'Bearer secret-token',
      },
    });
    const card = (await response.json()) as AgentCard;

    expect(response.status).toBe(200);
    expect(card.name).toBe('agent-task-room');
    expect(card.preferredTransport).toBe('JSONRPC');
    expect(card.url).toBe(`${server.baseUrl}/a2a/jsonrpc`);
    expect(card.additionalInterfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transport: 'JSONRPC',
          url: `${server.baseUrl}/a2a/jsonrpc`,
        }),
        expect.objectContaining({
          transport: 'HTTP+JSON',
          url: `${server.baseUrl}/a2a/rest`,
        }),
      ]),
    );
  });

  it('принимает типизированную команду open_room через A2A sendMessage', async () => {
    const authFetch = createAuthorizedFetch('secret-token');
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl: authFetch })],
        cardResolver: new DefaultAgentCardResolver({ fetchImpl: authFetch }),
      }),
    );
    const client = await factory.createFromUrl(server.baseUrl);
    const result = await client.sendMessage({
      message: {
        messageId: 'msg-open-room',
        role: 'user',
        kind: 'message',
        parts: [
          {
            kind: 'data',
            data: {
              kind: 'task-room-command',
              command: 'open_room',
              payload: {
                title: 'Комната через A2A',
                taskDescription: 'Нужно открыть комнату командой протокола',
                initiatorId: 'a2a-agent',
                initiatorRole: 'reviewer',
              },
            },
          },
        ],
      },
    });

    expect(result.kind).toBe('message');

    const message = result as Message;
    const dataPart = getDataPart(message);

    expect(dataPart?.data).toMatchObject({
      kind: 'task-room-result',
      command: 'open_room',
      ok: true,
      result: {
        status: 'OPEN',
      },
    });

    const rooms = await roomService.listRooms();

    expect(rooms.rooms).toHaveLength(2);
    expect(rooms.rooms.some((room) => room.title === 'Комната через A2A')).toBe(true);
  });

  it('сохраняет artifact и decision log через A2A sendMessage', async () => {
    const authFetch = createAuthorizedFetch('secret-token');
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl: authFetch })],
        cardResolver: new DefaultAgentCardResolver({ fetchImpl: authFetch }),
      }),
    );
    const client = await factory.createFromUrl(server.baseUrl);

    const artifactResult = await client.sendMessage({
      message: {
        messageId: 'msg-add-artifact',
        role: 'user',
        kind: 'message',
        parts: [
          {
            kind: 'data',
            data: {
              kind: 'task-room-command',
              command: 'add_artifact',
              payload: {
                roomId,
                participantId: 'host-agent',
                kind: 'github_pr',
                title: 'PR с proposed fix',
                uri: 'https://github.com/example/repo/pull/77',
                summary: 'Описывает предлагаемое исправление и риски.',
                tags: ['github', 'pr'],
                references: ['PR-77'],
              },
            },
          },
        ],
      },
    });

    const decisionResult = await client.sendMessage({
      message: {
        messageId: 'msg-record-decision',
        role: 'user',
        kind: 'message',
        parts: [
          {
            kind: 'data',
            data: {
              kind: 'task-room-command',
              command: 'record_decision',
              payload: {
                roomId,
                participantId: 'host-agent',
                title: 'Сначала перепроверить PR',
                summary: 'Перед подтверждением решения оба участника должны сверить rollout plan.',
                rationale: 'Иначе остаётся риск расхождения между проектами.',
                status: 'proposed',
                references: ['DEC-77'],
              },
            },
          },
        ],
      },
    });

    expect(getDataPart(artifactResult as Message)?.data).toMatchObject({
      kind: 'task-room-result',
      command: 'add_artifact',
      ok: true,
    });
    expect(getDataPart(decisionResult as Message)?.data).toMatchObject({
      kind: 'task-room-result',
      command: 'record_decision',
      ok: true,
    });

    const overview = await roomService.getRoomOverview(roomId);

    expect(overview.room.artifacts.some((artifact) => artifact.kind === 'github_pr')).toBe(true);
    expect(overview.room.decisionLog.some((decision) => decision.title === 'Сначала перепроверить PR')).toBe(true);
  });

  it('ищет комнаты и отдаёт unified history через A2A sendMessage', async () => {
    await roomService.postHumanMessage({
      roomId,
      humanLabel: 'Lead',
      body: 'Нужно перепроверить feature flag rollout.',
    });

    await roomService.recordDecision({
      roomId,
      participantId: 'host-agent',
      title: 'Сначала перепроверить rollout',
      summary: 'Без этого human confirmation преждевременен.',
      status: 'proposed',
    });

    const authFetch = createAuthorizedFetch('secret-token');
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl: authFetch })],
        cardResolver: new DefaultAgentCardResolver({ fetchImpl: authFetch }),
      }),
    );
    const client = await factory.createFromUrl(server.baseUrl);

    const searchResult = await client.sendMessage({
      message: {
        messageId: 'msg-search-rooms',
        role: 'user',
        kind: 'message',
        parts: [
          {
            kind: 'data',
            data: {
              kind: 'task-room-command',
              command: 'search_rooms',
              payload: {
                query: 'feature flag rollout',
                limit: 10,
              },
            },
          },
        ],
      },
    });

    const historyResult = await client.sendMessage({
      message: {
        messageId: 'msg-room-history',
        role: 'user',
        kind: 'message',
        parts: [
          {
            kind: 'data',
            data: {
              kind: 'task-room-command',
              command: 'get_room_history',
              payload: {
                roomId,
                limit: 20,
              },
            },
          },
        ],
      },
    });

    expect(getDataPart(searchResult as Message)?.data).toMatchObject({
      kind: 'task-room-result',
      command: 'search_rooms',
      ok: true,
    });
    expect(JSON.stringify(getDataPart(searchResult as Message)?.data)).toContain('feature flag');

    expect(getDataPart(historyResult as Message)?.data).toMatchObject({
      kind: 'task-room-result',
      command: 'get_room_history',
      ok: true,
    });
    expect(JSON.stringify(getDataPart(historyResult as Message)?.data)).toContain('decision');
  });

  it('отдаёт поток room updates через A2A stream task-mode и позволяет отменить подписку', async () => {
    const authFetch = createAuthorizedFetch('secret-token');
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl: authFetch })],
        cardResolver: new DefaultAgentCardResolver({ fetchImpl: authFetch }),
      }),
    );
    const client = await factory.createFromUrl(server.baseUrl);
    const stream = client.sendMessageStream({
      message: {
        messageId: 'msg-watch-room',
        role: 'user',
        kind: 'message',
        parts: [
          {
            kind: 'data',
            data: {
              kind: 'task-room-command',
              command: 'watch_room',
              payload: {
                roomId,
                afterSequence: latestSequence,
              },
            },
          },
        ],
      },
    });
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();

    expect(first.done).toBe(false);
    expect(first.value?.kind).toBe('task');

    const watchTask = first.value as Task;

    await roomService.postHumanMessage({
      roomId,
      humanLabel: 'Lead',
      body: 'Поток должен донести это сообщение подписчику.',
    });

    const second = await iterator.next();

    expect(second.done).toBe(false);
    expect(second.value?.kind).toBe('artifact-update');

    const streamData = getArtifactDataPart(second.value as TaskArtifactUpdateEvent);

    expect(streamData?.data).toMatchObject({
      kind: 'task-room-stream-event',
      roomId,
    });
    expect(JSON.stringify(streamData?.data)).toContain('донести это сообщение');

    await client.cancelTask({
      id: watchTask.id,
    });

    const third = await iterator.next();

    expect(third.done).toBe(false);
    expect(third.value?.kind).toBe('status-update');
    expect((third.value as TaskStatusUpdateEvent).status.state).toBe('canceled');
    expect((third.value as TaskStatusUpdateEvent).final).toBe(true);
  });

  it('посылает push-notification для watch_room при новых сообщениях', async () => {
    const notifications: Array<{ headers: http.IncomingHttpHeaders; body: Record<string, unknown> }> = [];
    const webhookServer = http.createServer((request, response) => {
      const chunks: Buffer[] = [];

      request.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      request.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        notifications.push({
          headers: request.headers,
          body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {},
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve, reject) => {
      webhookServer.listen(0, '127.0.0.1', () => resolve());
      webhookServer.once('error', reject);
    });

    try {
      const address = webhookServer.address();

      if (!address || typeof address === 'string') {
        throw new Error('Не удалось поднять тестовый webhook server.');
      }

      const webhookUrl = `http://127.0.0.1:${address.port}/push`;
      const authFetch = createAuthorizedFetch('secret-token');
      const factory = new ClientFactory(
        ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
          transports: [new JsonRpcTransportFactory({ fetchImpl: authFetch })],
          cardResolver: new DefaultAgentCardResolver({ fetchImpl: authFetch }),
        }),
      );
      const client = await factory.createFromUrl(server.baseUrl);
      const result = await client.sendMessage({
        configuration: {
          blocking: false,
          pushNotificationConfig: {
            url: webhookUrl,
            token: 'push-secret',
          },
        },
        message: {
          messageId: 'msg-watch-room-push',
          role: 'user',
          kind: 'message',
          parts: [
            {
              kind: 'data',
              data: {
                kind: 'task-room-command',
                command: 'watch_room',
                payload: {
                  roomId,
                  afterSequence: latestSequence,
                },
              },
            },
          ],
        },
      });

      expect(result.kind).toBe('task');

      const watchTask = result as Task;

      await roomService.postHumanMessage({
        roomId,
        humanLabel: 'Lead',
        body: 'Push webhook должен получить это обновление.',
      });

      const pushedTask = await waitFor(() => {
        return (
          notifications.find((notification) => JSON.stringify(notification.body).includes('Push webhook должен получить'))?.body ??
          null
        );
      });

      expect(pushedTask.kind).toBe('task');
      expect(JSON.stringify(pushedTask)).toContain('task-room-stream-event');

      await client.cancelTask({
        id: watchTask.id,
      });

      await waitFor(
        () =>
          notifications.find((notification) => JSON.stringify(notification.body).includes('"state":"canceled"'))?.body ??
          null,
        2000,
      ).catch(() => null);
    } finally {
      await new Promise<void>((resolve, reject) => {
        webhookServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});
