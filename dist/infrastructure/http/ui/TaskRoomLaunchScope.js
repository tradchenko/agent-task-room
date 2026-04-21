function buildFallbackRoomLink(origin, roomId, token) {
    if (!roomId) {
        return '';
    }
    return `${origin}/rooms/${encodeURIComponent(roomId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}
export function resolveLaunchScope(input) {
    const { launch, roomId, token, origin } = input;
    const isScopedLaunch = Boolean(roomId) && launch?.roomId === roomId;
    if (!isScopedLaunch) {
        return {
            roomLink: buildFallbackRoomLink(origin, roomId, token),
            peerInviteUrl: '',
            publicMcpUrl: '',
            publicA2AJsonRpcUrl: '',
            publicA2ARestUrl: '',
            joinPosixCommand: '',
            joinPowerShellCommand: '',
            localPrompt: '',
            peerPrompt: '',
            watchRoomEnvelope: '',
            pushEnvelope: '',
        };
    }
    return {
        roomLink: launch?.publicRoomUrl || buildFallbackRoomLink(origin, roomId, token),
        peerInviteUrl: launch?.publicPeerInviteUrl || '',
        publicMcpUrl: launch?.publicMcpUrl || '',
        publicA2AJsonRpcUrl: launch?.publicA2AJsonRpcUrl || '',
        publicA2ARestUrl: launch?.publicA2ARestUrl || '',
        joinPosixCommand: launch?.commands?.joinPosixCommand || '',
        joinPowerShellCommand: launch?.commands?.joinPowerShellCommand || '',
        localPrompt: launch?.prompts?.localPrompt || '',
        peerPrompt: launch?.prompts?.peerPrompt || '',
        watchRoomEnvelope: launch?.examples?.watchRoomEnvelope || '',
        pushEnvelope: launch?.examples?.pushEnvelope || '',
    };
}
//# sourceMappingURL=TaskRoomLaunchScope.js.map