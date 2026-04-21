function normalizePromptMode(value) {
    return value === 'peer' ? 'peer' : 'local';
}
export function parseTaskRoomUiRoute(href) {
    const url = new URL(href);
    const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)$/);
    const joinMatch = url.pathname.match(/^\/join\/([^/]+)$/);
    const routeMatch = joinMatch ?? roomMatch;
    const roomId = routeMatch ? decodeURIComponent(routeMatch[1] ?? '') : '';
    const participantId = url.searchParams.get('participant-id')?.trim() ?? '';
    const participantLabel = url.searchParams.get('participant-label')?.trim() ?? '';
    const role = url.searchParams.get('role')?.trim() ?? '';
    return {
        roomId,
        inviteMode: Boolean(joinMatch),
        promptMode: normalizePromptMode(url.searchParams.get('prompt')),
        participant: participantId && participantLabel
            ? {
                participantId,
                participantLabel,
                role: role || 'peer',
            }
            : null,
    };
}
//# sourceMappingURL=TaskRoomUiRoute.js.map