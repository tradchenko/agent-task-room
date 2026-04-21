import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

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
let rootUrl = '';

async function expectClipboardToContain(page: Page, text: string): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(text);
}

async function openDetailsSection(page: Page, title: string): Promise<void> {
  const summary = page.locator('summary').filter({ hasText: title });
  const details = summary.locator('xpath=..');
  const isOpen = await details.evaluate((element) => element.hasAttribute('open'));

  if (!isOpen) {
    await summary.click();
  }
}

function buildRoomUrl(participant: { participantId: string; participantLabel: string; role: string }, prompt: 'local' | 'peer'): string {
  return (
    `${serverBaseUrl}/rooms/${encodeURIComponent(roomId)}` +
    `?token=${encodeURIComponent(TOKEN)}` +
    `&participant-id=${encodeURIComponent(participant.participantId)}` +
    `&participant-label=${encodeURIComponent(participant.participantLabel)}` +
    `&role=${encodeURIComponent(participant.role)}` +
    `&prompt=${encodeURIComponent(prompt)}`
  );
}

function buildInviteUrl(participant: { participantId: string; participantLabel: string; role: string }, prompt: 'local' | 'peer'): string {
  return (
    `${serverBaseUrl}/join/${encodeURIComponent(roomId)}` +
    `?token=${encodeURIComponent(TOKEN)}` +
    `&participant-id=${encodeURIComponent(participant.participantId)}` +
    `&participant-label=${encodeURIComponent(participant.participantLabel)}` +
    `&role=${encodeURIComponent(participant.role)}` +
    `&prompt=${encodeURIComponent(prompt)}`
  );
}

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

  ownerRoomUrl = buildRoomUrl(HOST_PARTICIPANT, 'local');
  peerInviteUrl = buildInviteUrl(PEER_PARTICIPANT, 'peer');
  rootUrl = `${serverBaseUrl}/?token=${encodeURIComponent(TOKEN)}`;

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

  await page.locator('#tokenInput').fill(TOKEN);
  await page.locator('#saveTokenButton').click();
  await expect(page.locator('#authStatus')).toContainText('Токен сохранён');
  await expect(page.evaluate(() => window.localStorage.getItem('agent-task-room-token'))).resolves.toBe(TOKEN);

  await page.locator('#roomSearchInput').fill('несуществующая строка');
  await page.locator('#roomSearchButton').click();
  await expect(page.locator('#roomList')).toContainText('Доступных комнат пока нет.');
  await page.locator('#roomSearchClearButton').click();
  await expect(page.locator('#roomList')).toContainText('Проверка browser flow');

  await page.locator('#copyAgentPromptButton').click();
  await expect(page.locator('#inviteStatus')).toContainText('Инструкция для агента скопирована.');
  await expectClipboardToContain(page, 'Локальная инструкция для host агента.');

  await page.locator('#copyPeerInviteButton').click();
  await expect(page.locator('#inviteStatus')).toContainText('Ссылка второму участнику скопирована.');
  await expectClipboardToContain(page, `/join/${roomId}`);

  await openDetailsSection(page, 'Расширенные действия');
  await page.locator('#quickActionCopyRoomLinkButton').click();
  await expect(page.locator('#quickActionStatus')).toContainText('Ссылка на комнату скопирована.');
  await expectClipboardToContain(page, `/rooms/${roomId}`);

  await page.locator('#quickActionCopyJoinCommandButton').click();
  await expect(page.locator('#quickActionStatus')).toContainText('Команда join скопирована.');
  await expectClipboardToContain(page, 'agent-task-room join');

  await page.locator('#quickActionCopyPeerPromptButton').click();
  await expect(page.locator('#quickActionStatus')).toContainText('Prompt для коллеги скопирован.');
  await expectClipboardToContain(page, 'Локальная инструкция для peer агента.');

  await page.locator('#quickActionCopyWatchEnvelopeButton').click();
  await expect(page.locator('#quickActionStatus')).toContainText('A2A watch envelope скопирован.');
  await expectClipboardToContain(page, '"kind":"watch_room"');

  await page.locator('#humanLabelInput').fill('Координатор');
  await page.locator('#messageTitleInput').fill('Стартовая заметка');
  await page.locator('#messageRefsInput').fill('ROOM-1,ROOM-2');
  await page.locator('#messageBodyInput').fill('Нужно синхронизировать ожидания перед подключением второго участника.');
  await page.locator('#sendMessageButton').click();
  await expect(page.locator('#messageList')).toContainText('Стартовая заметка');
  await expect(page.locator('#messageList')).toContainText('Нужно синхронизировать ожидания');

  await page.locator('#quickActionRequestContextButton').click();
  await expect(page.locator('#quickActionStatus')).toContainText('Быстрое действие выполнено');
  await expect(page.locator('#messageList')).toContainText('Нужно объявить или обновить контекст');

  await page.locator('#quickActionRequestRecheckButton').click();
  await expect(page.locator('#messageList')).toContainText('Нужна перепроверка');

  await page.locator('#quickActionRequestDecisionButton').click();
  await expect(page.locator('#messageList')).toContainText('Нужно свести решение');

  await page.locator('#quickActionRequestFinalPositionsButton').click();
  await expect(page.locator('#messageList')).toContainText('Нужны финальные позиции');
});

