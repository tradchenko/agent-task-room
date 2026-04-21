import { randomUUID } from 'node:crypto';
import { DECISION_LOG_STATUSES, ROOM_ARTIFACT_KINDS, ROOM_STATUS, } from './room-types.js';
function nowIso() {
    return new Date().toISOString();
}
function trimText(value) {
    return typeof value === 'string' ? value.trim() : '';
}
export class RoomService {
    repository;
    rooms = new Map();
    roomListeners = new Map();
    constructor(repository) {
        this.repository = repository;
    }
    async load() {
        const storedRooms = await this.repository.loadAll();
        this.rooms.clear();
        for (const storedRoom of storedRooms) {
            const room = this.normalizeRoom(storedRoom);
            room.sharedPrompt = this.buildSharedPrompt(room);
            this.syncRoomStatus(room);
            this.rooms.set(room.roomId, room);
        }
        return this.rooms.size;
    }
    async listRooms() {
        return {
            rooms: [...this.rooms.values()]
                .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
                .map((room) => this.summarizeRoom(room)),
        };
    }
    async searchRooms(input) {
        const searchableRepository = this.repository;
        if (typeof searchableRepository.searchRooms === 'function') {
            return searchableRepository.searchRooms({
                ...input,
                limit: this.normalizeLimit(input.limit, 20),
            });
        }
        const query = trimText(input.query).toLowerCase();
        const status = trimText(input.status);
        const limit = this.normalizeLimit(input.limit, 20);
        const rooms = [...this.rooms.values()]
            .filter((room) => (status && status !== 'all' ? room.status === status : true))
            .map((room) => this.buildSearchResult(room, query))
            .filter((entry) => entry !== null)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .slice(0, limit);
        return { rooms };
    }
    async getRoomHistory(roomId, limit = 50) {
        const searchableRepository = this.repository;
        if (typeof searchableRepository.getRoomHistory === 'function') {
            return searchableRepository.getRoomHistory(roomId, this.normalizeLimit(limit, 50, 200));
        }
        const room = this.getRoomOrThrow(roomId);
        return {
            entries: this.buildHistoryEntries(room).slice(0, this.normalizeLimit(limit, 50, 200)),
        };
    }
    async openRoom(input) {
        const room = this.createRoom(input);
        await this.persistAndEmit(room);
        return {
            roomId: room.roomId,
            status: room.status,
            sharedPrompt: room.sharedPrompt,
            nextActions: [
                'Подключить второго участника через join_task_room.',
                'Опубликовать declare_context для обеих сторон.',
                'Начать обмен findings, evidence и proposals.',
            ],
        };
    }
    async joinRoom(input) {
        const room = this.getRoomOrThrow(input.roomId);
        this.normalizeParticipant(room, input.participantId, input.role, input.participantLabel);
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            roomId: room.roomId,
            status: room.status,
            sharedPrompt: room.sharedPrompt,
        };
    }
    async getRoomOverview(roomId) {
        const room = this.getRoomOrThrow(roomId);
        return { room: this.summarizeRoom(room) };
    }
    async declareContext(input) {
        const room = this.getRoomOrThrow(input.roomId);
        const participant = this.normalizeParticipant(room, input.participantId, input.role, input.participantLabel);
        participant.context = {
            systemScope: input.systemScope,
            summary: input.summary,
            constraints: input.constraints ?? [],
            artifacts: input.artifacts ?? [],
            confidence: input.confidence ?? 'medium',
            updatedAt: nowIso(),
        };
        participant.updatedAt = nowIso();
        this.addMessage(room, {
            authorType: 'participant',
            authorId: participant.participantId,
            kind: 'system_note',
            title: 'Контекст обновлён',
            body: [
                `${participant.label} объявил локальный контекст.`,
                `Scope: ${input.systemScope}`,
                `Summary: ${input.summary}`,
                input.constraints?.length ? `Constraints: ${input.constraints.join('; ')}` : '',
                input.artifacts?.length ? `Artifacts: ${input.artifacts.join('; ')}` : '',
            ]
                .filter(Boolean)
                .join('\n'),
        });
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            status: room.status,
            latestSequence: room.nextSequence - 1,
        };
    }
    async postRoomMessage(input) {
        const room = this.getRoomOrThrow(input.roomId);
        const participant = this.normalizeParticipant(room, input.participantId, input.role, input.participantLabel);
        this.addMessage(room, {
            authorType: 'participant',
            authorId: participant.participantId,
            kind: input.kind,
            title: input.title,
            body: input.body,
            references: input.references ?? [],
        });
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            status: room.status,
            latestSequence: room.nextSequence - 1,
        };
    }
    async postHumanMessage(input) {
        const room = this.getRoomOrThrow(input.roomId);
        this.addMessage(room, {
            authorType: 'human',
            authorId: trimText(input.humanLabel) || 'human',
            kind: 'human_note',
            title: trimText(input.title) || 'Сообщение человека',
            body: input.body,
            references: input.references ?? [],
        });
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            status: room.status,
            latestSequence: room.nextSequence - 1,
        };
    }
    async addArtifact(input) {
        const room = this.getRoomOrThrow(input.roomId);
        const actor = this.resolveActor(room, input);
        const artifact = this.addArtifactEntry(room, actor, {
            kind: input.kind,
            title: input.title,
            uri: input.uri,
            summary: input.summary,
            content: input.content,
            tags: input.tags,
        });
        this.addMessage(room, {
            authorType: actor.authorType,
            authorId: actor.authorId,
            kind: actor.authorType === 'human' ? 'human_note' : 'system_note',
            title: 'Артефакт добавлен',
            body: [
                `${actor.authorLabel} добавил артефакт ${artifact.kind}.`,
                `Title: ${artifact.title}`,
                artifact.summary ? `Summary: ${artifact.summary}` : '',
                artifact.uri ? `URI: ${artifact.uri}` : '',
                artifact.tags.length > 0 ? `Tags: ${artifact.tags.join(', ')}` : '',
            ]
                .filter(Boolean)
                .join('\n'),
            references: input.references ?? [],
        });
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            artifactId: artifact.artifactId,
            status: room.status,
            latestSequence: room.nextSequence - 1,
        };
    }
    async recordDecision(input) {
        const room = this.getRoomOrThrow(input.roomId);
        const actor = this.resolveActor(room, input);
        const decision = this.addDecisionEntry(room, actor, {
            title: input.title,
            summary: input.summary,
            rationale: input.rationale,
            references: input.references,
            status: input.status,
        });
        this.addMessage(room, {
            authorType: actor.authorType,
            authorId: actor.authorId,
            kind: actor.authorType === 'human' ? 'human_note' : 'system_note',
            title: 'Решение записано',
            body: [
                `${actor.authorLabel} записал решение в decision log.`,
                `Title: ${decision.title}`,
                `Status: ${decision.status}`,
                `Summary: ${decision.summary}`,
                decision.rationale ? `Rationale: ${decision.rationale}` : '',
            ]
                .filter(Boolean)
                .join('\n'),
            references: decision.references,
        });
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            decisionId: decision.decisionId,
            status: room.status,
            latestSequence: room.nextSequence - 1,
        };
    }
    async getRoomUpdates(roomId, afterSequence = 0, limit = 50) {
        const room = this.getRoomOrThrow(roomId);
        const updates = room.messages.filter((message) => message.sequence > afterSequence).slice(0, limit);
        return {
            status: room.status,
            latestSequence: room.nextSequence - 1,
            updates: updates.map((message) => structuredClone(message)),
        };
    }
    async submitFinalPosition(input) {
        const room = this.getRoomOrThrow(input.roomId);
        const participant = this.normalizeParticipant(room, input.participantId, input.role, input.participantLabel);
        participant.finalPosition = {
            stance: input.stance,
            summary: input.summary,
            decisions: input.decisions,
            openQuestions: input.openQuestions ?? [],
            submittedAt: nowIso(),
        };
        participant.updatedAt = nowIso();
        this.addMessage(room, {
            authorType: 'participant',
            authorId: participant.participantId,
            kind: 'final_position',
            title: 'Финальная позиция',
            body: [
                `Stance: ${input.stance}`,
                `Summary: ${input.summary}`,
                'Decisions:',
                ...input.decisions.map((decision, index) => `${index + 1}. ${decision}`),
                input.openQuestions?.length
                    ? `Open questions:\n${input.openQuestions.map((question) => `- ${question}`).join('\n')}`
                    : '',
            ]
                .filter(Boolean)
                .join('\n'),
        });
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            status: room.status,
            latestSequence: room.nextSequence - 1,
        };
    }
    async recordHumanFeedback(input) {
        const room = this.getRoomOrThrow(input.roomId);
        const feedback = {
            verdict: input.verdict,
            comment: trimText(input.comment) || null,
            humanLabel: trimText(input.humanLabel) || 'human',
            createdAt: nowIso(),
        };
        room.humanFeedback.push(feedback);
        this.addMessage(room, {
            authorType: 'human',
            authorId: feedback.humanLabel,
            kind: 'human_feedback',
            title: 'Решение человека',
            body: [`Verdict: ${feedback.verdict}`, feedback.comment ? `Comment: ${feedback.comment}` : '']
                .filter(Boolean)
                .join('\n'),
        });
        if (feedback.verdict === 'approve_solution') {
            room.closedAt = nowIso();
            room.closedBy = feedback.humanLabel;
            room.resolution = 'approved_by_human';
        }
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            status: room.status,
            latestSequence: room.nextSequence - 1,
        };
    }
    async closeRoom(input) {
        const room = this.getRoomOrThrow(input.roomId);
        room.closedAt = nowIso();
        room.closedBy = trimText(input.actorLabel) || 'manual';
        room.resolution = input.resolution ?? 'manual_close';
        this.addMessage(room, {
            authorType: 'system',
            authorId: room.closedBy,
            kind: 'system_note',
            title: 'Комната закрыта',
            body: `${room.closedBy} закрыл комнату с резолюцией ${room.resolution}.`,
        });
        this.syncRoomStatus(room);
        await this.persistAndEmit(room);
        return {
            status: room.status,
            resolution: room.resolution,
        };
    }
    subscribeToRoom(roomId, listener) {
        const listeners = this.roomListeners.get(roomId) ?? new Set();
        listeners.add(listener);
        this.roomListeners.set(roomId, listeners);
        return () => {
            const existing = this.roomListeners.get(roomId);
            if (!existing) {
                return;
            }
            existing.delete(listener);
            if (existing.size === 0) {
                this.roomListeners.delete(roomId);
            }
        };
    }
    async persist() {
        // Сервис хранит состояние в памяти и после каждой значимой операции
        // сбрасывает полный снимок комнат в репозиторий.
        await this.repository.saveAll([...this.rooms.values()].map((room) => structuredClone(room)));
    }
    async persistAndEmit(room) {
        await this.persist();
        this.emitRoomEvent(room);
    }
    createRoom(input) {
        if (!trimText(input.taskDescription) && !trimText(input.jiraUrl)) {
            throw new Error('Нужно передать либо taskDescription, либо jiraUrl.');
        }
        const roomId = trimText(input.roomId) || `room-${randomUUID()}`;
        const room = {
            roomId,
            title: trimText(input.title) || 'Без названия',
            taskInput: {
                taskDescription: trimText(input.taskDescription) || null,
                jiraUrl: trimText(input.jiraUrl) || null,
                comment: trimText(input.comment) || null,
            },
            createdAt: nowIso(),
            updatedAt: nowIso(),
            status: ROOM_STATUS.OPEN,
            statusReason: 'Ожидается подключение второго участника.',
            statusFingerprint: '',
            closedAt: null,
            closedBy: null,
            resolution: null,
            participants: {},
            messages: [],
            humanFeedback: [],
            artifacts: [],
            decisionLog: [],
            nextSequence: 1,
            sharedPrompt: '',
        };
        const initiator = this.normalizeParticipant(room, input.initiatorId, input.initiatorRole, input.initiatorLabel);
        this.addMessage(room, {
            authorType: 'system',
            authorId: 'system',
            kind: 'system_note',
            title: 'Комната создана',
            body: `${initiator.label} открыл task-room. Следующий шаг: подключить остальных участников и объявить контекст.`,
        });
        if (room.taskInput.jiraUrl) {
            this.addArtifactEntry(room, {
                authorType: 'system',
                authorId: 'system',
                authorLabel: 'system',
            }, {
                kind: 'jira_issue',
                title: `Связанная Jira-задача для ${room.title}`,
                uri: room.taskInput.jiraUrl,
                summary: room.taskInput.comment || 'Комната открыта по внешней Jira-задаче.',
                tags: ['jira', 'source'],
            });
        }
        room.sharedPrompt = this.buildSharedPrompt(room);
        this.rooms.set(room.roomId, room);
        this.syncRoomStatus(room);
        return room;
    }
    normalizeRoom(room) {
        return {
            roomId: trimText(room.roomId) || `room-${randomUUID()}`,
            title: trimText(room.title) || 'Без названия',
            taskInput: {
                taskDescription: trimText(room.taskInput?.taskDescription) || null,
                jiraUrl: trimText(room.taskInput?.jiraUrl) || null,
                comment: trimText(room.taskInput?.comment) || null,
            },
            createdAt: trimText(room.createdAt) || nowIso(),
            updatedAt: trimText(room.updatedAt) || nowIso(),
            status: room.status ?? ROOM_STATUS.OPEN,
            statusReason: trimText(room.statusReason) || 'Ожидается подключение второго участника.',
            statusFingerprint: trimText(room.statusFingerprint),
            closedAt: trimText(room.closedAt) || null,
            closedBy: trimText(room.closedBy) || null,
            resolution: trimText(room.resolution) || null,
            participants: Object.fromEntries(Object.entries(room.participants ?? {}).map(([participantId, participant]) => [
                trimText(participantId) || trimText(participant.participantId),
                this.normalizeStoredParticipant(participant),
            ])),
            messages: (room.messages ?? []).map((message) => this.normalizeStoredMessage(message)),
            humanFeedback: (room.humanFeedback ?? []).map((feedback) => this.normalizeStoredFeedback(feedback)),
            artifacts: (room.artifacts ?? []).map((artifact) => this.normalizeStoredArtifact(artifact)),
            decisionLog: (room.decisionLog ?? []).map((decision) => this.normalizeStoredDecision(decision)),
            nextSequence: Number.isInteger(room.nextSequence) ? room.nextSequence : 1,
            sharedPrompt: trimText(room.sharedPrompt),
        };
    }
    normalizeStoredParticipant(participant) {
        return {
            participantId: trimText(participant.participantId),
            role: trimText(participant.role) || 'peer',
            label: trimText(participant.label) || trimText(participant.participantId),
            createdAt: trimText(participant.createdAt) || nowIso(),
            updatedAt: trimText(participant.updatedAt) || nowIso(),
            context: participant.context ? this.normalizeStoredContext(participant.context) : null,
            finalPosition: participant.finalPosition ? this.normalizeStoredFinalPosition(participant.finalPosition) : null,
        };
    }
    normalizeStoredContext(context) {
        return {
            systemScope: trimText(context.systemScope) || null,
            summary: trimText(context.summary) || null,
            constraints: [...(context.constraints ?? [])].map(String).filter(Boolean),
            artifacts: [...(context.artifacts ?? [])].map(String).filter(Boolean),
            confidence: context.confidence ?? 'medium',
            updatedAt: trimText(context.updatedAt) || nowIso(),
        };
    }
    normalizeStoredFinalPosition(finalPosition) {
        return {
            stance: finalPosition.stance,
            summary: trimText(finalPosition.summary),
            decisions: [...(finalPosition.decisions ?? [])].map(String).filter(Boolean),
            openQuestions: [...(finalPosition.openQuestions ?? [])].map(String).filter(Boolean),
            submittedAt: trimText(finalPosition.submittedAt) || nowIso(),
        };
    }
    normalizeStoredMessage(message) {
        return {
            sequence: Number.isInteger(message.sequence) ? message.sequence : 1,
            authorType: message.authorType,
            authorId: trimText(message.authorId) || 'system',
            kind: message.kind,
            title: trimText(message.title) || null,
            body: trimText(message.body),
            references: [...(message.references ?? [])].map(String).filter(Boolean),
            createdAt: trimText(message.createdAt) || nowIso(),
        };
    }
    normalizeStoredFeedback(feedback) {
        return {
            verdict: feedback.verdict,
            comment: trimText(feedback.comment) || null,
            humanLabel: trimText(feedback.humanLabel) || 'human',
            createdAt: trimText(feedback.createdAt) || nowIso(),
        };
    }
    normalizeStoredArtifact(artifact) {
        return {
            artifactId: trimText(artifact.artifactId) || `artifact-${randomUUID()}`,
            kind: ROOM_ARTIFACT_KINDS.includes(artifact.kind) ? artifact.kind : 'note',
            title: trimText(artifact.title) || 'Артефакт без названия',
            uri: trimText(artifact.uri) || null,
            summary: trimText(artifact.summary) || null,
            content: trimText(artifact.content) || null,
            tags: [...(artifact.tags ?? [])].map(String).map(trimText).filter(Boolean),
            authorType: artifact.authorType ?? 'system',
            authorId: trimText(artifact.authorId) || 'system',
            authorLabel: trimText(artifact.authorLabel) || trimText(artifact.authorId) || 'system',
            createdAt: trimText(artifact.createdAt) || nowIso(),
            updatedAt: trimText(artifact.updatedAt) || nowIso(),
        };
    }
    normalizeStoredDecision(decision) {
        return {
            decisionId: trimText(decision.decisionId) || `decision-${randomUUID()}`,
            title: trimText(decision.title) || 'Решение без названия',
            summary: trimText(decision.summary),
            rationale: trimText(decision.rationale) || null,
            references: [...(decision.references ?? [])].map(String).map(trimText).filter(Boolean),
            status: DECISION_LOG_STATUSES.includes(decision.status) ? decision.status : 'proposed',
            authorType: decision.authorType ?? 'system',
            authorId: trimText(decision.authorId) || 'system',
            authorLabel: trimText(decision.authorLabel) || trimText(decision.authorId) || 'system',
            createdAt: trimText(decision.createdAt) || nowIso(),
            updatedAt: trimText(decision.updatedAt) || nowIso(),
        };
    }
    getRoomOrThrow(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error(`Комната ${roomId} не найдена.`);
        }
        return room;
    }
    normalizeParticipant(room, participantId, role, participantLabel) {
        const normalizedParticipantId = trimText(participantId);
        if (!normalizedParticipantId) {
            throw new Error('participantId обязателен.');
        }
        const existing = room.participants[normalizedParticipantId];
        const normalizedRole = trimText(role) || 'peer';
        const normalizedLabel = trimText(participantLabel) || normalizedParticipantId;
        if (existing) {
            existing.role = trimText(role) || existing.role || normalizedRole;
            existing.label = trimText(participantLabel) || existing.label || normalizedLabel;
            existing.updatedAt = nowIso();
            return existing;
        }
        const participant = {
            participantId: normalizedParticipantId,
            role: normalizedRole,
            label: normalizedLabel,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            context: null,
            finalPosition: null,
        };
        room.participants[normalizedParticipantId] = participant;
        return participant;
    }
    summarizeRoom(room) {
        return {
            roomId: room.roomId,
            title: room.title,
            taskInput: structuredClone(room.taskInput),
            status: room.status,
            statusReason: room.statusReason,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt,
            closedAt: room.closedAt,
            resolution: room.resolution,
            sharedPrompt: room.sharedPrompt,
            messageCount: room.messages.length,
            latestSequence: room.nextSequence - 1,
            participants: Object.values(room.participants).map((participant) => this.summarizeParticipant(participant)),
            humanFeedback: structuredClone(room.humanFeedback),
            artifacts: structuredClone(room.artifacts),
            decisionLog: structuredClone(room.decisionLog),
        };
    }
    summarizeParticipant(participant) {
        return {
            participantId: participant.participantId,
            label: participant.label,
            role: participant.role,
            contextDeclared: Boolean(participant.context),
            systemScope: participant.context?.systemScope ?? null,
            confidence: participant.context?.confidence ?? null,
            finalPositionSubmitted: Boolean(participant.finalPosition),
            finalStance: participant.finalPosition?.stance ?? null,
            updatedAt: participant.updatedAt,
        };
    }
    summarizeTask(room) {
        const lines = [];
        if (room.taskInput.taskDescription) {
            lines.push(`Описание задачи: ${room.taskInput.taskDescription}`);
        }
        if (room.taskInput.jiraUrl) {
            lines.push(`Jira: ${room.taskInput.jiraUrl}`);
        }
        if (room.taskInput.comment) {
            lines.push(`Комментарий: ${room.taskInput.comment}`);
        }
        return lines.join('\n');
    }
    normalizeLimit(value, fallback, max = 100) {
        if (!Number.isFinite(value) || !value || value <= 0) {
            return fallback;
        }
        return Math.min(Math.trunc(value), max);
    }
    buildSearchResult(room, query) {
        const searchSources = this.collectSearchSources(room);
        if (!query) {
            const fallbackSource = searchSources.find((source) => source.text.length > 0) ?? null;
            return {
                roomId: room.roomId,
                title: room.title,
                status: room.status,
                createdAt: room.createdAt,
                updatedAt: room.updatedAt,
                closedAt: room.closedAt,
                resolution: room.resolution,
                snippet: fallbackSource ? this.buildSnippet(fallbackSource.text, '') : null,
                matchSource: ['recent'],
            };
        }
        const matchedSources = searchSources.filter((source) => source.text.toLowerCase().includes(query));
        if (matchedSources.length === 0) {
            return null;
        }
        return {
            roomId: room.roomId,
            title: room.title,
            status: room.status,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt,
            closedAt: room.closedAt,
            resolution: room.resolution,
            snippet: this.buildSnippet(matchedSources[0]?.text ?? '', query),
            matchSource: matchedSources.map((source) => source.source),
        };
    }
    collectSearchSources(room) {
        const sources = [
            { source: 'room', text: room.roomId },
            { source: 'title', text: room.title },
            { source: 'status', text: room.statusReason },
            { source: 'task', text: room.taskInput.taskDescription ?? '' },
            { source: 'jira', text: room.taskInput.jiraUrl ?? '' },
            { source: 'comment', text: room.taskInput.comment ?? '' },
        ];
        for (const participant of Object.values(room.participants)) {
            sources.push({
                source: 'participant',
                text: [participant.label, participant.role, participant.context?.systemScope, participant.context?.summary]
                    .filter(Boolean)
                    .join(' '),
            });
        }
        for (const message of room.messages) {
            sources.push({
                source: 'message',
                text: [message.title, message.body, ...message.references].filter(Boolean).join(' '),
            });
        }
        for (const artifact of room.artifacts) {
            sources.push({
                source: 'artifact',
                text: [artifact.title, artifact.summary, artifact.content, artifact.uri, ...artifact.tags]
                    .filter(Boolean)
                    .join(' '),
            });
        }
        for (const decision of room.decisionLog) {
            sources.push({
                source: 'decision',
                text: [decision.title, decision.summary, decision.rationale, decision.status, ...decision.references]
                    .filter(Boolean)
                    .join(' '),
            });
        }
        for (const feedback of room.humanFeedback) {
            sources.push({
                source: 'human_feedback',
                text: [feedback.humanLabel, feedback.verdict, feedback.comment].filter(Boolean).join(' '),
            });
        }
        return sources.map((source) => ({
            source: source.source,
            text: trimText(source.text),
        }));
    }
    buildSnippet(text, query) {
        const normalizedText = trimText(text);
        if (!normalizedText) {
            return null;
        }
        if (!query) {
            return normalizedText.slice(0, 180);
        }
        const lowerText = normalizedText.toLowerCase();
        const matchIndex = lowerText.indexOf(query.toLowerCase());
        if (matchIndex < 0) {
            return normalizedText.slice(0, 180);
        }
        const start = Math.max(0, matchIndex - 48);
        const end = Math.min(normalizedText.length, matchIndex + query.length + 96);
        const prefix = start > 0 ? '...' : '';
        const suffix = end < normalizedText.length ? '...' : '';
        return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
    }
    buildHistoryEntries(room) {
        const entries = [
            ...room.messages.map((message) => ({
                entryId: `message-${room.roomId}-${message.sequence}`,
                roomId: room.roomId,
                entryType: 'message',
                kind: message.kind,
                title: message.title,
                body: message.body,
                authorType: message.authorType,
                authorId: message.authorId,
                authorLabel: this.resolveHistoryAuthorLabel(room, message.authorType, message.authorId),
                createdAt: message.createdAt,
                references: [...message.references],
            })),
            ...room.artifacts.map((artifact) => ({
                entryId: artifact.artifactId,
                roomId: room.roomId,
                entryType: 'artifact',
                kind: artifact.kind,
                title: artifact.title,
                body: [artifact.summary, artifact.content, artifact.uri, artifact.tags.join(', ')].filter(Boolean).join('\n'),
                authorType: artifact.authorType,
                authorId: artifact.authorId,
                authorLabel: artifact.authorLabel,
                createdAt: artifact.createdAt,
                references: [...artifact.tags],
            })),
            ...room.decisionLog.map((decision) => ({
                entryId: decision.decisionId,
                roomId: room.roomId,
                entryType: 'decision',
                kind: decision.status,
                title: decision.title,
                body: [decision.summary, decision.rationale].filter(Boolean).join('\n'),
                authorType: decision.authorType,
                authorId: decision.authorId,
                authorLabel: decision.authorLabel,
                createdAt: decision.createdAt,
                references: [...decision.references],
            })),
            ...room.humanFeedback.map((feedback, index) => ({
                entryId: `human-feedback-${room.roomId}-${index}-${feedback.createdAt}`,
                roomId: room.roomId,
                entryType: 'human_feedback',
                kind: feedback.verdict,
                title: 'Решение человека',
                body: [feedback.verdict, feedback.comment].filter(Boolean).join('\n'),
                authorType: 'human',
                authorId: feedback.humanLabel,
                authorLabel: feedback.humanLabel,
                createdAt: feedback.createdAt,
                references: [],
            })),
        ];
        return entries.sort((left, right) => {
            const byDate = right.createdAt.localeCompare(left.createdAt);
            if (byDate !== 0) {
                return byDate;
            }
            return right.entryId.localeCompare(left.entryId);
        });
    }
    resolveHistoryAuthorLabel(room, authorType, authorId) {
        if (authorType === 'participant') {
            return room.participants[authorId]?.label ?? authorId;
        }
        return authorId;
    }
    buildSharedPrompt(room) {
        return [
            `Task room: ${room.roomId}`,
            `Заголовок: ${room.title}`,
            this.summarizeTask(room),
            '',
            'Правила общей беседы:',
            '1. Сначала каждый участник публикует свой контекст через declare_context.',
            '2. Внешние ссылки, диффы, логи и issue/PR прикладывайте в artifacts, а не только в сообщения.',
            '3. Промежуточные и финальные договорённости фиксируйте в decision log.',
            '4. Для обсуждения используйте типизированные сообщения finding/question/constraint/evidence/proposal/counterargument/request_check/verification_result.',
            '5. Сильные утверждения должны сопровождаться evidence, constraint или verification_result.',
            '6. Когда позиция созрела, агент публикует её через submit_final_position.',
            '7. После финальных позиций люди подтверждают решение, отклоняют его или оставляют сессию активной.',
        ]
            .filter(Boolean)
            .join('\n');
    }
    resolveActor(room, input) {
        if (trimText(input.participantId)) {
            const participant = this.normalizeParticipant(room, String(input.participantId), input.role, input.participantLabel);
            return {
                authorType: 'participant',
                authorId: participant.participantId,
                authorLabel: participant.label,
            };
        }
        if (trimText(input.humanLabel)) {
            const humanLabel = trimText(input.humanLabel);
            return {
                authorType: 'human',
                authorId: humanLabel,
                authorLabel: humanLabel,
            };
        }
        throw new Error('Нужно указать participantId или humanLabel.');
    }
    addArtifactEntry(room, actor, input) {
        const artifact = {
            artifactId: `artifact-${randomUUID()}`,
            kind: input.kind,
            title: trimText(input.title) || 'Артефакт без названия',
            uri: trimText(input.uri) || null,
            summary: trimText(input.summary) || null,
            content: trimText(input.content) || null,
            tags: [...(input.tags ?? [])].map(String).map(trimText).filter(Boolean),
            authorType: actor.authorType,
            authorId: actor.authorId,
            authorLabel: actor.authorLabel,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        room.artifacts.push(artifact);
        room.updatedAt = nowIso();
        return artifact;
    }
    addDecisionEntry(room, actor, input) {
        const decision = {
            decisionId: `decision-${randomUUID()}`,
            title: trimText(input.title) || 'Решение без названия',
            summary: trimText(input.summary),
            rationale: trimText(input.rationale) || null,
            references: [...(input.references ?? [])].map(String).map(trimText).filter(Boolean),
            status: input.status ?? 'proposed',
            authorType: actor.authorType,
            authorId: actor.authorId,
            authorLabel: actor.authorLabel,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        room.decisionLog.push(decision);
        room.updatedAt = nowIso();
        return decision;
    }
    addMessage(room, input) {
        // Лента комнаты — это единый источник правды и для людей, и для агентов.
        const message = {
            sequence: room.nextSequence++,
            authorType: input.authorType,
            authorId: input.authorId,
            kind: input.kind,
            title: trimText(input.title) || null,
            body: input.body,
            references: input.references ?? [],
            createdAt: nowIso(),
        };
        room.messages.push(message);
        room.updatedAt = nowIso();
        return message;
    }
    emitRoomEvent(room) {
        const listeners = this.roomListeners.get(room.roomId);
        if (!listeners || listeners.size === 0) {
            return;
        }
        const event = {
            roomId: room.roomId,
            status: room.status,
            statusReason: room.statusReason,
            latestSequence: room.nextSequence - 1,
            updatedAt: room.updatedAt,
            resolution: room.resolution,
        };
        for (const listener of [...listeners]) {
            listener(structuredClone(event));
        }
    }
    syncRoomStatus(room) {
        const evaluation = this.evaluateRoomStatus(room);
        const fingerprint = JSON.stringify(evaluation);
        if (room.statusFingerprint === fingerprint) {
            room.status = evaluation.status;
            room.statusReason = evaluation.reason;
            return evaluation;
        }
        room.status = evaluation.status;
        room.statusReason = evaluation.reason;
        room.statusFingerprint = fingerprint;
        // Системное изменение статуса тоже попадает в общую ленту,
        // чтобы обе стороны видели, почему комната перешла в новое состояние.
        this.addMessage(room, {
            authorType: 'system',
            authorId: 'system',
            kind: 'system_note',
            title: `Статус комнаты: ${evaluation.status}`,
            body: evaluation.reason,
        });
        return evaluation;
    }
    evaluateRoomStatus(room) {
        // Правила статусов держим в одном месте, чтобы MCP, HTTP UI и CLI
        // не пытались самостоятельно вычислять одно и то же разными способами.
        if (room.closedAt) {
            return {
                status: ROOM_STATUS.COMPLETED,
                reason: `Сессия закрыта: ${room.resolution ?? 'manual_close'}.`,
            };
        }
        const latestHumanFeedback = room.humanFeedback.at(-1) ?? null;
        if (latestHumanFeedback?.verdict === 'approve_solution') {
            return {
                status: ROOM_STATUS.COMPLETED,
                reason: `Люди подтвердили решение.${latestHumanFeedback.comment ? ` Комментарий: ${latestHumanFeedback.comment}` : ''}`,
            };
        }
        if (latestHumanFeedback?.verdict === 'keep_session_active') {
            return {
                status: ROOM_STATUS.ACTIVE_FOLLOWUP,
                reason: [
                    'Люди оставили сессию активной для продолжения работы.',
                    latestHumanFeedback.comment ? `Комментарий: ${latestHumanFeedback.comment}` : '',
                ]
                    .filter(Boolean)
                    .join('\n'),
            };
        }
        if (latestHumanFeedback?.verdict === 'reject_solution') {
            return {
                status: ROOM_STATUS.ACTIVE_FOLLOWUP,
                reason: [
                    'Люди отклонили предложенное решение. Нужно продолжить обсуждение.',
                    latestHumanFeedback.comment ? `Комментарий: ${latestHumanFeedback.comment}` : '',
                ]
                    .filter(Boolean)
                    .join('\n'),
            };
        }
        const participants = Object.values(room.participants);
        if (participants.length < 2) {
            return {
                status: ROOM_STATUS.OPEN,
                reason: 'Ожидается подключение второго участника.',
            };
        }
        const participantsWithoutContext = participants.filter((participant) => !participant.context);
        if (participantsWithoutContext.length > 0) {
            return {
                status: ROOM_STATUS.ACTIVE_DISCUSSION,
                reason: [
                    'Сессия открыта, но не все участники объявили контекст.',
                    ...participants.map((participant) => this.formatParticipantLine(participant)),
                    'Что делать дальше:',
                    '1. Каждый участник должен опубликовать declare_context со своим scope, summary и ограничениями.',
                    '2. После этого можно продолжать обсуждение и публиковать findings/proposals/evidence.',
                ].join('\n'),
            };
        }
        const finalParticipants = participants.filter((participant) => participant.finalPosition);
        if (finalParticipants.length === participants.length) {
            const disagreements = finalParticipants.filter((participant) => ['needs_human_decision', 'disagree'].includes(participant.finalPosition?.stance ?? ''));
            if (disagreements.length === 0) {
                return {
                    status: ROOM_STATUS.NEEDS_HUMAN_CONFIRMATION,
                    reason: [
                        'Все участники опубликовали финальную позицию и пришли к общему решению.',
                        ...participants.map((participant) => this.formatParticipantLine(participant)),
                        'Что делать дальше:',
                        '1. Люди должны проверить итоговые позиции и подтвердить решение через record_human_feedback verdict=approve_solution.',
                        '2. Если решение нужно доработать, используйте verdict=reject_solution или keep_session_active.',
                    ].join('\n'),
                };
            }
            return {
                status: ROOM_STATUS.NEEDS_HUMAN_CONFIRMATION,
                reason: [
                    'Участники опубликовали финальные позиции, но между ними остались расхождения.',
                    ...participants.map((participant) => this.formatParticipantLine(participant)),
                    'Что делать дальше:',
                    '1. Люди должны просмотреть разногласия и решить, продолжать ли сессию.',
                    '2. Если нужно продолжить обсуждение, используйте record_human_feedback verdict=keep_session_active.',
                ].join('\n'),
            };
        }
        return {
            status: ROOM_STATUS.ACTIVE_DISCUSSION,
            reason: [
                'Идёт активное обсуждение задачи.',
                ...participants.map((participant) => this.formatParticipantLine(participant)),
                'Что делать дальше:',
                '1. Публикуйте findings, constraints, evidence и proposals.',
                '2. Когда позиция созрела, отправьте submit_final_position.',
            ].join('\n'),
        };
    }
    formatParticipantLine(participant) {
        const scope = participant.context?.systemScope ? `, scope=${participant.context.systemScope}` : '';
        const finalStance = participant.finalPosition?.stance ? `, final=${participant.finalPosition.stance}` : '';
        return `- ${participant.label} (${participant.participantId}, ${participant.role}${scope}${finalStance})`;
    }
}
//# sourceMappingURL=RoomService.js.map