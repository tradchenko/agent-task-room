import fs from 'node:fs';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DefaultTaskRoomCliRuntime } from './DefaultTaskRoomCliRuntime.js';
import { getBooleanOption, getListOption, getStringOption } from '../shared/CliArgs.js';
import { LOCAL_STATE_DIR_NAME, StatePaths } from '../shared/StatePaths.js';
import { buildTaskRoomAgentPrompt } from '../shared/TaskRoomAgentPrompt.js';
import { buildNgrokInstallHelp, formatTimestamp, powerShellEscape, readJsonIfExists, readPid, shellEscape, sleep, writeJson, writeText, } from '../shared/SystemUtils.js';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8876;
const DEFAULT_MCP_PATH = '/mcp';
const DEFAULT_WATCH_INTERVAL = 5;
export class TaskRoomCli {
    cwd;
    statePaths;
    runtime;
    constructor(cwd = process.cwd(), runtime) {
        this.cwd = cwd;
        this.statePaths = new StatePaths(this.cwd);
        this.runtime = runtime ?? new DefaultTaskRoomCliRuntime();
    }
    async run(command, options) {
        switch (command) {
            case 'help':
            case '--help':
            case '-h':
                this.printHelp();
                return;
            case 'start':
                await this.commandStart(options);
                return;
            case 'session':
                await this.commandSession(options);
                return;
            case 'start-local':
                await this.commandStartLocal(options);
                return;
            case 'open':
                await this.commandOpen(options);
                return;
            case 'join':
                await this.commandJoin(options);
                await this.ensureWatch(this.resolveWatchInterval(options));
                return;
            case 'sync':
                await this.commandSync(options);
                return;
            case 'watch':
                await this.commandWatch(options);
                return;
            case 'context':
                await this.commandContext(options);
                return;
            case 'message':
                await this.commandMessage(options);
                return;
            case 'search':
                await this.commandSearch(options);
                return;
            case 'history':
                await this.commandHistory(options);
                return;
            case 'artifact':
                await this.commandArtifact(options);
                return;
            case 'decision':
                await this.commandDecision(options);
                return;
            case 'position':
                await this.commandPosition(options);
                return;
            case 'human-confirm':
                await this.commandHumanConfirm(options);
                return;
            case 'status':
                await this.commandStatus(options);
                return;
            case 'close':
                await this.commandClose(options);
                return;
            case 'stop':
                await this.commandStop();
                return;
            case 'doctor':
                await this.commandDoctor();
                return;
            default:
                throw new Error(`Неизвестная команда: ${command}. Используйте help.`);
        }
    }
    printBanner(title) {
        process.stdout.write(`\n=== ${title} ===\n`);
    }
    printHelp() {
        process.stdout.write(`
agent-task-room

Команды:
  agent-task-room session --title "..." --task "..." [--comment "..."]
  agent-task-room session --title "..." --jira "https://jira/..." [--comment "..."]
  agent-task-room start --title "..." --task "..." [--comment "..."]
  agent-task-room start --title "..." --jira "https://jira/..." [--comment "..."]
  agent-task-room start-local --title "..." --task "..." [--comment "..."]
  agent-task-room start-local --title "..." --jira "https://jira/..." [--comment "..."]
  agent-task-room join
  agent-task-room sync
  agent-task-room watch [--interval 5]
  agent-task-room context --system-scope "..." --summary "..." [--constraint "..."] [--artifact "..."]
  agent-task-room message --kind proposal --body "..." [--title "..."] [--ref "..."]
  agent-task-room search [--query "..."] [--status OPEN|ACTIVE_DISCUSSION|NEEDS_HUMAN_CONFIRMATION|ACTIVE_FOLLOWUP|COMPLETED] [--limit 20]
  agent-task-room history [--room-id "..."] [--limit 50]
  agent-task-room artifact --kind github_issue --title "..." [--uri "..."] [--summary "..."] [--tag "..."] [--ref "..."]
  agent-task-room decision --title "..." --summary "..." [--status proposed|accepted|rejected|superseded] [--rationale "..."] [--ref "..."]
  agent-task-room position --stance agree|agree_with_risks|needs_human_decision|disagree --summary "..." --decision "..."
  agent-task-room human-confirm --verdict approve_solution|reject_solution|keep_session_active [--comment "..."]
  agent-task-room status
  agent-task-room close
  agent-task-room stop
  agent-task-room doctor
`);
    }
    readLocalState() {
        return readJsonIfExists(this.statePaths.sessionFile);
    }
    writeLocalState(state) {
        writeJson(this.statePaths.sessionFile, state);
    }
    resolveAuthToken(options, localState) {
        return (getStringOption(options, 'token') ??
            process.env.AGENT_TASK_ROOM_TOKEN ??
            localState?.auth.token ??
            null);
    }
    resolveServerUrl(options, localState) {
        return (getStringOption(options, 'url') ??
            process.env.AGENT_TASK_ROOM_URL ??
            localState?.serverUrl ??
            `http://${DEFAULT_HOST}:${DEFAULT_PORT}${DEFAULT_MCP_PATH}`);
    }
    resolveRoomId(options, localState) {
        return (getStringOption(options, 'room-id') ??
            process.env.AGENT_TASK_ROOM_ROOM_ID ??
            localState?.roomId ??
            null);
    }
    resolveParticipant(options, localState) {
        const localParticipant = localState?.participant ?? null;
        const participantId = getStringOption(options, 'participant-id') ??
            process.env.AGENT_TASK_ROOM_PARTICIPANT_ID ??
            localParticipant?.participantId;
        if (!participantId) {
            throw new Error('Нужен participant-id. Передай --participant-id или задай AGENT_TASK_ROOM_PARTICIPANT_ID.');
        }
        const sameParticipant = localParticipant && localParticipant.participantId === participantId ? localParticipant : null;
        return {
            participantId,
            participantLabel: getStringOption(options, 'participant-label') ??
                process.env.AGENT_TASK_ROOM_PARTICIPANT_LABEL ??
                sameParticipant?.participantLabel ??
                participantId,
            role: getStringOption(options, 'role') ??
                process.env.AGENT_TASK_ROOM_ROLE ??
                sameParticipant?.role ??
                'peer',
        };
    }
    buildHeaders(token) {
        return token ? { Authorization: `Bearer ${token}` } : {};
    }
    async withClient(serverUrl, token, callback) {
        const client = new Client({ name: 'agent-task-room-client', version: '0.1.0' });
        const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
            requestInit: {
                headers: this.buildHeaders(token),
            },
        });
        await client.connect(transport);
        try {
            return await callback(client);
        }
        finally {
            await client.close();
        }
    }
    readToolStructuredContent(toolName, result) {
        if (result.isError) {
            throw new Error(this.extractToolErrorMessage(toolName, result));
        }
        if (result.structuredContent && typeof result.structuredContent === 'object') {
            return result.structuredContent;
        }
        throw new Error(`Инструмент ${toolName} вернул ответ без structuredContent.`);
    }
    extractToolErrorMessage(toolName, result) {
        const textParts = Array.isArray(result.content)
            ? result.content
                .flatMap((part) => {
                if (part.type === 'text' && typeof part.text === 'string') {
                    return [part.text.trim()];
                }
                return [];
            })
                .filter(Boolean)
            : [];
        return textParts[0] || `Инструмент ${toolName} завершился с ошибкой.`;
    }
    formatMessage(message) {
        const title = message.title ? ` | ${message.title}` : '';
        const refs = message.references.length ? ` | refs: ${message.references.join(', ')}` : '';
        return `[${message.sequence}] ${message.createdAt} ${message.authorId} ${message.kind}${title}${refs}\n${message.body}`;
    }
    findParticipant(overview, participantId) {
        return overview.participants.find((participant) => participant.participantId === participantId) ?? null;
    }
    buildNextSteps(overview, participant) {
        const participantSnapshot = this.findParticipant(overview, participant.participantId);
        const finalParticipants = overview.participants.filter((entry) => entry.finalPositionSubmitted);
        if (overview.status === 'OPEN') {
            return [
                'Передайте второму участнику команду join и дождитесь его подключения.',
                participantSnapshot?.contextDeclared
                    ? 'Ваш контекст уже опубликован. Когда второй участник подключится, можно переходить к обсуждению.'
                    : 'Опубликуйте свой контекст через `agent-task-room context --system-scope "..." --summary "..."`.',
            ];
        }
        if (overview.status === 'ACTIVE_DISCUSSION') {
            if (!participantSnapshot?.contextDeclared) {
                return [
                    'Опубликуйте ваш локальный контекст через `agent-task-room context --system-scope "..." --summary "..."`.',
                    'После этого публикуйте findings, constraints, evidence и proposals.',
                ];
            }
            return [
                'Продолжайте обсуждение через message/context.',
                'Когда позиция готова, отправьте её через `agent-task-room position --stance ... --summary "..." --decision "..."`.',
            ];
        }
        if (overview.status === 'NEEDS_HUMAN_CONFIRMATION') {
            const allAgree = finalParticipants.every((entry) => ['agree', 'agree_with_risks'].includes(entry.finalStance ?? ''));
            if (allAgree) {
                return [
                    'Люди должны подтвердить итоговое решение или отклонить его.',
                    'Подтверждение: `agent-task-room human-confirm --verdict approve_solution --comment "..."`.',
                    'Отклонение: `agent-task-room human-confirm --verdict reject_solution --comment "..."`.',
                    'Если нужно сохранить сессию активной: `agent-task-room human-confirm --verdict keep_session_active --comment "..."`.',
                ];
            }
            return [
                'У агентов есть расхождения, людям нужно решить, продолжать ли обсуждение.',
                'Чтобы продолжить: `agent-task-room human-confirm --verdict keep_session_active --comment "..."`.',
                'Чтобы отклонить текущую гипотезу: `agent-task-room human-confirm --verdict reject_solution --comment "..."`.',
            ];
        }
        if (overview.status === 'ACTIVE_FOLLOWUP') {
            return ['Люди решили продолжить сессию. Обновите контекст, опубликуйте новые findings и дойдите до новой финальной позиции.'];
        }
        if (overview.status === 'COMPLETED') {
            return ['Сессия завершена. Если нужен новый цикл, откройте новую room через start/open.'];
        }
        return [];
    }
    writeAlertFiles(payload) {
        const lines = [
            `Обновлено: ${formatTimestamp()}`,
            `Комната: ${payload.overview.roomId}`,
            `Участник: ${payload.participant.participantLabel} (${payload.participant.participantId}, ${payload.participant.role})`,
            `Статус: ${payload.overview.status}`,
            '',
            'Причина:',
            payload.overview.statusReason,
            '',
            'Что делать дальше:',
            ...payload.nextSteps.map((step, index) => `${index + 1}. ${step}`),
        ];
        writeJson(this.statePaths.alertsJsonFile, {
            updatedAt: formatTimestamp(),
            roomId: payload.overview.roomId,
            status: payload.overview.status,
            statusReason: payload.overview.statusReason,
            nextSteps: payload.nextSteps,
            participant: payload.participant,
            overview: payload.overview,
        });
        writeText(this.statePaths.alertsTextFile, `${lines.join('\n')}\n`);
    }
    writePromptArtifacts(payload) {
        writeText(this.statePaths.shareFile, [
            'Что передать коллеге',
            '',
            `Ссылка владельцу: ${payload.ownerRoomUrl}`,
            `Ссылка второму участнику: ${payload.peerInviteUrl}`,
            `MCP URL: ${payload.publicMcpUrl}`,
            `A2A JSON-RPC URL: ${payload.publicA2AJsonRpcUrl}`,
            `A2A REST URL: ${payload.publicA2ARestUrl}`,
            '',
            'Linux/macOS:',
            payload.joinPosixCommand,
            '',
            'Windows PowerShell:',
            payload.joinPowerShellCommand,
            '',
            'Готовый A2A envelope для живой подписки:',
            payload.examples.watchRoomEnvelope,
            '',
            'Готовый A2A envelope для webhook-push:',
            payload.examples.pushEnvelope,
            '',
        ].join('\n'));
        writeText(this.statePaths.localPromptFile, `${payload.localPrompt}\n`);
        writeText(this.statePaths.peerPromptFile, `${payload.peerPrompt}\n`);
        writeText(this.statePaths.a2aWatchExampleFile, `${payload.examples.watchRoomEnvelope}\n`);
        writeText(this.statePaths.a2aPushExampleFile, `${payload.examples.pushEnvelope}\n`);
    }
    buildA2AExamples(roomId) {
        const watchEnvelope = {
            message: {
                messageId: 'replace-with-uuid',
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
                                afterSequence: 0,
                            },
                        },
                    },
                ],
            },
        };
        const pushEnvelope = {
            configuration: {
                blocking: false,
                pushNotificationConfig: {
                    url: 'https://your-webhook.example/task-room',
                    token: 'replace-with-webhook-token',
                },
            },
            message: {
                messageId: 'replace-with-uuid',
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
                                afterSequence: 0,
                            },
                        },
                    },
                ],
            },
        };
        return {
            watchRoomEnvelope: JSON.stringify(watchEnvelope, null, 2),
            pushEnvelope: JSON.stringify(pushEnvelope, null, 2),
        };
    }
    buildParticipantRoomUrl(payload) {
        const basePath = payload.invite ? '/join' : '/rooms';
        const url = new URL(`${basePath}/${encodeURIComponent(payload.roomId)}`, payload.uiUrl);
        url.searchParams.set('token', payload.token);
        url.searchParams.set('participant-id', payload.participant.participantId);
        url.searchParams.set('participant-label', payload.participant.participantLabel);
        url.searchParams.set('role', payload.participant.role);
        url.searchParams.set('prompt', payload.prompt);
        return url.toString();
    }
    buildChatPrompt(roleLabel) {
        return [
            buildTaskRoomAgentPrompt(roleLabel),
            `Сначала выполни \`agent-task-room sync\`, затем проверь \`${LOCAL_STATE_DIR_NAME}/alerts/latest.txt\`.`,
        ].join('\n');
    }
    resolveWatchInterval(options) {
        const watchInterval = Number(getStringOption(options, 'watch-interval', String(DEFAULT_WATCH_INTERVAL)));
        return Number.isFinite(watchInterval) && watchInterval > 0 ? watchInterval : DEFAULT_WATCH_INTERVAL;
    }
    async commandOpen(options) {
        const localState = this.readLocalState();
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const title = getStringOption(options, 'title');
        const taskDescription = getStringOption(options, 'task');
        const jiraUrl = getStringOption(options, 'jira');
        const comment = getStringOption(options, 'comment');
        if (!title) {
            throw new Error('Для open/start нужен --title.');
        }
        if (!taskDescription && !jiraUrl) {
            throw new Error('Нужно передать либо --task, либо --jira.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            const opened = await client.callTool({
                name: 'open_task_room',
                arguments: {
                    title,
                    taskDescription,
                    jiraUrl,
                    comment,
                    initiatorId: participant.participantId,
                    initiatorLabel: participant.participantLabel,
                    initiatorRole: participant.role,
                },
            });
            const roomData = this.readToolStructuredContent('open_task_room', opened);
            this.writeLocalState({
                serverUrl,
                roomId: roomData.roomId,
                participant,
                auth: { token: authToken },
                cursor: { lastSequence: 0 },
                sync: { lastStatus: roomData.status },
                sharedPrompt: roomData.sharedPrompt,
                updatedAt: formatTimestamp(),
            });
            this.printBanner('Комната открыта');
            process.stdout.write(`roomId: ${roomData.roomId}\n`);
            process.stdout.write(`${roomData.sharedPrompt}\n`);
        });
        writeText(this.statePaths.localPromptFile, `${this.buildChatPrompt(participant.role)}\n`);
        if (!getBooleanOption(options, 'no-auto-sync', false)) {
            await this.commandSync(options);
        }
    }
    async commandJoin(options) {
        const localState = this.readLocalState();
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        if (!roomId) {
            throw new Error('Для join нужен room-id.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            const joined = await client.callTool({
                name: 'join_task_room',
                arguments: {
                    roomId,
                    participantId: participant.participantId,
                    participantLabel: participant.participantLabel,
                    role: participant.role,
                },
            });
            const roomData = this.readToolStructuredContent('join_task_room', joined);
            this.writeLocalState({
                serverUrl,
                roomId,
                participant,
                auth: { token: authToken },
                cursor: { lastSequence: 0 },
                sync: { lastStatus: roomData.status },
                sharedPrompt: roomData.sharedPrompt,
                updatedAt: formatTimestamp(),
            });
            this.printBanner('Участник подключён');
            process.stdout.write(`roomId: ${roomId}\n`);
            process.stdout.write(`${roomData.sharedPrompt}\n`);
        });
        writeText(this.statePaths.localPromptFile, `${this.buildChatPrompt(participant.role)}\n`);
        if (!getBooleanOption(options, 'no-auto-sync', false)) {
            await this.commandSync(options);
        }
    }
    async commandSync(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден. Сначала выполните start/open или join.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const previousStatus = localState.sync.lastStatus ?? null;
        await this.withClient(serverUrl, authToken, async (client) => {
            const overviewResult = await client.callTool({
                name: 'get_room_overview',
                arguments: { roomId },
            });
            const updatesResult = await client.callTool({
                name: 'get_room_updates',
                arguments: {
                    roomId,
                    afterSequence: localState.cursor.lastSequence ?? 0,
                    limit: 100,
                },
            });
            const overview = this.readToolStructuredContent('get_room_overview', overviewResult).room;
            const updates = this.readToolStructuredContent('get_room_updates', updatesResult);
            const nextSteps = this.buildNextSteps(overview, participant);
            if (overview.status !== previousStatus) {
                this.printBanner(`Статус: ${overview.status}`);
                process.stdout.write(`${overview.statusReason}\n`);
            }
            if (nextSteps.length > 0) {
                this.printBanner('Что делать дальше');
                for (const step of nextSteps) {
                    process.stdout.write(`- ${step}\n`);
                }
            }
            if (updates.updates.length > 0) {
                this.printBanner(`Новые сообщения (${updates.updates.length})`);
                for (const message of updates.updates) {
                    process.stdout.write(`${this.formatMessage(message)}\n\n`);
                }
            }
            else {
                this.printBanner('Новых сообщений нет');
            }
            this.writeLocalState({
                ...localState,
                serverUrl,
                roomId: roomId ?? localState.roomId,
                participant,
                auth: { token: authToken },
                cursor: { lastSequence: updates.latestSequence },
                sync: {
                    lastStatus: overview.status,
                    lastStatusReason: overview.statusReason,
                    nextSteps,
                    lastSyncAt: formatTimestamp(),
                },
                sharedPrompt: overview.sharedPrompt,
                updatedAt: formatTimestamp(),
            });
            this.writeAlertFiles({
                overview,
                participant,
                nextSteps,
            });
        });
    }
    async commandWatch(options) {
        const intervalSeconds = Number(getStringOption(options, 'interval', String(DEFAULT_WATCH_INTERVAL)));
        const once = getBooleanOption(options, 'once', false);
        if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
            throw new Error('--interval должен быть положительным числом.');
        }
        do {
            try {
                await this.commandSync(options);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.printBanner('Ошибка синхронизации');
                process.stderr.write(`${message}\n`);
            }
            if (once) {
                break;
            }
            await sleep(intervalSeconds * 1000);
        } while (true);
    }
    async commandContext(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const systemScope = getStringOption(options, 'system-scope');
        const summary = getStringOption(options, 'summary');
        if (!systemScope || !summary) {
            throw new Error('Для context нужны --system-scope и --summary.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            await client.callTool({
                name: 'declare_context',
                arguments: {
                    roomId,
                    participantId: participant.participantId,
                    participantLabel: participant.participantLabel,
                    role: participant.role,
                    systemScope,
                    summary,
                    constraints: getListOption(options, 'constraint'),
                    artifacts: getListOption(options, 'artifact'),
                    confidence: getStringOption(options, 'confidence', 'medium'),
                },
            });
        });
        await this.commandSync(options);
    }
    async commandMessage(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const body = getStringOption(options, 'body');
        if (!body) {
            throw new Error('Для message нужен --body.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            await client.callTool({
                name: 'post_room_message',
                arguments: {
                    roomId,
                    participantId: participant.participantId,
                    participantLabel: participant.participantLabel,
                    role: participant.role,
                    kind: getStringOption(options, 'kind', 'proposal'),
                    title: getStringOption(options, 'title'),
                    body,
                    references: getListOption(options, 'ref'),
                },
            });
        });
        await this.commandSync(options);
    }
    async commandSearch(options) {
        const localState = this.readLocalState();
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        await this.withClient(serverUrl, authToken, async (client) => {
            const result = await client.callTool({
                name: 'search_task_rooms',
                arguments: {
                    query: getStringOption(options, 'query'),
                    status: getStringOption(options, 'status'),
                    limit: Number(getStringOption(options, 'limit', '20')),
                },
            });
            const payload = this.readToolStructuredContent('search_task_rooms', result);
            this.printBanner('Найденные комнаты');
            if (!payload.rooms || payload.rooms.length === 0) {
                process.stdout.write('Совпадений не найдено.\n');
                return;
            }
            for (const room of payload.rooms) {
                process.stdout.write(`${room.title} [${room.status}] · ${room.roomId}\n`);
                if (room.snippet) {
                    process.stdout.write(`${room.snippet}\n`);
                }
                if (room.matchSource.length > 0) {
                    process.stdout.write(`match: ${room.matchSource.join(', ')}\n`);
                }
                process.stdout.write('\n');
            }
        });
    }
    async commandHistory(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        await this.withClient(serverUrl, authToken, async (client) => {
            const result = await client.callTool({
                name: 'get_room_history',
                arguments: {
                    roomId,
                    limit: Number(getStringOption(options, 'limit', '50')),
                },
            });
            const payload = this.readToolStructuredContent('get_room_history', result);
            this.printBanner(`История комнаты ${roomId}`);
            if (!payload.entries || payload.entries.length === 0) {
                process.stdout.write('История пока пуста.\n');
                return;
            }
            for (const entry of payload.entries) {
                process.stdout.write(`[${entry.createdAt}] ${entry.entryType}/${entry.kind} · ${entry.authorLabel}\n`);
                if (entry.title) {
                    process.stdout.write(`${entry.title}\n`);
                }
                process.stdout.write(`${entry.body}\n`);
                if (entry.references.length > 0) {
                    process.stdout.write(`refs: ${entry.references.join(', ')}\n`);
                }
                process.stdout.write('\n');
            }
        });
    }
    async commandArtifact(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const kind = getStringOption(options, 'kind');
        const title = getStringOption(options, 'title');
        if (!kind || !title) {
            throw new Error('Для artifact нужны --kind и --title.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            await client.callTool({
                name: 'add_room_artifact',
                arguments: {
                    roomId,
                    participantId: participant.participantId,
                    participantLabel: participant.participantLabel,
                    role: participant.role,
                    kind,
                    title,
                    uri: getStringOption(options, 'uri'),
                    summary: getStringOption(options, 'summary'),
                    content: getStringOption(options, 'content'),
                    tags: getListOption(options, 'tag'),
                    references: getListOption(options, 'ref'),
                },
            });
        });
        await this.commandSync(options);
    }
    async commandDecision(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const title = getStringOption(options, 'title');
        const summary = getStringOption(options, 'summary');
        if (!title || !summary) {
            throw new Error('Для decision нужны --title и --summary.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            await client.callTool({
                name: 'record_room_decision',
                arguments: {
                    roomId,
                    participantId: participant.participantId,
                    participantLabel: participant.participantLabel,
                    role: participant.role,
                    title,
                    summary,
                    rationale: getStringOption(options, 'rationale'),
                    references: getListOption(options, 'ref'),
                    status: getStringOption(options, 'status'),
                },
            });
        });
        await this.commandSync(options);
    }
    async commandPosition(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        const participant = this.resolveParticipant(options, localState);
        const stance = getStringOption(options, 'stance');
        const summary = getStringOption(options, 'summary');
        const decisions = getListOption(options, 'decision');
        if (!stance || !summary || decisions.length === 0) {
            throw new Error('Для position нужны --stance, --summary и хотя бы один --decision.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            await client.callTool({
                name: 'submit_final_position',
                arguments: {
                    roomId,
                    participantId: participant.participantId,
                    participantLabel: participant.participantLabel,
                    role: participant.role,
                    stance,
                    summary,
                    decisions,
                    openQuestions: getListOption(options, 'question'),
                },
            });
        });
        await this.commandSync(options);
    }
    async commandHumanConfirm(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        const verdict = getStringOption(options, 'verdict');
        if (!verdict) {
            throw new Error('Для human-confirm нужен --verdict.');
        }
        await this.withClient(serverUrl, authToken, async (client) => {
            await client.callTool({
                name: 'record_human_feedback',
                arguments: {
                    roomId,
                    humanLabel: getStringOption(options, 'human-label', process.env.AGENT_TASK_ROOM_HUMAN_LABEL ?? 'human'),
                    verdict,
                    comment: getStringOption(options, 'comment'),
                },
            });
        });
        await this.commandSync(options);
    }
    async commandStatus(options) {
        await this.commandSync({ ...options, once: true });
    }
    async commandClose(options) {
        const localState = this.readLocalState();
        if (!localState) {
            throw new Error('Локальный session state не найден.');
        }
        const serverUrl = this.resolveServerUrl(options, localState);
        const authToken = this.resolveAuthToken(options, localState);
        const roomId = this.resolveRoomId(options, localState);
        await this.withClient(serverUrl, authToken, async (client) => {
            await client.callTool({
                name: 'close_task_room',
                arguments: {
                    roomId,
                    actorLabel: getStringOption(options, 'actor-label', localState.participant.participantLabel),
                    resolution: getStringOption(options, 'resolution', 'manual_close'),
                },
            });
        });
        await this.commandSync(options);
    }
    async ensureServer(host, port, mcpPath, token, cwd) {
        const server = await this.runtime.startServer({
            host,
            port,
            mcpPath,
            token,
            cwd,
            statePaths: this.statePaths,
        });
        writeJson(this.statePaths.serverPidFile, server.pid);
        return server;
    }
    async ensureNgrok(binary, localPort) {
        const ngrok = await this.runtime.startNgrok({
            binary,
            localPort,
            cwd: this.cwd,
            statePaths: this.statePaths,
        });
        writeJson(this.statePaths.ngrokPidFile, ngrok.pid);
        return ngrok;
    }
    async ensureWatch(intervalSeconds) {
        const watchPid = await this.runtime.startWatch({
            intervalSeconds,
            cwd: this.cwd,
            statePaths: this.statePaths,
        });
        writeJson(this.statePaths.watchPidFile, watchPid);
        return watchPid;
    }
    async runStartFlow(options, transportMode, commandLabel = transportMode === 'local' ? 'start-local' : 'start') {
        // start/start-local/session — главный пользовательский сценарий:
        // поднять сервер, создать комнату и выдать готовые ссылки для владельца и второго участника.
        const existingLaunch = readJsonIfExists(this.statePaths.launchFile);
        const host = getStringOption(options, 'host', DEFAULT_HOST) ?? DEFAULT_HOST;
        const port = Number(getStringOption(options, 'port', String(DEFAULT_PORT)));
        const mcpPath = getStringOption(options, 'mcp-path', DEFAULT_MCP_PATH) ?? DEFAULT_MCP_PATH;
        const token = getStringOption(options, 'token', existingLaunch?.token ?? randomUUID()) ?? randomUUID();
        const title = getStringOption(options, 'title');
        const taskDescription = getStringOption(options, 'task');
        const jiraUrl = getStringOption(options, 'jira');
        const comment = getStringOption(options, 'comment');
        const participantId = getStringOption(options, 'participant-id', 'host-agent') ?? 'host-agent';
        const participantLabel = getStringOption(options, 'participant-label', 'Host Agent') ?? 'Host Agent';
        const role = getStringOption(options, 'role', 'initiator') ?? 'initiator';
        const peerParticipantId = getStringOption(options, 'peer-id', 'peer-agent') ?? 'peer-agent';
        const peerParticipantLabel = getStringOption(options, 'peer-label', 'Peer Agent') ?? 'Peer Agent';
        const peerRole = getStringOption(options, 'peer-role', 'peer') ?? 'peer';
        if (!title) {
            throw new Error(`Для ${commandLabel} нужен --title.`);
        }
        if (!taskDescription && !jiraUrl) {
            throw new Error(`Для ${commandLabel} нужен либо --task, либо --jira.`);
        }
        const server = await this.ensureServer(host, port, mcpPath, token, this.cwd);
        const localUiUrl = server.baseUrl;
        const localA2AJsonRpcUrl = `${localUiUrl}/a2a/jsonrpc`;
        const localA2ARestUrl = `${localUiUrl}/a2a/rest`;
        let publicUiUrl = localUiUrl;
        let publicMcpUrl = server.mcpUrl;
        let publicA2AJsonRpcUrl = localA2AJsonRpcUrl;
        let publicA2ARestUrl = localA2ARestUrl;
        let ngrokPid = 0;
        if (transportMode === 'public') {
            const ngrokBinary = this.runtime.resolveNgrokBinary();
            if (!ngrokBinary) {
                throw new Error(buildNgrokInstallHelp());
            }
            const ngrok = await this.ensureNgrok(ngrokBinary, port);
            publicUiUrl = ngrok.publicUrl;
            publicMcpUrl = `${ngrok.publicUrl}${mcpPath}`;
            publicA2AJsonRpcUrl = `${ngrok.publicUrl}/a2a/jsonrpc`;
            publicA2ARestUrl = `${ngrok.publicUrl}/a2a/rest`;
            ngrokPid = ngrok.pid;
        }
        const openOptions = {
            ...options,
            url: server.mcpUrl,
            token,
            title,
            'participant-id': participantId,
            'participant-label': participantLabel,
            role,
        };
        if (taskDescription) {
            openOptions.task = taskDescription;
        }
        if (jiraUrl) {
            openOptions.jira = jiraUrl;
        }
        if (comment) {
            openOptions.comment = comment;
        }
        await this.commandOpen(openOptions);
        const sessionState = this.readLocalState();
        if (!sessionState) {
            throw new Error('Не удалось создать локальный session state после start.');
        }
        const roomId = sessionState.roomId;
        const watchPid = await this.ensureWatch(this.resolveWatchInterval(options));
        const publicRoomUrl = this.buildParticipantRoomUrl({
            uiUrl: publicUiUrl,
            roomId,
            token,
            participant: {
                participantId,
                participantLabel,
                role,
            },
            prompt: 'local',
        });
        const localRoomUrl = this.buildParticipantRoomUrl({
            uiUrl: localUiUrl,
            roomId,
            token,
            participant: {
                participantId,
                participantLabel,
                role,
            },
            prompt: 'local',
        });
        const publicPeerInviteUrl = this.buildParticipantRoomUrl({
            uiUrl: publicUiUrl,
            roomId,
            token,
            participant: {
                participantId: peerParticipantId,
                participantLabel: peerParticipantLabel,
                role: peerRole,
            },
            prompt: 'peer',
            invite: true,
        });
        const localPeerInviteUrl = this.buildParticipantRoomUrl({
            uiUrl: localUiUrl,
            roomId,
            token,
            participant: {
                participantId: peerParticipantId,
                participantLabel: peerParticipantLabel,
                role: peerRole,
            },
            prompt: 'peer',
            invite: true,
        });
        const joinPosixCommand = [
            `AGENT_TASK_ROOM_URL=${shellEscape(publicMcpUrl)}`,
            `AGENT_TASK_ROOM_TOKEN=${shellEscape(token)}`,
            `AGENT_TASK_ROOM_ROOM_ID=${shellEscape(roomId)}`,
            `AGENT_TASK_ROOM_PARTICIPANT_ID=${shellEscape(peerParticipantId)}`,
            `AGENT_TASK_ROOM_PARTICIPANT_LABEL=${shellEscape(peerParticipantLabel)}`,
            `AGENT_TASK_ROOM_ROLE=${shellEscape(peerRole)}`,
            'agent-task-room join',
        ].join(' ');
        const joinPowerShellCommand = [
            `$env:AGENT_TASK_ROOM_URL=${powerShellEscape(publicMcpUrl)}`,
            `$env:AGENT_TASK_ROOM_TOKEN=${powerShellEscape(token)}`,
            `$env:AGENT_TASK_ROOM_ROOM_ID=${powerShellEscape(roomId)}`,
            `$env:AGENT_TASK_ROOM_PARTICIPANT_ID=${powerShellEscape(peerParticipantId)}`,
            `$env:AGENT_TASK_ROOM_PARTICIPANT_LABEL=${powerShellEscape(peerParticipantLabel)}`,
            `$env:AGENT_TASK_ROOM_ROLE=${powerShellEscape(peerRole)}`,
            'agent-task-room join',
        ].join('; ');
        const localPrompt = this.buildChatPrompt(role);
        const peerPrompt = this.buildChatPrompt(peerRole);
        const a2aExamples = this.buildA2AExamples(roomId);
        this.writePromptArtifacts({
            joinPosixCommand,
            joinPowerShellCommand,
            ownerRoomUrl: publicRoomUrl,
            peerInviteUrl: publicPeerInviteUrl,
            publicMcpUrl,
            publicA2AJsonRpcUrl,
            publicA2ARestUrl,
            localPrompt,
            peerPrompt,
            examples: a2aExamples,
        });
        const launchState = {
            createdAt: formatTimestamp(),
            token,
            roomId,
            publicMcpUrl,
            localMcpUrl: server.mcpUrl,
            publicA2AJsonRpcUrl,
            localA2AJsonRpcUrl,
            publicA2ARestUrl,
            localA2ARestUrl,
            publicUiUrl,
            localUiUrl,
            publicRoomUrl,
            localRoomUrl,
            publicPeerInviteUrl,
            localPeerInviteUrl,
            hostParticipant: {
                participantId,
                participantLabel,
                role,
            },
            peerParticipant: {
                participantId: peerParticipantId,
                participantLabel: peerParticipantLabel,
                role: peerRole,
            },
            commands: {
                joinPosixCommand,
                joinPowerShellCommand,
                stop: 'agent-task-room stop',
            },
            prompts: {
                localPrompt,
                peerPrompt,
            },
            examples: a2aExamples,
            pids: {
                server: server.pid,
                ngrok: ngrokPid,
                watch: watchPid,
            },
        };
        writeJson(this.statePaths.launchFile, launchState);
        if (!getBooleanOption(options, 'no-open', false)) {
            try {
                await this.runtime.openBrowser(publicRoomUrl);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                process.stdout.write(`Браузер не удалось открыть автоматически: ${message}\n`);
            }
        }
        this.printBanner(transportMode === 'local' ? 'Task Room Локально Готова' : 'Task Room Готова');
        process.stdout.write(`roomId: ${roomId}\n`);
        process.stdout.write(`MCP URL: ${publicMcpUrl}\n`);
        process.stdout.write(`A2A JSON-RPC URL: ${publicA2AJsonRpcUrl}\n`);
        process.stdout.write(`A2A REST URL: ${publicA2ARestUrl}\n`);
        process.stdout.write(`UI URL: ${publicUiUrl}\n`);
        process.stdout.write(`Ссылка владельцу: ${publicRoomUrl}\n`);
        process.stdout.write(`Ссылка второму участнику: ${publicPeerInviteUrl}\n`);
        process.stdout.write(`Токен: ${token}\n`);
        process.stdout.write(`watch.pid: ${watchPid}\n`);
        process.stdout.write(`Alerts: ${this.statePaths.alertsTextFile}\n`);
        process.stdout.write(`Share: ${this.statePaths.shareFile}\n`);
        process.stdout.write(`Local prompt: ${this.statePaths.localPromptFile}\n`);
        process.stdout.write(`Peer prompt: ${this.statePaths.peerPromptFile}\n`);
        process.stdout.write(`A2A watch example: ${this.statePaths.a2aWatchExampleFile}\n`);
        process.stdout.write(`A2A push example: ${this.statePaths.a2aPushExampleFile}\n`);
        this.printBanner('Что Передать Коллеге');
        process.stdout.write(`Откройте эту ссылку в браузере:\n${publicPeerInviteUrl}\n\n`);
        process.stdout.write('CLI-режим при необходимости:\n');
        process.stdout.write(`${joinPosixCommand}\n`);
        process.stdout.write('\nWindows PowerShell:\n');
        process.stdout.write(`${joinPowerShellCommand}\n`);
        this.printBanner('Что Вставить В Свой Чат С Агентом');
        process.stdout.write(`${localPrompt}\n`);
        this.printBanner('Что Коллега Должен Вставить В Свой Чат С Агентом');
        process.stdout.write(`${peerPrompt}\n`);
        this.printBanner('Готовые A2A Примеры');
        process.stdout.write('watch_room:\n');
        process.stdout.write(`${a2aExamples.watchRoomEnvelope}\n\n`);
        process.stdout.write('pushNotificationConfig:\n');
        process.stdout.write(`${a2aExamples.pushEnvelope}\n`);
    }
    async commandStart(options) {
        await this.runStartFlow(options, 'public', 'start');
    }
    async commandStartLocal(options) {
        await this.runStartFlow(options, 'local', 'start-local');
    }
    async commandSession(options) {
        await this.runStartFlow(options, 'local', 'session');
    }
    async commandStop() {
        const stopped = [];
        for (const [label, pid] of [
            ['watch', readPid(this.statePaths.watchPidFile)],
            ['ngrok', readPid(this.statePaths.ngrokPidFile)],
            ['server', readPid(this.statePaths.serverPidFile)],
        ]) {
            if (!pid) {
                continue;
            }
            await this.runtime.stopProcess(pid, 'SIGTERM');
            stopped.push(`${label}: ${pid}`);
        }
        for (const filePath of [this.statePaths.watchPidFile, this.statePaths.ngrokPidFile, this.statePaths.serverPidFile]) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        this.printBanner('Task Room Остановлена');
        process.stdout.write(stopped.length > 0 ? `${stopped.join('\n')}\n` : 'Фоновые процессы не найдены.\n');
    }
    async commandDoctor() {
        this.printBanner('Doctor');
        process.stdout.write(`Node: ${process.version}\n`);
        const ngrokBinary = this.runtime.resolveNgrokBinary();
        process.stdout.write(`ngrok: ${ngrokBinary ?? 'не найден'}\n`);
        if (!ngrokBinary) {
            process.stdout.write(`\n${buildNgrokInstallHelp()}\n`);
        }
    }
}
//# sourceMappingURL=TaskRoomCli.js.map