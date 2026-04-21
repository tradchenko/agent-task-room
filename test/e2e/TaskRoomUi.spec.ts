import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';

const TOKEN = 'secret-token';
const HOST_PARTICIPANT = {
  participantId: 'host-agent',
  participantLabel: 'Host Agent',
  role: 'initiator',
};
const PEER_PARTICIPANT = {
  participantId: 'browser-peer',
  participantLabel: 'Browser Peer',
  role: 'peer',
};

let tempDirectory = '';
let roomId = '';
let serverBaseUrl = '';
let ownerRoomUrl = '';
let peerInviteUrl = '';
let stopServer: (() => Promise<void>) | null = null;

async function importCompiledModule<T>(relativePath: string): Promise<T> {
  const projectRoot = path.resolve(import.meta.dirname, '../..');
  const moduleUrl = pathToFileURL(path.join(projectRoot, 'dist', relativePath)).href;

  return (await import(moduleUrl)) as T;
}

test.beforeAll(async () => {
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-task-room-e2e-'));

  const [{ RoomService }, { JsonRoomRepository }, { TaskRoomHttpServer }] = await Promise.all([
    importCompiledModule<{ RoomService: new (repository: unknown) => { load(): Promise<void>; openRoom(input: { title: string; taskDescription: string; initiatorId: string }): Promise<{ roomId: string }> } }>(
      'domain/room/RoomService.js',
    ),
    importCompiledModule<{ JsonRoomRepository: new (filePath: string) => unknown }>(
      'infrastructure/persistence/JsonRoomRepository.js',
    ),
    importCompiledModule<{ TaskRoomHttpServer: new (options: {
      host: string;
      port: number;
      mcpPath: string;
      sharedToken: string;
      storageFile: string;
      roomService: unknown;
    }) => { start(): Promise<void>; stop(): Promise<void>; baseUrl: string } }>(
      'infrastructure/http/TaskRoomHttpServer.js',
    ),
  ]);

  const storageFile = path.join(tempDirectory, 'rooms.json');
  const repository = new JsonRoomRepository(storageFile);
  const roomService = new RoomService(repository);
  await roomService.load();

  const opened = await roomService.openRoom({
    title: 'Проверка browser flow',
    taskDescription: 'Проверить гидратацию room page и invite join flow',
    initiatorId: HOST_PARTICIPANT.participantId,
  });

  roomId = opened.roomId;

  const server = new TaskRoomHttpServer({
    host: '127.0.0.1',
    port: 0,
    mcpPath: '/mcp',
    sharedToken: TOKEN,
    storageFile,
    roomService,
  });

  await server.start();
  stopServer = () => server.stop();
  serverBaseUrl = server.baseUrl;

  ownerRoomUrl =
    `${serverBaseUrl}/rooms/${encodeURIComponent(roomId)}` +
    `?token=${encodeURIComponent(TOKEN)}` +
    `&participant-id=${encodeURIComponent(HOST_PARTICIPANT.participantId)}` +
    `&participant-label=${encodeURIComponent(HOST_PARTICIPANT.participantLabel)}` +
    `&role=${encodeURIComponent(HOST_PARTICIPANT.role)}` +
    '&prompt=local';

  peerInviteUrl =
    `${serverBaseUrl}/join/${encodeURIComponent(roomId)}` +
    `?token=${encodeURIComponent(TOKEN)}` +
    `&participant-id=${encodeURIComponent(PEER_PARTICIPANT.participantId)}` +
    `&participant-label=${encodeURIComponent(PEER_PARTICIPANT.participantLabel)}` +
    `&role=${encodeURIComponent(PEER_PARTICIPANT.role)}` +
    '&prompt=peer';

  await fs.writeFile(
    path.join(tempDirectory, 'launch.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        token: TOKEN,
        roomId,
        publicUiUrl: serverBaseUrl,
        localUiUrl: serverBaseUrl,
        publicRoomUrl: ownerRoomUrl,
        localRoomUrl: ownerRoomUrl,
        publicPeerInviteUrl: peerInviteUrl,
        localPeerInviteUrl: peerInviteUrl,
        hostParticipant: HOST_PARTICIPANT,
        peerParticipant: PEER_PARTICIPANT,
        commands: {
          joinPosixCommand: 'agent-task-room join',
          joinPowerShellCommand: 'agent-task-room join',
          stop: 'agent-task-room stop',
        },
        prompts: {
          localPrompt: 'Локальная инструкция для host агента.',
          peerPrompt: 'Локальная инструкция для peer агента.',
        },
        examples: {
          watchRoomEnvelope: '{"kind":"watch_room"}',
          pushEnvelope: '{"kind":"push"}',
        },
      },
      null,
      2,
    ),
    'utf8',
  );
});

test.afterAll(async () => {
  await stopServer?.();
  await fs.rm(tempDirectory, { recursive: true, force: true });
});

test('room page гидратируется и quick actions реально работают', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(ownerRoomUrl, { waitUntil: 'networkidle' });

  await expect(page.locator('#roomTitle')).toHaveText('Проверка browser flow');
  await expect(page.locator('#statusPill')).toHaveText('OPEN');
  await expect(page.locator('#statusReason')).toContainText('Ожидается подключение второго участника');

  await page.locator('#copyAgentPromptButton').click();
  await expect(page.locator('#inviteStatus')).toContainText('Инструкция для агента скопирована.');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('Локальная инструкция для host агента.');

  await page.locator('#copyPeerInviteButton').click();
  await expect(page.locator('#inviteStatus')).toContainText('Ссылка второму участнику скопирована.');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(`/join/${roomId}`);
});

test('invite-страница подключает второго участника и показывает следующий шаг', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(peerInviteUrl, { waitUntil: 'networkidle' });

  await expect(page.locator('#roomTitle')).toHaveText('Проверка browser flow');
  await expect(page.locator('#joinRoomButton')).toHaveText('Подключиться к комнате');
  await page.locator('#joinRoomButton').click();

  await expect(page.locator('#inviteStatus')).toContainText('Вы подключились к комнате.');
  await expect(page.locator('#roomMeta')).toContainText('Browser Peer');

  await page.locator('#copyAgentPromptButton').click();
  await expect(page.locator('#inviteStatus')).toContainText('Инструкция для агента скопирована.');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('Локальная инструкция для peer агента.');
});
