import { beforeEach, describe, expect, it } from 'vitest';

import type { RoomRepository } from '../../../src/domain/room/RoomRepository.js';
import { RoomService } from '../../../src/domain/room/RoomService.js';
import { ROOM_STATUS, type TaskRoom } from '../../../src/domain/room/room-types.js';

class InMemoryRoomRepository implements RoomRepository {
  private rooms: TaskRoom[] = [];

  public async loadAll(): Promise<TaskRoom[]> {
    return structuredClone(this.rooms);
  }

  public async saveAll(rooms: TaskRoom[]): Promise<void> {
    this.rooms = structuredClone(rooms);
  }
}

describe('RoomService', () => {
  let repository: InMemoryRoomRepository;
  let service: RoomService;

  beforeEach(() => {
    repository = new InMemoryRoomRepository();
    service = new RoomService(repository);
  });

  it('открывает комнату и оставляет её в статусе ожидания второго участника', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Разобрать общий дефект',
      taskDescription: 'Нужно согласовать поведение backend и frontend',
      initiatorId: 'host-agent',
      initiatorLabel: 'Host Agent',
      initiatorRole: 'initiator',
    });

    const overview = await service.getRoomOverview(opened.roomId);

    expect(opened.roomId).toMatch(/^room-/);
    expect(overview.room.status).toBe(ROOM_STATUS.OPEN);
    expect(overview.room.participants).toHaveLength(1);
    expect(overview.room.sharedPrompt).toContain('Правила общей беседы');
  });

  it('после подключения второго участника переводит комнату в обсуждение контекста', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Согласовать интеграцию',
      taskDescription: 'Одна задача, два проекта',
      initiatorId: 'host-agent',
    });

    await service.joinRoom({
      roomId: opened.roomId,
      participantId: 'peer-agent',
      participantLabel: 'Peer Agent',
      role: 'peer',
    });

    const overview = await service.getRoomOverview(opened.roomId);

    expect(overview.room.status).toBe(ROOM_STATUS.ACTIVE_DISCUSSION);
    expect(overview.room.statusReason).toContain('не все участники объявили контекст');
  });

  it('сохраняет человеческое сообщение в общей ленте', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Проверка общей ленты',
      taskDescription: 'Проверить, что люди могут писать в комнату',
      initiatorId: 'host-agent',
    });

    await service.joinRoom({
      roomId: opened.roomId,
      participantId: 'peer-agent',
    });

    await service.postHumanMessage({
      roomId: opened.roomId,
      humanLabel: 'Reviewer',
      title: 'Уточнение от человека',
      body: 'Пожалуйста, отдельно проверьте обработку ошибок и итоговые риски.',
      references: ['TASK-123'],
    });

    const updates = await service.getRoomUpdates(opened.roomId, 0, 50);
    const lastMessage = updates.updates.at(-1);

    expect(lastMessage?.authorType).toBe('human');
    expect(lastMessage?.kind).toBe('human_note');
    expect(lastMessage?.body).toContain('обработку ошибок');
  });

  it('после двух финальных позиций с согласием ждёт подтверждения человека', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Финальное согласование',
      taskDescription: 'Найти общее решение',
      initiatorId: 'host-agent',
    });

    await service.joinRoom({
      roomId: opened.roomId,
      participantId: 'peer-agent',
    });

    await service.declareContext({
      roomId: opened.roomId,
      participantId: 'host-agent',
      systemScope: 'frontend',
      summary: 'Контролирую клиентский контракт и UX.',
    });

    await service.declareContext({
      roomId: opened.roomId,
      participantId: 'peer-agent',
      systemScope: 'backend',
      summary: 'Контролирую API и очередь обработки.',
    });

    await service.submitFinalPosition({
      roomId: opened.roomId,
      participantId: 'host-agent',
      stance: 'agree',
      summary: 'Решение подходит.',
      decisions: ['Принять единый контракт ответа'],
    });

    await service.submitFinalPosition({
      roomId: opened.roomId,
      participantId: 'peer-agent',
      stance: 'agree_with_risks',
      summary: 'Решение подходит, но есть риск миграции.',
      decisions: ['Синхронизировать валидацию в обоих сервисах'],
      openQuestions: ['Нужно ли отдельное feature flag окно?'],
    });

    const overview = await service.getRoomOverview(opened.roomId);

    expect(overview.room.status).toBe(ROOM_STATUS.NEEDS_HUMAN_CONFIRMATION);
    expect(overview.room.statusReason).toContain('Люди должны проверить итоговые позиции');
  });

  it('после подтверждения человеком завершает комнату', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Завершение комнаты',
      taskDescription: 'Проверить человеческое подтверждение',
      initiatorId: 'host-agent',
    });

    await service.joinRoom({
      roomId: opened.roomId,
      participantId: 'peer-agent',
    });

    await service.declareContext({
      roomId: opened.roomId,
      participantId: 'host-agent',
      systemScope: 'frontend',
      summary: 'Есть весь нужный контекст.',
    });

    await service.declareContext({
      roomId: opened.roomId,
      participantId: 'peer-agent',
      systemScope: 'backend',
      summary: 'Есть весь нужный контекст.',
    });

    await service.submitFinalPosition({
      roomId: opened.roomId,
      participantId: 'host-agent',
      stance: 'agree',
      summary: 'Можно принимать.',
      decisions: ['Слить изменения после верификации'],
    });

    await service.submitFinalPosition({
      roomId: opened.roomId,
      participantId: 'peer-agent',
      stance: 'agree',
      summary: 'Подтверждаю.',
      decisions: ['Доставить изменения в оба проекта'],
    });

    await service.recordHumanFeedback({
      roomId: opened.roomId,
      humanLabel: 'Lead',
      verdict: 'approve_solution',
      comment: 'Подтверждаю общее решение.',
    });

    const overview = await service.getRoomOverview(opened.roomId);

    expect(overview.room.status).toBe(ROOM_STATUS.COMPLETED);
    expect(overview.room.resolution).toBe('approved_by_human');
    expect(overview.room.closedAt).not.toBeNull();
  });

  it('автоматически создаёт связанный Jira-артефакт и позволяет участнику добавить ещё один артефакт', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Разобрать Jira-задачу',
      jiraUrl: 'https://jira.example.com/browse/TASK-123',
      comment: 'Есть ещё внешний лог и diff.',
      initiatorId: 'host-agent',
      initiatorLabel: 'Host Agent',
    });

    await service.addArtifact({
      roomId: opened.roomId,
      participantId: 'host-agent',
      participantLabel: 'Host Agent',
      kind: 'diff',
      title: 'Патч между двумя сервисами',
      summary: 'Нужно проверить, что исправление совместимо в обоих проектах.',
      content: '--- a/file.ts\n+++ b/file.ts',
      references: ['PATCH-42'],
      tags: ['integration', 'diff'],
    });

    const overview = await service.getRoomOverview(opened.roomId);
    const jiraArtifact = overview.room.artifacts.find((artifact) => artifact.kind === 'jira_issue');
    const diffArtifact = overview.room.artifacts.find((artifact) => artifact.kind === 'diff');

    expect(jiraArtifact?.uri).toBe('https://jira.example.com/browse/TASK-123');
    expect(diffArtifact?.title).toBe('Патч между двумя сервисами');
    expect(diffArtifact?.tags).toContain('integration');

    const updates = await service.getRoomUpdates(opened.roomId, 0, 100);

    expect(updates.updates.some((message) => message.title === 'Артефакт добавлен')).toBe(true);
  });

  it('ведёт decision log и сохраняет человеческое решение как отдельную запись', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Решение по интеграции',
      taskDescription: 'Нужно зафиксировать согласованный путь миграции',
      initiatorId: 'host-agent',
    });

    await service.recordDecision({
      roomId: opened.roomId,
      participantId: 'host-agent',
      title: 'Перейти на единый контракт ответа',
      summary: 'Оба проекта должны использовать одинаковую схему поля status.',
      rationale: 'Иначе агенты и люди продолжают спорить на разных контрактах.',
      references: ['DECISION-1'],
      status: 'accepted',
    });

    await service.recordDecision({
      roomId: opened.roomId,
      humanLabel: 'Lead',
      title: 'Подтвердить rollout через feature flag',
      summary: 'Раскатка должна идти постепенно с возможностью отката.',
      rationale: 'Это снижает риск регрессии на проде.',
      status: 'proposed',
    });

    const overview = await service.getRoomOverview(opened.roomId);

    expect(overview.room.decisionLog).toHaveLength(2);
    expect(overview.room.decisionLog[0]?.status).toBe('accepted');
    expect(overview.room.decisionLog[1]?.authorType).toBe('human');

    const updates = await service.getRoomUpdates(opened.roomId, 0, 100);

    expect(updates.updates.some((message) => message.title === 'Решение записано')).toBe(true);
  });

  it('умеет искать комнаты и строить unified history даже без специального backend поиска', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Согласовать rollout plan',
      taskDescription: 'Нужно перепроверить feature flag rollout и контракт API',
      initiatorId: 'host-agent',
    });

    await service.joinRoom({
      roomId: opened.roomId,
      participantId: 'peer-agent',
    });

    await service.postHumanMessage({
      roomId: opened.roomId,
      humanLabel: 'Lead',
      title: 'Проверить rollout',
      body: 'Нужно отдельно проверить feature flag rollout перед подтверждением.',
      references: ['TASK-ROLL-1'],
    });

    await service.addArtifact({
      roomId: opened.roomId,
      participantId: 'host-agent',
      kind: 'github_pr',
      title: 'PR с rollout plan',
      uri: 'https://github.com/example/repo/pull/77',
      summary: 'Содержит proposed rollout plan.',
      tags: ['rollout', 'feature-flag'],
    });

    await service.recordDecision({
      roomId: opened.roomId,
      participantId: 'peer-agent',
      title: 'Сначала перепроверить feature flag',
      summary: 'Иначе risk profile решения остаётся неясным.',
      rationale: 'Нужно синхронизировать rollout plan между проектами.',
      status: 'proposed',
      references: ['DEC-ROLL-1'],
    });

    const search = await service.searchRooms({
      query: 'feature flag rollout',
      limit: 10,
    });
    const history = await service.getRoomHistory(opened.roomId, 10);

    expect(search.rooms).toHaveLength(1);
    expect(search.rooms[0]?.roomId).toBe(opened.roomId);
    expect(search.rooms[0]?.snippet).toContain('feature flag');
    expect(history.entries.some((entry) => entry.entryType === 'message')).toBe(true);
    expect(history.entries.some((entry) => entry.entryType === 'artifact')).toBe(true);
    expect(history.entries.some((entry) => entry.entryType === 'decision')).toBe(true);
  });

  it('ищет комнату по roomId, participant context и human feedback в fallback-режиме', async () => {
    await service.load();

    const opened = await service.openRoom({
      title: 'Согласовать refresh queue',
      taskDescription: 'Нужно выровнять auth-поведение между двумя проектами',
      initiatorId: 'host-agent',
      initiatorLabel: 'Host Agent',
    });

    await service.joinRoom({
      roomId: opened.roomId,
      participantId: 'peer-agent',
      participantLabel: 'Peer Agent',
    });

    await service.declareContext({
      roomId: opened.roomId,
      participantId: 'host-agent',
      participantLabel: 'Host Agent',
      systemScope: 'billing-api',
      summary: 'Исследую race condition в refresh queue и потерю токена.',
      confidence: 'high',
    });

    await service.recordHumanFeedback({
      roomId: opened.roomId,
      humanLabel: 'Lead',
      verdict: 'keep_session_active',
      comment: 'Нужен отдельный анализ refresh queue перед подтверждением решения.',
    });

    const roomIdSearch = await service.searchRooms({
      query: opened.roomId,
      limit: 10,
    });
    const contextSearch = await service.searchRooms({
      query: 'race condition',
      limit: 10,
    });
    const humanFeedbackSearch = await service.searchRooms({
      query: 'анализ refresh queue',
      limit: 10,
    });

    expect(roomIdSearch.rooms.some((room) => room.roomId === opened.roomId)).toBe(true);
    expect(contextSearch.rooms.some((room) => room.roomId === opened.roomId)).toBe(true);
    expect(contextSearch.rooms[0]?.matchSource).toContain('participant');
    expect(humanFeedbackSearch.rooms.some((room) => room.roomId === opened.roomId)).toBe(true);
    expect(humanFeedbackSearch.rooms[0]?.matchSource).toContain('human_feedback');
  });
});
