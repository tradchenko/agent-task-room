import { resolveLaunchScope } from './TaskRoomLaunchScope.js';
import { parseTaskRoomUiRoute } from './TaskRoomUiRoute.js';
import { buildTaskRoomAgentPrompt } from '../../../shared/TaskRoomAgentPrompt.js';
class TaskRoomApiClient {
    getToken;
    constructor(getToken) {
        this.getToken = getToken;
    }
    async get(path) {
        return this.request(path, {});
    }
    async post(path, payload) {
        return this.request(path, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }
    async request(path, init) {
        const headers = new Headers(init.headers);
        headers.set('content-type', 'application/json');
        const token = this.getToken();
        if (token) {
            headers.set('authorization', `Bearer ${token}`);
        }
        const response = await fetch(path, {
            ...init,
            headers,
        });
        const payload = (await response.json().catch(() => ({})));
        if (!response.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }
        return payload;
    }
}
export class TaskRoomBrowserApp {
    state = {
        token: '',
        roomId: '',
        searchQuery: '',
        launch: null,
        room: null,
        rooms: [],
        updates: [],
        history: [],
        route: {
            roomId: '',
            inviteMode: false,
            promptMode: 'local',
            participant: null,
        },
        inviteStatus: {
            message: '',
            isError: false,
        },
    };
    elements;
    api;
    constructor() {
        this.elements = {
            tokenInput: this.getElement('tokenInput'),
            saveTokenButton: this.getElement('saveTokenButton'),
            authStatus: this.getElement('authStatus'),
            roomSearchInput: this.getElement('roomSearchInput'),
            roomSearchButton: this.getElement('roomSearchButton'),
            roomSearchClearButton: this.getElement('roomSearchClearButton'),
            invitePanel: this.getElement('invitePanel'),
            inviteTitle: this.getElement('inviteTitle'),
            inviteDescription: this.getElement('inviteDescription'),
            humanStepsList: this.getElement('humanStepsList'),
            joinRoomButton: this.getElement('joinRoomButton'),
            copyAgentPromptButton: this.getElement('copyAgentPromptButton'),
            copyPeerInviteButton: this.getElement('copyPeerInviteButton'),
            inviteStatus: this.getElement('inviteStatus'),
            agentPromptPreview: this.getElement('agentPromptPreview'),
            quickActionRequestContextButton: this.getElement('quickActionRequestContextButton'),
            quickActionRequestRecheckButton: this.getElement('quickActionRequestRecheckButton'),
            quickActionRequestDecisionButton: this.getElement('quickActionRequestDecisionButton'),
            quickActionRequestFinalPositionsButton: this.getElement('quickActionRequestFinalPositionsButton'),
            quickActionCopyRoomLinkButton: this.getElement('quickActionCopyRoomLinkButton'),
            quickActionCopyJoinCommandButton: this.getElement('quickActionCopyJoinCommandButton'),
            quickActionCopyPeerPromptButton: this.getElement('quickActionCopyPeerPromptButton'),
            quickActionCopyWatchEnvelopeButton: this.getElement('quickActionCopyWatchEnvelopeButton'),
            quickActionStatus: this.getElement('quickActionStatus'),
            roomList: this.getElement('roomList'),
            launchInfo: this.getElement('launchInfo'),
            roomPath: this.getElement('roomPath'),
            statusPill: this.getElement('statusPill'),
            roomTitle: this.getElement('roomTitle'),
            roomMeta: this.getElement('roomMeta'),
            statusReason: this.getElement('statusReason'),
            humanLabelInput: this.getElement('humanLabelInput'),
            messageTitleInput: this.getElement('messageTitleInput'),
            messageRefsInput: this.getElement('messageRefsInput'),
            messageBodyInput: this.getElement('messageBodyInput'),
            sendMessageButton: this.getElement('sendMessageButton'),
            artifactKindInput: this.getElement('artifactKindInput'),
            artifactTitleInput: this.getElement('artifactTitleInput'),
            artifactUriInput: this.getElement('artifactUriInput'),
            artifactTagsInput: this.getElement('artifactTagsInput'),
            artifactSummaryInput: this.getElement('artifactSummaryInput'),
            addArtifactButton: this.getElement('addArtifactButton'),
            decisionTitleInput: this.getElement('decisionTitleInput'),
            decisionStatusInput: this.getElement('decisionStatusInput'),
            decisionRefsInput: this.getElement('decisionRefsInput'),
            decisionSummaryInput: this.getElement('decisionSummaryInput'),
            decisionRationaleInput: this.getElement('decisionRationaleInput'),
            addDecisionButton: this.getElement('addDecisionButton'),
            verdictCommentInput: this.getElement('verdictCommentInput'),
            approveButton: this.getElement('approveButton'),
            keepActiveButton: this.getElement('keepActiveButton'),
            rejectButton: this.getElement('rejectButton'),
            messageList: this.getElement('messageList'),
            artifactList: this.getElement('artifactList'),
            decisionList: this.getElement('decisionList'),
            historyList: this.getElement('historyList'),
        };
        this.api = new TaskRoomApiClient(() => this.state.token);
    }
    async boot() {
        this.bindEvents();
        this.restoreToken();
        this.state.route = parseTaskRoomUiRoute(window.location.href);
        this.state.roomId = this.state.route.roomId;
        this.elements.tokenInput.value = this.state.token;
        this.elements.roomSearchInput.value = this.state.searchQuery;
        await this.refresh();
        window.setInterval(() => {
            void this.refresh();
        }, 3000);
    }
    bindEvents() {
        this.elements.saveTokenButton.addEventListener('click', () => {
            this.saveToken(this.elements.tokenInput.value.trim());
            void this.refresh();
        });
        this.elements.roomSearchButton.addEventListener('click', () => {
            this.state.searchQuery = this.elements.roomSearchInput.value.trim();
            void this.refresh();
        });
        this.elements.roomSearchClearButton.addEventListener('click', () => {
            this.state.searchQuery = '';
            this.elements.roomSearchInput.value = '';
            void this.refresh();
        });
        this.elements.joinRoomButton.addEventListener('click', () => {
            void this.handlePrimaryJoinAction();
        });
        this.elements.copyAgentPromptButton.addEventListener('click', () => {
            void this.copyQuickActionValue(this.resolveActivePrompt(), 'Инструкция для агента скопирована.', 'Для этой комнаты пока нет готовой инструкции для агента.', 'invite');
        });
        this.elements.copyPeerInviteButton.addEventListener('click', () => {
            void this.copyQuickActionValue(this.resolveShareLink(), this.state.route.inviteMode
                ? 'Ссылка на комнату скопирована.'
                : 'Ссылка второму участнику скопирована.', 'Для этой комнаты пока нет подходящей ссылки.', 'invite');
        });
        this.elements.sendMessageButton.addEventListener('click', () => {
            void this.sendHumanMessage();
        });
        this.elements.quickActionRequestContextButton.addEventListener('click', () => {
            void this.sendQuickActionMessage({
                title: 'Нужно объявить или обновить контекст',
                body: [
                    'Оба агента, пожалуйста, опубликуйте или обновите локальный контекст.',
                    'Если у вас уже есть context, перепроверьте, что он соответствует текущему состоянию задачи.',
                    'После этого продолжайте обсуждение только с актуальными предпосылками.',
                ].join('\n'),
            });
        });
        this.elements.quickActionRequestRecheckButton.addEventListener('click', () => {
            void this.sendQuickActionMessage({
                title: 'Нужна перепроверка',
                body: [
                    'Оба агента, пожалуйста, выполните ещё один цикл проверки.',
                    'Сверьте последние изменения, артефакты и decision log.',
                    'Если останутся расхождения, явно сформулируйте их перед следующей human decision.',
                ].join('\n'),
            });
        });
        this.elements.quickActionRequestDecisionButton.addEventListener('click', () => {
            void this.sendQuickActionMessage({
                title: 'Нужно свести решение',
                body: [
                    'Оба агента, пожалуйста, сведите текущее решение в decision log.',
                    'Опишите agreed path, риски, ограничения и что ещё требует подтверждения от людей.',
                    'После этого можно переходить к финальным позициям.',
                ].join('\n'),
            });
        });
        this.elements.quickActionRequestFinalPositionsButton.addEventListener('click', () => {
            void this.sendQuickActionMessage({
                title: 'Нужны финальные позиции',
                body: [
                    'Оба агента, пожалуйста, опубликуйте финальные позиции.',
                    'Укажите, согласны ли вы с решением, какие есть риски и какие вопросы требуют human confirmation.',
                ].join('\n'),
            });
        });
        this.elements.quickActionCopyRoomLinkButton.addEventListener('click', () => {
            void this.copyQuickActionValue(this.buildRoomLink(), 'Ссылка на комнату скопирована.', 'Сначала выбери комнату или запусти session.');
        });
        this.elements.quickActionCopyJoinCommandButton.addEventListener('click', () => {
            const launchScope = this.resolveLaunchScope();
            void this.copyQuickActionValue(launchScope.joinPosixCommand || launchScope.joinPowerShellCommand, 'Команда join скопирована.', 'CLI join доступен только для комнаты, открытой через текущий start.');
        });
        this.elements.quickActionCopyPeerPromptButton.addEventListener('click', () => {
            const launchScope = this.resolveLaunchScope();
            void this.copyQuickActionValue(launchScope.peerPrompt, 'Prompt для коллеги скопирован.', 'Prompt для коллеги доступен только для комнаты, открытой через текущий start.');
        });
        this.elements.quickActionCopyWatchEnvelopeButton.addEventListener('click', () => {
            const launchScope = this.resolveLaunchScope();
            void this.copyQuickActionValue(launchScope.watchRoomEnvelope, 'A2A watch envelope скопирован.', 'A2A watch envelope доступен только для комнаты, открытой через текущий start.');
        });
        this.elements.addArtifactButton.addEventListener('click', () => {
            void this.sendArtifact();
        });
        this.elements.addDecisionButton.addEventListener('click', () => {
            void this.sendDecision();
        });
        this.elements.approveButton.addEventListener('click', () => {
            void this.sendVerdict('approve_solution');
        });
        this.elements.keepActiveButton.addEventListener('click', () => {
            void this.sendVerdict('keep_session_active');
        });
        this.elements.rejectButton.addEventListener('click', () => {
            void this.sendVerdict('reject_solution');
        });
    }
    getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Не найден элемент ${id}.`);
        }
        return element;
    }
    restoreToken() {
        const locationToken = new URL(window.location.href).searchParams.get('token');
        const storedToken = window.localStorage.getItem('agent-task-room-token');
        this.saveToken(locationToken || storedToken || '');
    }
    saveToken(token) {
        this.state.token = token;
        if (token) {
            window.localStorage.setItem('agent-task-room-token', token);
            return;
        }
        window.localStorage.removeItem('agent-task-room-token');
    }
    setAuthStatus(message, isError = false) {
        this.elements.authStatus.textContent = message;
        this.elements.authStatus.style.color = isError ? 'var(--danger)' : 'var(--muted)';
    }
    setQuickActionStatus(message, isError = false) {
        this.elements.quickActionStatus.textContent = message;
        this.elements.quickActionStatus.style.color = isError ? 'var(--danger)' : 'var(--muted)';
    }
    setInviteStatus(message, isError = false) {
        this.state.inviteStatus = { message, isError };
        this.elements.inviteStatus.textContent = message;
        this.elements.inviteStatus.style.color = isError ? 'var(--danger)' : 'var(--muted)';
    }
    async refresh() {
        try {
            const launchPayload = await this.api.get('/api/launch');
            this.state.launch = launchPayload.launch;
            const roomsPayload = this.state.searchQuery.length > 0
                ? await this.api.get(`/api/rooms/search?q=${encodeURIComponent(this.state.searchQuery)}&limit=50`)
                : await this.api.get('/api/rooms');
            this.state.rooms = roomsPayload.rooms ?? [];
            if (!this.state.roomId && this.state.route.roomId) {
                this.state.roomId = this.state.route.roomId;
            }
            if (!this.state.roomId && this.state.launch?.roomId) {
                this.state.roomId = this.state.launch.roomId;
            }
            if (!this.state.roomId && this.state.rooms.length > 0) {
                this.state.roomId = this.state.rooms[0]?.roomId ?? '';
            }
            this.renderRoomList();
            if (this.state.roomId) {
                const roomPayload = await this.api.get(`/api/rooms/${encodeURIComponent(this.state.roomId)}`);
                this.state.room = roomPayload.room;
                const updatesPayload = await this.api.get(`/api/rooms/${encodeURIComponent(this.state.roomId)}/updates?afterSequence=0&limit=500`);
                this.state.updates = updatesPayload.updates ?? [];
                const historyPayload = await this.api.get(`/api/rooms/${encodeURIComponent(this.state.roomId)}/history?limit=100`);
                this.state.history = historyPayload.entries ?? [];
            }
            else {
                this.state.room = null;
                this.state.updates = [];
                this.state.history = [];
            }
            this.renderInvitePanel();
            this.renderLaunch();
            this.renderRoom();
            this.renderMessages();
            this.renderArtifacts();
            this.renderDecisionLog();
            this.renderHistory();
            this.setAuthStatus(this.state.token
                ? 'Токен сохранён, синхронизация идёт.'
                : 'Если сервер защищён, вставь токен слева или открой invite-ссылку целиком.');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setAuthStatus(message, true);
            this.setInviteStatus(message, true);
        }
    }
    renderRoomList() {
        if (this.state.rooms.length === 0) {
            this.elements.roomList.innerHTML = '<div class="empty">Доступных комнат пока нет.</div>';
            return;
        }
        this.elements.roomList.innerHTML = this.state.rooms
            .map((room) => {
            const href = `/rooms/${encodeURIComponent(room.roomId)}` +
                (this.state.token ? `?token=${encodeURIComponent(this.state.token)}` : '');
            return [
                `<a class="room-link" href="${href}">`,
                `<strong>${this.escape(room.title)}</strong><br />`,
                `<span class="muted mono">${this.escape(room.roomId)}</span><br />`,
                `<span class="muted">${this.escape(room.status)}</span>`,
                room.snippet ? `<div style="height: 8px"></div><span class="muted">${this.escape(room.snippet)}</span>` : '',
                '</a>',
            ].join('');
        })
            .join('');
    }
    renderInvitePanel() {
        const launchScope = this.resolveLaunchScope();
        const activePrompt = this.resolveActivePrompt();
        const participant = this.state.route.participant;
        const joined = this.isInvitedParticipantJoined();
        this.elements.agentPromptPreview.textContent =
            activePrompt || 'Сначала выбери комнату или открой invite-ссылку. После этого здесь появится готовая инструкция для агента.';
        if (!this.state.roomId) {
            this.elements.inviteTitle.textContent = 'Быстрый старт';
            this.elements.inviteDescription.textContent =
                'Запусти `agent-task-room session --title "..." --task "..."`, страница откроется сама. Затем передай invite-ссылку второму участнику.';
            this.renderHumanSteps([
                'Запусти одну команду `agent-task-room session --title "..." --task "..."`.',
                'Дождись, пока браузер откроет страницу владельца автоматически.',
                'Передай invite-ссылку второму участнику.',
            ]);
            this.elements.joinRoomButton.hidden = true;
            this.elements.copyPeerInviteButton.hidden = true;
            this.elements.copyAgentPromptButton.hidden = !activePrompt;
            this.setInviteStatus('Пока нет выбранной комнаты.', false);
            return;
        }
        if (this.state.route.inviteMode) {
            const label = participant?.participantLabel || 'участник';
            const role = participant?.role || 'peer';
            this.elements.inviteTitle.textContent = 'Приглашение в комнату';
            this.elements.inviteDescription.textContent = joined
                ? `Вы уже подключены к комнате как ${label} (${role}). Теперь можно вставить инструкцию в чат вашего агента.`
                : `Вы приглашены в комнату как ${label} (${role}). Нажмите кнопку ниже, чтобы присоединиться, а затем подключите своего агента.`;
            this.renderHumanSteps(joined
                ? [
                    'Комната уже подключена для вас.',
                    'Скопируйте инструкцию для агента ниже.',
                    'Вставьте её в чат своего агента и продолжайте работу в общей ленте.',
                ]
                : [
                    'Нажмите `Подключиться к комнате`.',
                    'Скопируйте инструкцию для агента ниже.',
                    'Вставьте её в чат своего агента и возвращайтесь в общую ленту.',
                ]);
            this.elements.joinRoomButton.hidden = false;
            this.elements.joinRoomButton.textContent = joined ? 'Уже подключено' : 'Подключиться к комнате';
            this.elements.joinRoomButton.disabled = joined || !participant;
            this.elements.copyAgentPromptButton.hidden = !activePrompt;
            this.elements.copyPeerInviteButton.hidden = false;
            this.elements.copyPeerInviteButton.textContent = 'Скопировать ссылку на комнату';
            this.setInviteStatus(this.state.inviteStatus.message ||
                (joined
                    ? 'Комната подключена. Следующий шаг — вставить инструкцию в чат агента.'
                    : 'Сначала подключись к комнате, затем вставь инструкцию в чат агента.'), this.state.inviteStatus.isError);
            return;
        }
        this.elements.inviteTitle.textContent = launchScope.peerInviteUrl ? 'Комната готова' : 'Комната открыта';
        this.elements.inviteDescription.textContent = launchScope.peerInviteUrl
            ? 'Передайте второму участнику invite-ссылку, а затем вставьте инструкцию в чат своего агента. Технические команды и A2A/MCP-детали спрятаны слева в разделе "Технические детали".'
            : 'Комната открыта. Можно писать сообщения в общую ленту и при необходимости подключать агентов через инструкцию ниже.';
        this.renderHumanSteps(launchScope.peerInviteUrl
            ? [
                'Нажмите `Скопировать ссылку второму участнику` и отправьте её коллеге.',
                'Нажмите `Скопировать инструкцию для моего агента`.',
                'Вставьте инструкцию в чат своего агента и ждите подключения второй стороны.',
            ]
            : [
                'Откройте комнату и прочитайте следующий шаг ниже.',
                'При необходимости скопируйте инструкцию для своего агента.',
                'Продолжайте работу через общую ленту и решения.',
            ]);
        this.elements.joinRoomButton.hidden = true;
        this.elements.joinRoomButton.disabled = true;
        this.elements.copyAgentPromptButton.hidden = !activePrompt;
        this.elements.copyPeerInviteButton.hidden = false;
        this.elements.copyPeerInviteButton.textContent = launchScope.peerInviteUrl
            ? 'Скопировать ссылку второму участнику'
            : 'Скопировать ссылку на комнату';
        this.setInviteStatus(this.state.inviteStatus.message ||
            (launchScope.peerInviteUrl
                ? 'Сначала передайте invite-ссылку коллеге, затем подключите агентов.'
                : 'Можно продолжать работу через UI или подключить агента по инструкции.'), this.state.inviteStatus.isError);
    }
    renderHumanSteps(steps) {
        this.elements.humanStepsList.innerHTML = steps
            .map((step) => `<li>${this.escape(step)}</li>`)
            .join('');
    }
    renderLaunch() {
        const launchScope = this.resolveLaunchScope();
        const blocks = [];
        if (launchScope.roomLink) {
            blocks.push(`<div class="card"><div class="muted">Ссылка владельцу</div><pre class="mono">${this.escape(launchScope.roomLink)}</pre></div>`);
        }
        if (launchScope.peerInviteUrl) {
            blocks.push(`<div class="card"><div class="muted">Invite-ссылка второму участнику</div><pre class="mono">${this.escape(launchScope.peerInviteUrl)}</pre></div>`);
        }
        if (launchScope.joinPosixCommand) {
            blocks.push(`<div class="card"><div class="muted">CLI join (Linux/macOS)</div><pre class="mono">${this.escape(launchScope.joinPosixCommand)}</pre></div>`);
        }
        if (launchScope.joinPowerShellCommand) {
            blocks.push(`<div class="card"><div class="muted">CLI join (PowerShell)</div><pre class="mono">${this.escape(launchScope.joinPowerShellCommand)}</pre></div>`);
        }
        if (launchScope.publicMcpUrl) {
            blocks.push(`<div class="card"><div class="muted">MCP URL</div><pre class="mono">${this.escape(launchScope.publicMcpUrl)}</pre></div>`);
        }
        if (launchScope.publicA2AJsonRpcUrl) {
            blocks.push(`<div class="card"><div class="muted">A2A JSON-RPC URL</div><pre class="mono">${this.escape(launchScope.publicA2AJsonRpcUrl)}</pre></div>`);
        }
        if (launchScope.publicA2ARestUrl) {
            blocks.push(`<div class="card"><div class="muted">A2A REST URL</div><pre class="mono">${this.escape(launchScope.publicA2ARestUrl)}</pre></div>`);
        }
        if (launchScope.watchRoomEnvelope) {
            blocks.push(`<div class="card"><div class="muted">A2A watch_room</div><pre>${this.escape(launchScope.watchRoomEnvelope)}</pre></div>`);
        }
        if (launchScope.pushEnvelope) {
            blocks.push(`<div class="card"><div class="muted">A2A pushNotificationConfig</div><pre>${this.escape(launchScope.pushEnvelope)}</pre></div>`);
        }
        this.elements.launchInfo.innerHTML =
            blocks.join('') ||
                '<div class="empty">Здесь появятся owner/invite ссылки, MCP, A2A и резервные CLI-команды после запуска session или start.</div>';
    }
    renderRoom() {
        if (!this.state.room) {
            this.elements.roomPath.textContent = window.location.pathname;
            this.elements.statusPill.textContent = 'Нет комнаты';
            this.elements.roomTitle.textContent = 'Комната не выбрана';
            this.elements.roomMeta.innerHTML = '<div class="empty">Выбери комнату слева или открой invite-ссылку.</div>';
            this.elements.statusReason.textContent =
                'Как только комната выбрана, здесь появятся участники, статус и следующий шаг.';
            return;
        }
        const pathPrefix = this.state.route.inviteMode ? '/join' : '/rooms';
        this.elements.roomPath.textContent = `${pathPrefix}/${this.state.room.roomId}`;
        this.elements.statusPill.textContent = this.state.room.status;
        this.elements.roomTitle.textContent = this.state.room.title;
        this.elements.statusReason.innerHTML = this.escape(this.state.room.statusReason).replaceAll('\n', '<br />');
        const parts = [];
        if (this.state.room.taskInput.taskDescription) {
            parts.push(`<div class="card"><div class="muted">Описание задачи</div>${this.escape(this.state.room.taskInput.taskDescription)}</div>`);
        }
        if (this.state.room.taskInput.jiraUrl) {
            parts.push(`<div class="card"><div class="muted">Jira</div><a href="${this.escape(this.state.room.taskInput.jiraUrl)}" target="_blank" rel="noreferrer">${this.escape(this.state.room.taskInput.jiraUrl)}</a></div>`);
        }
        if (this.state.room.taskInput.comment) {
            parts.push(`<div class="card"><div class="muted">Комментарий</div>${this.escape(this.state.room.taskInput.comment)}</div>`);
        }
        const participantsHtml = this.state.room.participants
            .map((participant) => {
            return [
                '<div style="margin-top: 8px;">',
                `<strong>${this.escape(participant.label)}</strong> <span class="muted">(${this.escape(participant.role)})</span><br />`,
                `<span class="muted">${this.escape(participant.systemScope || 'контекст ещё не объявлен')}</span>`,
                '</div>',
            ].join('');
        })
            .join('');
        parts.push(`<div class="card"><div class="muted">Участники</div>${participantsHtml}</div>`);
        this.elements.roomMeta.innerHTML = parts.join('');
    }
    renderMessages() {
        if (this.state.updates.length === 0) {
            this.elements.messageList.innerHTML = '<div class="empty">Сообщений пока нет.</div>';
            return;
        }
        this.elements.messageList.innerHTML = this.state.updates
            .map((message) => {
            const refs = Array.isArray(message.references) && message.references.length > 0
                ? `<div class="muted" style="margin-top: 8px;">Refs: ${this.escape(message.references.join(', '))}</div>`
                : '';
            return [
                '<div class="message">',
                `<div class="muted mono">#${message.sequence} · ${this.escape(message.authorType)}:${this.escape(message.authorId)} · ${this.escape(message.kind)}</div>`,
                message.title ? `<div style="height: 8px"></div><strong>${this.escape(message.title)}</strong>` : '',
                `<div style="height: 8px"></div><div style="white-space: pre-wrap;">${this.escape(message.body)}</div>`,
                refs,
                '</div>',
            ].join('');
        })
            .join('');
    }
    renderArtifacts() {
        if (!this.state.room || this.state.room.artifacts.length === 0) {
            this.elements.artifactList.innerHTML = '<div class="empty">Артефактов пока нет.</div>';
            return;
        }
        this.elements.artifactList.innerHTML = this.state.room.artifacts
            .map((artifact) => {
            const uriBlock = artifact.uri
                ? `<div style="margin-top: 8px;"><a href="${this.escape(artifact.uri)}" target="_blank" rel="noreferrer">${this.escape(artifact.uri)}</a></div>`
                : '';
            const tagsBlock = artifact.tags.length > 0
                ? `<div class="muted" style="margin-top: 8px;">Tags: ${this.escape(artifact.tags.join(', '))}</div>`
                : '';
            return [
                '<div class="message">',
                `<div class="muted mono">${this.escape(artifact.kind)} · ${this.escape(artifact.authorLabel)}</div>`,
                `<div style="height: 8px"></div><strong>${this.escape(artifact.title)}</strong>`,
                artifact.summary ? `<div style="height: 8px"></div><div style="white-space: pre-wrap;">${this.escape(artifact.summary)}</div>` : '',
                uriBlock,
                tagsBlock,
                '</div>',
            ].join('');
        })
            .join('');
    }
    renderDecisionLog() {
        if (!this.state.room || this.state.room.decisionLog.length === 0) {
            this.elements.decisionList.innerHTML = '<div class="empty">Decision log пока пуст.</div>';
            return;
        }
        this.elements.decisionList.innerHTML = this.state.room.decisionLog
            .map((decision) => {
            const refsBlock = decision.references.length > 0
                ? `<div class="muted" style="margin-top: 8px;">Refs: ${this.escape(decision.references.join(', '))}</div>`
                : '';
            return [
                '<div class="message">',
                `<div class="muted mono">${this.escape(decision.status)} · ${this.escape(decision.authorLabel)}</div>`,
                `<div style="height: 8px"></div><strong>${this.escape(decision.title)}</strong>`,
                `<div style="height: 8px"></div><div style="white-space: pre-wrap;">${this.escape(decision.summary)}</div>`,
                decision.rationale ? `<div style="height: 8px"></div><div class="muted">${this.escape(decision.rationale)}</div>` : '',
                refsBlock,
                '</div>',
            ].join('');
        })
            .join('');
    }
    renderHistory() {
        if (this.state.history.length === 0) {
            this.elements.historyList.innerHTML = '<div class="empty">История комнаты пока пуста.</div>';
            return;
        }
        this.elements.historyList.innerHTML = this.state.history
            .map((entry) => {
            const refs = entry.references.length > 0
                ? `<div class="muted" style="margin-top: 8px;">Refs: ${this.escape(entry.references.join(', '))}</div>`
                : '';
            return [
                '<div class="message">',
                `<div class="muted mono">${this.escape(entry.createdAt)} · ${this.escape(entry.entryType)}/${this.escape(entry.kind)} · ${this.escape(entry.authorLabel)}</div>`,
                entry.title ? `<div style="height: 8px"></div><strong>${this.escape(entry.title)}</strong>` : '',
                `<div style="height: 8px"></div><div style="white-space: pre-wrap;">${this.escape(entry.body)}</div>`,
                refs,
                '</div>',
            ].join('');
        })
            .join('');
    }
    resolveLaunchScope() {
        return resolveLaunchScope({
            launch: this.state.launch,
            roomId: this.state.roomId,
            token: this.state.token,
            origin: window.location.origin,
        });
    }
    resolveActivePrompt() {
        const launchScope = this.resolveLaunchScope();
        const fallbackRole = this.state.route.participant?.role || (this.state.route.promptMode === 'peer' ? 'peer' : 'participant');
        if (this.state.route.promptMode === 'peer') {
            return launchScope.peerPrompt || launchScope.localPrompt || buildTaskRoomAgentPrompt(fallbackRole);
        }
        return launchScope.localPrompt || launchScope.peerPrompt || buildTaskRoomAgentPrompt(fallbackRole);
    }
    resolveShareLink() {
        const launchScope = this.resolveLaunchScope();
        if (this.state.route.inviteMode) {
            return this.buildInviteAwareRoomLink();
        }
        return launchScope.peerInviteUrl || launchScope.roomLink;
    }
    buildRoomLink() {
        return this.resolveLaunchScope().roomLink;
    }
    buildInviteAwareRoomLink() {
        if (!this.state.roomId) {
            return '';
        }
        const url = new URL(`/rooms/${encodeURIComponent(this.state.roomId)}`, window.location.origin);
        if (this.state.token) {
            url.searchParams.set('token', this.state.token);
        }
        if (this.state.route.participant) {
            url.searchParams.set('participant-id', this.state.route.participant.participantId);
            url.searchParams.set('participant-label', this.state.route.participant.participantLabel);
            url.searchParams.set('role', this.state.route.participant.role);
            url.searchParams.set('prompt', this.state.route.promptMode);
        }
        return url.toString();
    }
    isInvitedParticipantJoined() {
        if (!this.state.room || !this.state.route.participant) {
            return false;
        }
        return this.state.room.participants.some((participant) => participant.participantId === this.state.route.participant?.participantId);
    }
    async handlePrimaryJoinAction() {
        if (!this.state.route.inviteMode) {
            const roomLink = this.buildRoomLink();
            if (!roomLink) {
                this.setInviteStatus('Сначала выбери комнату.', true);
                return;
            }
            window.location.assign(roomLink);
            return;
        }
        if (!this.state.roomId || !this.state.route.participant) {
            this.setInviteStatus('Invite-ссылка неполная: не хватает roomId или данных участника.', true);
            return;
        }
        await this.api.post(`/api/rooms/${encodeURIComponent(this.state.roomId)}/join`, {
            participantId: this.state.route.participant.participantId,
            participantLabel: this.state.route.participant.participantLabel,
            role: this.state.route.participant.role,
        });
        const roomUrl = this.buildInviteAwareRoomLink();
        window.history.replaceState({}, '', roomUrl);
        this.state.route = parseTaskRoomUiRoute(roomUrl);
        this.state.inviteStatus = {
            message: 'Вы подключились к комнате. Теперь можно вставить инструкцию в чат агента.',
            isError: false,
        };
        await this.refresh();
    }
    async sendHumanMessage() {
        if (!this.state.roomId) {
            this.setAuthStatus('Сначала выбери комнату.', true);
            return;
        }
        await this.api.post(`/api/rooms/${encodeURIComponent(this.state.roomId)}/human-message`, {
            humanLabel: this.elements.humanLabelInput.value.trim() || 'Coordinator',
            title: this.elements.messageTitleInput.value.trim() || 'Новая вводная',
            body: this.elements.messageBodyInput.value.trim(),
            references: this.elements.messageRefsInput.value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
        });
        this.elements.messageBodyInput.value = '';
        this.elements.messageRefsInput.value = '';
        await this.refresh();
        this.setQuickActionStatus('Сообщение отправлено в общую ленту.');
    }
    async sendQuickActionMessage(input) {
        if (!this.state.roomId) {
            this.setQuickActionStatus('Сначала выбери комнату.', true);
            return;
        }
        await this.api.post(`/api/rooms/${encodeURIComponent(this.state.roomId)}/human-message`, {
            humanLabel: this.elements.humanLabelInput.value.trim() || 'Coordinator',
            title: input.title,
            body: input.body,
            references: [this.state.roomId],
        });
        this.elements.messageTitleInput.value = input.title;
        this.elements.messageBodyInput.value = input.body;
        this.elements.messageRefsInput.value = this.state.roomId;
        await this.refresh();
        this.setQuickActionStatus(`Быстрое действие выполнено: ${input.title}.`);
    }
    async copyQuickActionValue(value, successMessage, emptyMessage, scope = 'quick') {
        if (!value) {
            if (scope === 'invite') {
                this.setInviteStatus(emptyMessage, true);
                return;
            }
            this.setQuickActionStatus(emptyMessage, true);
            return;
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            }
            else {
                const helper = document.createElement('textarea');
                helper.value = value;
                helper.style.position = 'fixed';
                helper.style.opacity = '0';
                document.body.appendChild(helper);
                helper.focus();
                helper.select();
                document.execCommand('copy');
                helper.remove();
            }
            if (scope === 'invite') {
                this.setInviteStatus(successMessage);
                return;
            }
            this.setQuickActionStatus(successMessage);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось скопировать значение.';
            if (scope === 'invite') {
                this.setInviteStatus(message, true);
                return;
            }
            this.setQuickActionStatus(message, true);
        }
    }
    async sendArtifact() {
        if (!this.state.roomId) {
            this.setAuthStatus('Сначала выбери комнату.', true);
            return;
        }
        await this.api.post(`/api/rooms/${encodeURIComponent(this.state.roomId)}/artifacts`, {
            humanLabel: this.elements.humanLabelInput.value.trim() || 'Coordinator',
            kind: this.elements.artifactKindInput.value,
            title: this.elements.artifactTitleInput.value.trim(),
            uri: this.elements.artifactUriInput.value.trim() || undefined,
            summary: this.elements.artifactSummaryInput.value.trim() || undefined,
            tags: this.elements.artifactTagsInput.value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
        });
        this.elements.artifactTitleInput.value = '';
        this.elements.artifactUriInput.value = '';
        this.elements.artifactTagsInput.value = '';
        this.elements.artifactSummaryInput.value = '';
        await this.refresh();
    }
    async sendDecision() {
        if (!this.state.roomId) {
            this.setAuthStatus('Сначала выбери комнату.', true);
            return;
        }
        await this.api.post(`/api/rooms/${encodeURIComponent(this.state.roomId)}/decisions`, {
            humanLabel: this.elements.humanLabelInput.value.trim() || 'Coordinator',
            title: this.elements.decisionTitleInput.value.trim(),
            summary: this.elements.decisionSummaryInput.value.trim(),
            rationale: this.elements.decisionRationaleInput.value.trim() || undefined,
            status: this.elements.decisionStatusInput.value,
            references: this.elements.decisionRefsInput.value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
        });
        this.elements.decisionTitleInput.value = '';
        this.elements.decisionSummaryInput.value = '';
        this.elements.decisionRationaleInput.value = '';
        this.elements.decisionRefsInput.value = '';
        await this.refresh();
    }
    async sendVerdict(verdict) {
        if (!this.state.roomId) {
            this.setAuthStatus('Сначала выбери комнату.', true);
            return;
        }
        await this.api.post(`/api/rooms/${encodeURIComponent(this.state.roomId)}/human-feedback`, {
            humanLabel: this.elements.humanLabelInput.value.trim() || 'Coordinator',
            verdict,
            comment: this.elements.verdictCommentInput.value.trim(),
        });
        await this.refresh();
    }
    escape(value) {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }
}
export function bootTaskRoomBrowserApp() {
    const app = new TaskRoomBrowserApp();
    void app.boot();
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    bootTaskRoomBrowserApp();
}
//# sourceMappingURL=TaskRoomBrowserApp.js.map