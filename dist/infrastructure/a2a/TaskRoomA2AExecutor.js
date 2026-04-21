import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DECISION_LOG_STATUSES, FINAL_STANCES, HUMAN_VERDICTS, PARTICIPANT_MESSAGE_KINDS, ROOM_ARTIFACT_KINDS, ROOM_STATUS, } from '../../domain/room/room-types.js';
const OPEN_ROOM_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().optional(),
    title: z.string().min(3),
    taskDescription: z.string().optional(),
    jiraUrl: z.string().optional(),
    comment: z.string().optional(),
    initiatorId: z.string().min(2),
    initiatorLabel: z.string().optional(),
    initiatorRole: z.string().optional(),
});
const JOIN_ROOM_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().min(1),
    participantId: z.string().min(2),
    participantLabel: z.string().optional(),
    role: z.string().optional(),
});
const DECLARE_CONTEXT_PAYLOAD_SCHEMA = JOIN_ROOM_PAYLOAD_SCHEMA.extend({
    systemScope: z.string().min(2),
    summary: z.string().min(5),
    constraints: z.array(z.string()).optional(),
    artifacts: z.array(z.string()).optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
});
const POST_MESSAGE_PAYLOAD_SCHEMA = JOIN_ROOM_PAYLOAD_SCHEMA.extend({
    kind: z.enum(PARTICIPANT_MESSAGE_KINDS),
    title: z.string().optional(),
    body: z.string().min(1),
    references: z.array(z.string()).optional(),
});
const GET_ROOM_OVERVIEW_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().min(1),
});
const SEARCH_ROOMS_PAYLOAD_SCHEMA = z.object({
    query: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
});
const GET_ROOM_UPDATES_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().min(1),
    afterSequence: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(500).optional(),
});
const GET_ROOM_HISTORY_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().min(1),
    limit: z.number().int().positive().max(200).optional(),
});
const WATCH_ROOM_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().min(1),
    afterSequence: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(500).optional(),
});
const SUBMIT_FINAL_POSITION_PAYLOAD_SCHEMA = JOIN_ROOM_PAYLOAD_SCHEMA.extend({
    stance: z.enum(FINAL_STANCES),
    summary: z.string().min(5),
    decisions: z.array(z.string().min(1)).min(1),
    openQuestions: z.array(z.string()).optional(),
});
const RECORD_HUMAN_FEEDBACK_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().min(1),
    humanLabel: z.string().optional(),
    verdict: z.enum(HUMAN_VERDICTS),
    comment: z.string().optional(),
});
const ADD_ARTIFACT_PAYLOAD_SCHEMA = z.object({
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
});
const RECORD_DECISION_PAYLOAD_SCHEMA = z.object({
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
});
const CLOSE_ROOM_PAYLOAD_SCHEMA = z.object({
    roomId: z.string().min(1),
    actorLabel: z.string().optional(),
    resolution: z.enum(['completed', 'manual_close']).optional(),
});
const LIST_ROOMS_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('list_rooms'),
    payload: z.record(z.string(), z.unknown()).optional(),
});
const GET_ROOM_OVERVIEW_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('get_room_overview'),
    payload: GET_ROOM_OVERVIEW_PAYLOAD_SCHEMA,
});
const SEARCH_ROOMS_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('search_rooms'),
    payload: SEARCH_ROOMS_PAYLOAD_SCHEMA.optional(),
});
const OPEN_ROOM_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('open_room'),
    payload: OPEN_ROOM_PAYLOAD_SCHEMA,
});
const JOIN_ROOM_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('join_room'),
    payload: JOIN_ROOM_PAYLOAD_SCHEMA,
});
const DECLARE_CONTEXT_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('declare_context'),
    payload: DECLARE_CONTEXT_PAYLOAD_SCHEMA,
});
const POST_MESSAGE_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('post_room_message'),
    payload: POST_MESSAGE_PAYLOAD_SCHEMA,
});
const GET_ROOM_UPDATES_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('get_room_updates'),
    payload: GET_ROOM_UPDATES_PAYLOAD_SCHEMA,
});
const GET_ROOM_HISTORY_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('get_room_history'),
    payload: GET_ROOM_HISTORY_PAYLOAD_SCHEMA,
});
const WATCH_ROOM_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('watch_room'),
    payload: WATCH_ROOM_PAYLOAD_SCHEMA,
});
const SUBMIT_FINAL_POSITION_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('submit_final_position'),
    payload: SUBMIT_FINAL_POSITION_PAYLOAD_SCHEMA,
});
const RECORD_HUMAN_FEEDBACK_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('record_human_feedback'),
    payload: RECORD_HUMAN_FEEDBACK_PAYLOAD_SCHEMA,
});
const ADD_ARTIFACT_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('add_artifact'),
    payload: ADD_ARTIFACT_PAYLOAD_SCHEMA,
});
const RECORD_DECISION_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('record_decision'),
    payload: RECORD_DECISION_PAYLOAD_SCHEMA,
});
const CLOSE_ROOM_COMMAND_SCHEMA = z.object({
    kind: z.literal('task-room-command').optional(),
    command: z.literal('close_task_room'),
    payload: CLOSE_ROOM_PAYLOAD_SCHEMA,
});
const TASK_ROOM_COMMAND_SCHEMA = z.discriminatedUnion('command', [
    LIST_ROOMS_COMMAND_SCHEMA,
    GET_ROOM_OVERVIEW_COMMAND_SCHEMA,
    SEARCH_ROOMS_COMMAND_SCHEMA,
    OPEN_ROOM_COMMAND_SCHEMA,
    JOIN_ROOM_COMMAND_SCHEMA,
    DECLARE_CONTEXT_COMMAND_SCHEMA,
    POST_MESSAGE_COMMAND_SCHEMA,
    GET_ROOM_UPDATES_COMMAND_SCHEMA,
    GET_ROOM_HISTORY_COMMAND_SCHEMA,
    WATCH_ROOM_COMMAND_SCHEMA,
    SUBMIT_FINAL_POSITION_COMMAND_SCHEMA,
    RECORD_HUMAN_FEEDBACK_COMMAND_SCHEMA,
    ADD_ARTIFACT_COMMAND_SCHEMA,
    RECORD_DECISION_COMMAND_SCHEMA,
    CLOSE_ROOM_COMMAND_SCHEMA,
]);
function nowIso() {
    return new Date().toISOString();
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function stringifyCommandHelp() {
    return [
        'Ожидаю A2A data-part с командой task-room.',
        'Пример:',
        JSON.stringify({
            kind: 'task-room-command',
            command: 'open_room',
            payload: {
                title: 'Аудит задачи',
                taskDescription: 'Сверить замечания между агентами',
                initiatorId: 'reviewer-agent',
            },
        }),
        '',
        'Для живой подписки используйте команду watch_room через sendMessageStream или sendMessage с blocking=false.',
    ].join('\n');
}
function toDataPart(data) {
    return {
        kind: 'data',
        data,
    };
}
export class TaskRoomA2AExecutor {
    roomService;
    activeWatchTasks = new Map();
    constructor(roomService) {
        this.roomService = roomService;
    }
    cancelTask = async (taskId) => {
        const activeWatch = this.activeWatchTasks.get(taskId);
        if (!activeWatch) {
            return;
        }
        this.finishWatchTask(activeWatch, 'canceled', 'Подписка на комнату остановлена пользователем.');
    };
    async execute(requestContext, eventBus) {
        let keepStreamOpen = false;
        try {
            const command = this.extractCommand(requestContext.userMessage);
            if (command.command === 'watch_room') {
                await this.executeWatchRoom(command, requestContext, eventBus);
                keepStreamOpen = true;
                return;
            }
            const executionResult = await this.executeCommand(command);
            eventBus.publish(this.buildDirectCommandTask(requestContext, executionResult.summary));
            eventBus.publish(this.buildAgentMessage(requestContext, [
                {
                    kind: 'text',
                    text: executionResult.summary,
                },
                toDataPart({
                    kind: 'task-room-result',
                    command: executionResult.command,
                    ok: true,
                    result: executionResult.result,
                }),
            ]));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            eventBus.publish(this.buildAgentMessage(requestContext, [
                {
                    kind: 'text',
                    text: message,
                },
                toDataPart({
                    kind: 'task-room-error',
                    ok: false,
                    message,
                    supportedCommands: TASK_ROOM_COMMAND_SCHEMA.options.map((option) => option.shape.command.value),
                    usage: stringifyCommandHelp(),
                }),
            ]));
        }
        finally {
            if (!keepStreamOpen) {
                eventBus.finished();
            }
        }
    }
    async executeCommand(command) {
        switch (command.command) {
            case 'list_rooms': {
                const result = (await this.roomService.listRooms());
                return {
                    command: command.command,
                    result,
                    summary: `Найдено комнат: ${Array.isArray(result.rooms) ? result.rooms.length : 0}.`,
                };
            }
            case 'get_room_overview': {
                const result = (await this.roomService.getRoomOverview(command.payload.roomId));
                return {
                    command: command.command,
                    result,
                    summary: `Статус комнаты ${command.payload.roomId}: ${String(result.room?.status ?? 'unknown')}.`,
                };
            }
            case 'search_rooms': {
                const result = (await this.roomService.searchRooms({
                    query: command.payload?.query,
                    status: command.payload?.status,
                    limit: command.payload?.limit,
                }));
                return {
                    command: command.command,
                    result,
                    summary: `Найдено комнат: ${Array.isArray(result.rooms) ? result.rooms.length : 0}.`,
                };
            }
            case 'open_room': {
                const result = (await this.roomService.openRoom(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Комната ${String(result.roomId ?? '')} открыта.`,
                };
            }
            case 'join_room': {
                const result = (await this.roomService.joinRoom(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Участник ${command.payload.participantId} подключён к комнате ${command.payload.roomId}.`,
                };
            }
            case 'declare_context': {
                const result = (await this.roomService.declareContext(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Контекст участника ${command.payload.participantId} сохранён.`,
                };
            }
            case 'post_room_message': {
                const result = (await this.roomService.postRoomMessage(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Сообщение ${command.payload.kind} опубликовано в комнате ${command.payload.roomId}.`,
                };
            }
            case 'get_room_updates': {
                const result = (await this.roomService.getRoomUpdates(command.payload.roomId, command.payload.afterSequence ?? 0, command.payload.limit ?? 100));
                return {
                    command: command.command,
                    result,
                    summary: `Получено обновлений: ${Array.isArray(result.updates) ? result.updates.length : 0}.`,
                };
            }
            case 'get_room_history': {
                const result = (await this.roomService.getRoomHistory(command.payload.roomId, command.payload.limit ?? 50));
                return {
                    command: command.command,
                    result,
                    summary: `Получено history entries: ${Array.isArray(result.entries) ? result.entries.length : 0}.`,
                };
            }
            case 'submit_final_position': {
                const result = (await this.roomService.submitFinalPosition(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Финальная позиция участника ${command.payload.participantId} сохранена.`,
                };
            }
            case 'record_human_feedback': {
                const result = (await this.roomService.recordHumanFeedback(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Решение человека ${command.payload.verdict} зафиксировано.`,
                };
            }
            case 'add_artifact': {
                const result = (await this.roomService.addArtifact(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Артефакт ${command.payload.title} сохранён.`,
                };
            }
            case 'record_decision': {
                const result = (await this.roomService.recordDecision(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Решение ${command.payload.title} записано.`,
                };
            }
            case 'close_task_room': {
                const result = (await this.roomService.closeRoom(command.payload));
                return {
                    command: command.command,
                    result,
                    summary: `Комната ${command.payload.roomId} закрыта.`,
                };
            }
            case 'watch_room': {
                throw new Error('watch_room должен выполняться в task/stream режиме.');
            }
        }
    }
    async executeWatchRoom(command, requestContext, eventBus) {
        const overview = await this.roomService.getRoomOverview(command.payload.roomId);
        const activeWatch = {
            taskId: requestContext.taskId,
            roomId: command.payload.roomId,
            contextId: requestContext.contextId,
            cursor: command.payload.afterSequence ?? 0,
            limit: command.payload.limit ?? 100,
            eventBus,
            unsubscribe: () => undefined,
            processing: Promise.resolve(),
            closed: false,
        };
        activeWatch.unsubscribe = this.roomService.subscribeToRoom(command.payload.roomId, (_event) => {
            this.queueWatchFlush(activeWatch.taskId);
        });
        this.activeWatchTasks.set(activeWatch.taskId, activeWatch);
        eventBus.publish(this.buildWatchTask(requestContext, overview.room));
        await this.flushWatchTask(activeWatch.taskId);
    }
    queueWatchFlush(taskId) {
        const activeWatch = this.activeWatchTasks.get(taskId);
        if (!activeWatch || activeWatch.closed) {
            return;
        }
        activeWatch.processing = activeWatch.processing
            .then(async () => {
            await this.flushWatchTask(taskId);
        })
            .catch((error) => {
            const latestWatch = this.activeWatchTasks.get(taskId);
            if (!latestWatch || latestWatch.closed) {
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            this.finishWatchTask(latestWatch, 'failed', `Подписка на комнату завершилась с ошибкой: ${message}`);
        });
    }
    async flushWatchTask(taskId) {
        const activeWatch = this.activeWatchTasks.get(taskId);
        if (!activeWatch || activeWatch.closed) {
            return;
        }
        const overview = await this.roomService.getRoomOverview(activeWatch.roomId);
        const updates = await this.roomService.getRoomUpdates(activeWatch.roomId, activeWatch.cursor, activeWatch.limit);
        if (updates.updates.length > 0) {
            activeWatch.eventBus.publish(this.buildWatchArtifactUpdate(activeWatch, overview.room, updates));
            activeWatch.cursor = updates.latestSequence;
        }
        if (overview.room.status === ROOM_STATUS.COMPLETED) {
            this.finishWatchTask(activeWatch, 'completed', `Комната ${activeWatch.roomId} завершена.`);
        }
    }
    finishWatchTask(activeWatch, state, text) {
        if (activeWatch.closed) {
            return;
        }
        activeWatch.closed = true;
        activeWatch.unsubscribe();
        this.activeWatchTasks.delete(activeWatch.taskId);
        activeWatch.eventBus.publish(this.buildWatchStatusUpdate(activeWatch.taskId, activeWatch.contextId, state, text));
        activeWatch.eventBus.finished();
    }
    buildWatchTask(requestContext, room) {
        return {
            kind: 'task',
            id: requestContext.taskId,
            contextId: requestContext.contextId,
            status: {
                state: 'working',
                timestamp: nowIso(),
                message: this.buildAgentMessage(requestContext, [
                    {
                        kind: 'text',
                        text: `Подписка на комнату ${room.roomId} активна. Новые сообщения будут приходить в поток.`,
                    },
                    toDataPart({
                        kind: 'task-room-watch-started',
                        roomId: room.roomId,
                        status: room.status,
                        statusReason: room.statusReason,
                    }),
                ]),
            },
            history: [requestContext.userMessage],
            metadata: {
                roomId: room.roomId,
                taskType: 'watch_room',
            },
        };
    }
    buildDirectCommandTask(requestContext, summary) {
        return {
            kind: 'task',
            id: requestContext.taskId,
            contextId: requestContext.contextId,
            status: {
                state: 'completed',
                timestamp: nowIso(),
                message: this.buildAgentMessage(requestContext, [
                    {
                        kind: 'text',
                        text: summary,
                    },
                    toDataPart({
                        kind: 'task-room-command-finished',
                        summary,
                    }),
                ]),
            },
            history: [requestContext.userMessage],
            metadata: {
                taskType: 'direct_command',
            },
        };
    }
    buildWatchArtifactUpdate(activeWatch, room, updates) {
        const summary = [
            `Комната ${room.roomId}: статус ${room.status}.`,
            `Новых событий: ${updates.updates.length}.`,
            `Последняя sequence: ${updates.latestSequence}.`,
        ].join(' ');
        return {
            kind: 'artifact-update',
            taskId: activeWatch.taskId,
            contextId: activeWatch.contextId,
            append: true,
            artifact: {
                artifactId: 'room-feed',
                name: 'task-room-feed',
                description: 'Непрерывная лента обновлений комнаты.',
                parts: [
                    {
                        kind: 'text',
                        text: summary,
                    },
                    toDataPart({
                        kind: 'task-room-stream-event',
                        roomId: room.roomId,
                        status: room.status,
                        statusReason: room.statusReason,
                        latestSequence: updates.latestSequence,
                        updates: updates.updates,
                    }),
                ],
            },
        };
    }
    buildWatchStatusUpdate(taskId, contextId, state, text) {
        return {
            kind: 'status-update',
            taskId,
            contextId,
            final: true,
            status: {
                state,
                timestamp: nowIso(),
                message: {
                    kind: 'message',
                    messageId: randomUUID(),
                    role: 'agent',
                    contextId,
                    taskId,
                    parts: [
                        {
                            kind: 'text',
                            text,
                        },
                        toDataPart({
                            kind: 'task-room-watch-finished',
                            state,
                            text,
                        }),
                    ],
                },
            },
        };
    }
    extractCommand(message) {
        const rawEnvelope = this.extractRawEnvelope(message.parts);
        return TASK_ROOM_COMMAND_SCHEMA.parse(rawEnvelope);
    }
    extractRawEnvelope(parts) {
        const dataPart = parts.find((part) => part.kind === 'data');
        if (dataPart && isRecord(dataPart.data)) {
            return dataPart.data;
        }
        const textPart = parts.find((part) => part.kind === 'text');
        const text = textPart?.text?.trim();
        if (!text) {
            throw new Error(stringifyCommandHelp());
        }
        try {
            return JSON.parse(text);
        }
        catch {
            throw new Error(stringifyCommandHelp());
        }
    }
    buildAgentMessage(requestContext, parts) {
        return {
            kind: 'message',
            messageId: randomUUID(),
            role: 'agent',
            contextId: requestContext.contextId,
            taskId: requestContext.taskId,
            parts,
        };
    }
}
//# sourceMappingURL=TaskRoomA2AExecutor.js.map