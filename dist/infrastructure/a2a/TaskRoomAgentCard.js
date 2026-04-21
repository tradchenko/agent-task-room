function buildSecurity(requireAuth) {
    if (!requireAuth) {
        return {};
    }
    return {
        security: [{ bearerAuth: [] }],
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'Bearer',
                description: 'Общий Bearer token для подключения к task-room.',
            },
        },
    };
}
function buildSkills(requireAuth) {
    const security = requireAuth ? [{ bearerAuth: [] }] : undefined;
    return [
        {
            id: 'task-room-coordination',
            name: 'Task Room Coordination',
            description: [
                'Типизированное пространство для совместного аудита и выработки решения.',
                'Принимает A2A data-part с kind=task-room-command и payload, совместимым с RoomService.',
            ].join(' '),
            examples: [
                JSON.stringify({
                    kind: 'task-room-command',
                    command: 'open_room',
                    payload: {
                        title: 'Аудит интеграции',
                        jiraUrl: 'https://jira.example/TASK-42',
                        initiatorId: 'reviewer-agent',
                        initiatorRole: 'reviewer',
                    },
                }),
                JSON.stringify({
                    kind: 'task-room-command',
                    command: 'post_room_message',
                    payload: {
                        roomId: 'room-123',
                        participantId: 'reviewer-agent',
                        kind: 'finding',
                        body: 'Нашёл расхождение в API-контракте.',
                    },
                }),
                JSON.stringify({
                    kind: 'task-room-command',
                    command: 'add_artifact',
                    payload: {
                        roomId: 'room-123',
                        participantId: 'reviewer-agent',
                        kind: 'github_pr',
                        title: 'PR с предлагаемым исправлением',
                        uri: 'https://github.com/example/repo/pull/42',
                    },
                }),
                JSON.stringify({
                    kind: 'task-room-command',
                    command: 'record_decision',
                    payload: {
                        roomId: 'room-123',
                        participantId: 'reviewer-agent',
                        title: 'Сначала синхронизировать контракт',
                        summary: 'Иначе дальнейшее обсуждение снова разойдётся по разным предпосылкам.',
                        status: 'accepted',
                    },
                }),
                JSON.stringify({
                    kind: 'task-room-command',
                    command: 'search_rooms',
                    payload: {
                        query: 'feature flag rollout',
                        limit: 10,
                    },
                }),
                JSON.stringify({
                    kind: 'task-room-command',
                    command: 'get_room_history',
                    payload: {
                        roomId: 'room-123',
                        limit: 50,
                    },
                }),
                JSON.stringify({
                    kind: 'task-room-command',
                    command: 'watch_room',
                    payload: {
                        roomId: 'room-123',
                        afterSequence: 42,
                    },
                }),
            ],
            tags: ['coordination', 'audit', 'collaboration', 'task-room'],
            inputModes: ['application/json', 'text/plain'],
            outputModes: ['application/json', 'text/plain'],
            security,
        },
    ];
}
export function buildTaskRoomAgentCard(baseUrl, requireAuth) {
    const jsonRpcUrl = `${baseUrl}/a2a/jsonrpc`;
    const restUrl = `${baseUrl}/a2a/rest`;
    return {
        name: 'agent-task-room',
        description: [
            'A2A-совместимый broker общей task-room между агентами и людьми.',
            'Поддерживает открытие комнаты, публикацию контекста, сообщения, artifacts, decision log, поиск, history, финальные позиции и human feedback.',
        ].join(' '),
        protocolVersion: '0.3.0',
        version: '0.1.0',
        url: jsonRpcUrl,
        preferredTransport: 'JSONRPC',
        capabilities: {
            streaming: true,
            pushNotifications: true,
            stateTransitionHistory: true,
        },
        defaultInputModes: ['application/json', 'text/plain'],
        defaultOutputModes: ['application/json', 'text/plain'],
        skills: buildSkills(requireAuth),
        additionalInterfaces: [
            {
                transport: 'JSONRPC',
                url: jsonRpcUrl,
            },
            {
                transport: 'HTTP+JSON',
                url: restUrl,
            },
        ],
        provider: {
            organization: 'agent-task-room',
            url: 'https://example.invalid/agent-task-room',
        },
        ...buildSecurity(requireAuth),
    };
}
//# sourceMappingURL=TaskRoomAgentCard.js.map