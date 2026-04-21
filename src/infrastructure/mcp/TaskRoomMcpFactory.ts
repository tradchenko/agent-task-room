import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { DECISION_LOG_STATUSES, PARTICIPANT_MESSAGE_KINDS, ROOM_ARTIFACT_KINDS } from '../../domain/room/room-types.js';
import type { RoomService } from '../../domain/room/RoomService.js';

function makeTextResult<T extends Record<string, unknown>>(
  text: string,
  structuredContent: T,
): { content: Array<{ type: 'text'; text: string }>; structuredContent: T } {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
  };
}

export class TaskRoomMcpFactory {
  public constructor(private readonly roomService: RoomService) {}

  public create(): McpServer {
    const server = new McpServer(
      {
        name: 'agent-task-room',
        version: '0.1.0',
      },
      {
        instructions: [
          'Этот MCP-сервер координирует общую task-room между агентами и людьми.',
          'Сначала откройте комнату или подключитесь к ней, затем объявите локальный контекст через declare_context.',
          'Для обсуждения используйте типизированные сообщения и прикладывайте evidence/constraints к сильным утверждениям.',
          'Когда позиция созрела, отправьте submit_final_position. После финальных позиций люди подтверждают или отклоняют решение.',
        ].join(' '),
      },
    );

    server.registerTool(
      'open_task_room',
      {
        title: 'Открыть task-room',
        description: 'Создаёт новую task-room по описанию задачи или Jira.',
        inputSchema: {
          roomId: z.string().optional(),
          title: z.string().min(3),
          taskDescription: z.string().optional(),
          jiraUrl: z.string().optional(),
          comment: z.string().optional(),
          initiatorId: z.string().min(2),
          initiatorLabel: z.string().optional(),
          initiatorRole: z.string().optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.openRoom(arguments_);
        return makeTextResult(`Комната ${result.roomId} открыта.`, result);
      },
    );

    server.registerTool(
      'join_task_room',
      {
        title: 'Подключиться к task-room',
        description: 'Добавляет участника в существующую комнату.',
        inputSchema: {
          roomId: z.string().min(1),
          participantId: z.string().min(2),
          participantLabel: z.string().optional(),
          role: z.string().optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.joinRoom(arguments_);
        return makeTextResult(`Участник ${arguments_.participantId} подключён к комнате ${arguments_.roomId}.`, result);
      },
    );

    server.registerTool(
      'list_task_rooms',
      {
        title: 'Список комнат',
        description: 'Возвращает краткий список активных и завершённых комнат.',
        inputSchema: {},
      },
      async () => {
        const result = await this.roomService.listRooms();
        return makeTextResult(`Найдено комнат: ${result.rooms.length}.`, result);
      },
    );

    server.registerTool(
      'search_task_rooms',
      {
        title: 'Поиск по комнатам',
        description: 'Ищет комнаты по задаче, сообщениям, артефактам и decision log.',
        inputSchema: {
          query: z.string().optional(),
          status: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
        },
      },
      async ({ query, status, limit }) => {
        const result = await this.roomService.searchRooms({
          query,
          status: status as 'all' | undefined,
          limit,
        });
        return makeTextResult(`Найдено комнат: ${result.rooms.length}.`, result as unknown as Record<string, unknown>);
      },
    );

    server.registerTool(
      'get_room_overview',
      {
        title: 'Получить overview комнаты',
        description: 'Возвращает статус, участников, human feedback и shared prompt.',
        inputSchema: {
          roomId: z.string().min(1),
        },
      },
      async ({ roomId }) => {
        const result = await this.roomService.getRoomOverview(roomId);
        return makeTextResult(`Статус комнаты ${roomId}: ${result.room.status}.`, result);
      },
    );

    server.registerTool(
      'declare_context',
      {
        title: 'Объявить локальный контекст',
        description: 'Публикует область ответственности и ограничения участника.',
        inputSchema: {
          roomId: z.string().min(1),
          participantId: z.string().min(2),
          participantLabel: z.string().optional(),
          role: z.string().optional(),
          systemScope: z.string().min(2),
          summary: z.string().min(5),
          constraints: z.array(z.string()).optional(),
          artifacts: z.array(z.string()).optional(),
          confidence: z.enum(['low', 'medium', 'high']).optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.declareContext(arguments_);
        return makeTextResult(`Контекст участника ${arguments_.participantId} сохранён.`, result);
      },
    );

    server.registerTool(
      'post_room_message',
      {
        title: 'Отправить сообщение в room',
        description: 'Публикует типизированное сообщение участника.',
        inputSchema: {
          roomId: z.string().min(1),
          participantId: z.string().min(2),
          participantLabel: z.string().optional(),
          role: z.string().optional(),
          kind: z.enum(PARTICIPANT_MESSAGE_KINDS),
          title: z.string().optional(),
          body: z.string().min(1),
          references: z.array(z.string()).optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.postRoomMessage(arguments_);
        return makeTextResult(`Сообщение ${arguments_.kind} опубликовано.`, result);
      },
    );

    server.registerTool(
      'get_room_updates',
      {
        title: 'Получить новые сообщения комнаты',
        description: 'Возвращает сообщения комнаты начиная с указанной sequence.',
        inputSchema: {
          roomId: z.string().min(1),
          afterSequence: z.number().int().nonnegative().default(0),
          limit: z.number().int().positive().max(500).default(100),
        },
      },
      async ({ roomId, afterSequence, limit }) => {
        const result = await this.roomService.getRoomUpdates(roomId, afterSequence, limit);
        return makeTextResult(`Найдено ${result.updates.length} новых сообщений.`, result as unknown as Record<string, unknown>);
      },
    );

    server.registerTool(
      'get_room_history',
      {
        title: 'Получить unified history комнаты',
        description: 'Возвращает единую историю по сообщениям, артефактам, decision log и human feedback.',
        inputSchema: {
          roomId: z.string().min(1),
          limit: z.number().int().positive().max(200).optional(),
        },
      },
      async ({ roomId, limit }) => {
        const result = await this.roomService.getRoomHistory(roomId, limit);
        return makeTextResult(`Найдено ${result.entries.length} history entries.`, result as unknown as Record<string, unknown>);
      },
    );

    server.registerTool(
      'add_room_artifact',
      {
        title: 'Добавить артефакт в room',
        description: 'Сохраняет Jira/GitHub ссылку, diff, лог или другой артефакт как отдельную сущность комнаты.',
        inputSchema: {
          roomId: z.string().min(1),
          participantId: z.string().min(2).optional(),
          participantLabel: z.string().optional(),
          role: z.string().optional(),
          humanLabel: z.string().optional(),
          kind: z.enum(ROOM_ARTIFACT_KINDS),
          title: z.string().min(2),
          uri: z.string().optional(),
          summary: z.string().optional(),
          content: z.string().optional(),
          tags: z.array(z.string()).optional(),
          references: z.array(z.string()).optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.addArtifact(arguments_);
        return makeTextResult(`Артефакт ${arguments_.title} сохранён.`, result);
      },
    );

    server.registerTool(
      'record_room_decision',
      {
        title: 'Записать решение в decision log',
        description: 'Фиксирует промежуточное или финальное решение по задаче.',
        inputSchema: {
          roomId: z.string().min(1),
          participantId: z.string().min(2).optional(),
          participantLabel: z.string().optional(),
          role: z.string().optional(),
          humanLabel: z.string().optional(),
          title: z.string().min(2),
          summary: z.string().min(5),
          rationale: z.string().optional(),
          references: z.array(z.string()).optional(),
          status: z.enum(DECISION_LOG_STATUSES).optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.recordDecision(arguments_);
        return makeTextResult(`Решение ${arguments_.title} записано.`, result);
      },
    );

    server.registerTool(
      'submit_final_position',
      {
        title: 'Отправить финальную позицию',
        description: 'Фиксирует итоговую позицию участника по задаче.',
        inputSchema: {
          roomId: z.string().min(1),
          participantId: z.string().min(2),
          participantLabel: z.string().optional(),
          role: z.string().optional(),
          stance: z.enum(['agree', 'agree_with_risks', 'needs_human_decision', 'disagree']),
          summary: z.string().min(5),
          decisions: z.array(z.string().min(1)).min(1),
          openQuestions: z.array(z.string()).optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.submitFinalPosition(arguments_);
        return makeTextResult(`Финальная позиция участника ${arguments_.participantId} сохранена.`, result);
      },
    );

    server.registerTool(
      'record_human_feedback',
      {
        title: 'Записать решение человека',
        description: 'Люди подтверждают решение, отклоняют его или оставляют сессию активной.',
        inputSchema: {
          roomId: z.string().min(1),
          humanLabel: z.string().optional(),
          verdict: z.enum(['approve_solution', 'reject_solution', 'keep_session_active']),
          comment: z.string().optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.recordHumanFeedback(arguments_);
        return makeTextResult(`Human feedback ${arguments_.verdict} зафиксирован.`, result);
      },
    );

    server.registerTool(
      'close_task_room',
      {
        title: 'Закрыть task-room',
        description: 'Закрывает комнату вручную.',
        inputSchema: {
          roomId: z.string().min(1),
          actorLabel: z.string().optional(),
          resolution: z.enum(['completed', 'manual_close']).optional(),
        },
      },
      async (arguments_) => {
        const result = await this.roomService.closeRoom(arguments_);
        return makeTextResult(`Комната ${arguments_.roomId} закрыта.`, result);
      },
    );

    return server;
  }
}