test('корневая страница позволяет выбрать комнату из списка и перейти в неё', async ({ page }) => {
  await page.goto(rootUrl, { waitUntil: 'networkidle' });

  await expect(page.locator('#roomTitle')).toHaveText('Проверка browser flow');
  await expect(page.locator('#roomList')).toContainText('Проверка browser flow');

  const roomLink = page.locator('.room-link').first();
  await roomLink.click();

  await expect(page).toHaveURL(new RegExp(`/rooms/${roomId}`));
  await expect(page.locator('#roomTitle')).toHaveText('Проверка browser flow');
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
  await expectClipboardToContain(page, 'Локальная инструкция для peer агента.');

  await page.locator('#copyPeerInviteButton').click();
  await expect(page.locator('#inviteStatus')).toContainText('Ссылка на комнату скопирована.');
  await expectClipboardToContain(page, `/rooms/${roomId}`);
});

test('оба участника могут пройти полный UI flow и все action-кнопки работают', async ({ browser }) => {
  const fullFlowPeer = {
    participantId: 'browser-peer-full',
    participantLabel: 'Browser Peer Full',
    role: 'peer',
  } as const;
  const ownerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const peerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const ownerPage = await ownerContext.newPage();
  const peerPage = await peerContext.newPage();

  await ownerPage.goto(ownerRoomUrl, { waitUntil: 'networkidle' });
  await peerPage.goto(buildInviteUrl(fullFlowPeer, 'peer'), { waitUntil: 'networkidle' });

  await peerPage.locator('#joinRoomButton').click();
  await expect(peerPage.locator('#inviteStatus')).toContainText('Вы подключились к комнате.');

  await expect
    .poll(async () => ownerPage.locator('#roomMeta').textContent())
    .toContain('Browser Peer Full');

  await peerPage.locator('#humanLabelInput').fill('Peer Human');
  await peerPage.locator('#messageTitleInput').fill('Ответ второй стороны');
  await peerPage.locator('#messageBodyInput').fill('Вторая сторона подключилась и готова обсуждать решение.');
  await peerPage.locator('#sendMessageButton').click();
  await expect(peerPage.locator('#messageList')).toContainText('Ответ второй стороны');
  await expect
    .poll(async () => ownerPage.locator('#messageList').textContent())
    .toContain('Ответ второй стороны');

  await openDetailsSection(ownerPage, 'Артефакты, решения и итог людей');
  await ownerPage.locator('#artifactKindInput').selectOption('link');
  await ownerPage.locator('#artifactTitleInput').fill('Ссылка на описание');
  await ownerPage.locator('#artifactUriInput').fill('https://example.com/spec');
  await ownerPage.locator('#artifactTagsInput').fill('spec,api');
  await ownerPage.locator('#artifactSummaryInput').fill('Базовое описание внешнего контракта.');
  await ownerPage.locator('#addArtifactButton').click();
  await expect(ownerPage.locator('#artifactList')).toContainText('Ссылка на описание');
  await expect(ownerPage.locator('#artifactList')).toContainText('https://example.com/spec');

  await ownerPage.locator('#decisionTitleInput').fill('Выровнять контракт до финальной проверки');
  await ownerPage.locator('#decisionStatusInput').selectOption('proposed');
  await ownerPage.locator('#decisionRefsInput').fill('DEC-1');
  await ownerPage.locator('#decisionSummaryInput').fill('Сначала правим контракт, потом возвращаемся к перепроверке.');
  await ownerPage.locator('#decisionRationaleInput').fill('Без этого остальная верификация будет шумной.');
  await ownerPage.locator('#addDecisionButton').click();
  await expect(ownerPage.locator('#decisionList')).toContainText('Выровнять контракт до финальной проверки');
  await expect(ownerPage.locator('#decisionList')).toContainText('proposed');

  await ownerPage.locator('#verdictCommentInput').fill('Нужно ещё немного доработать.');
  await ownerPage.locator('#keepActiveButton').click();
  await expect(ownerPage.locator('#statusPill')).toHaveText('ACTIVE_FOLLOWUP');
  await expect(ownerPage.locator('#statusReason')).toContainText('Люди оставили сессию активной');

  await ownerPage.locator('#verdictCommentInput').fill('Текущее решение пока не устраивает.');
  await ownerPage.locator('#rejectButton').click();
  await expect(ownerPage.locator('#statusPill')).toHaveText('ACTIVE_FOLLOWUP');
  await expect(ownerPage.locator('#statusReason')).toContainText('Люди отклонили предложенное решение');

  await ownerPage.locator('#verdictCommentInput').fill('Теперь всё согласовано.');
  await ownerPage.locator('#approveButton').click();
  await expect(ownerPage.locator('#statusPill')).toHaveText('COMPLETED');
  await expect(ownerPage.locator('#statusReason')).toContainText('Сессия закрыта: approved_by_human');
  await expect(ownerPage.locator('#historyList')).toContainText('Решение человека');

  await ownerContext.close();
  await peerContext.close();
});
