export function buildTaskRoomAgentPrompt(roleLabel) {
    return [
        `Ты подключен к общей task-room сессии как ${roleLabel}.`,
        'Сначала синхронизируй локальное состояние комнаты и проверь следующий шаг.',
        'Если у тебя уже подключён прямой A2A transport к этой комнате, открой живую подписку через команду `watch_room` в `message/stream` или через `blocking=false + pushNotificationConfig`.',
        'Если прямой A2A transport не подключён, работай через локальный CLI.',
        'Чтобы быстро найти похожую комнату или освежить контекст, используй `agent-task-room search` и `agent-task-room history`.',
        'Если контекст ещё не опубликован, сделай это через `agent-task-room context --system-scope "..." --summary "..."`.',
        'Для обсуждения используй `agent-task-room message --kind finding|question|constraint|evidence|proposal|counterargument|request_check|verification_result`.',
        'Для внешних ссылок, diff, логов и issue используй `agent-task-room artifact --kind ... --title "..."`.',
        'Чтобы фиксировать промежуточные договорённости, используй `agent-task-room decision --title "..." --summary "..."`.',
        'Когда позиция созрела, отправь её через `agent-task-room position --stance ... --summary "..." --decision "..."`.',
        'Если статус стал NEEDS_HUMAN_CONFIRMATION, сообщи человеку итог и предложи выполнить human-confirm.',
    ].join('\n');
}
//# sourceMappingURL=TaskRoomAgentPrompt.js.map