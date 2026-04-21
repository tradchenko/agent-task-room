export interface LaunchPayload {
    roomId?: string;
    publicMcpUrl?: string;
    publicA2AJsonRpcUrl?: string;
    publicA2ARestUrl?: string;
    publicRoomUrl?: string;
    publicPeerInviteUrl?: string;
    commands?: {
        joinPosixCommand?: string;
        joinPowerShellCommand?: string;
    };
    prompts?: {
        localPrompt?: string;
        peerPrompt?: string;
    };
    examples?: {
        watchRoomEnvelope?: string;
        pushEnvelope?: string;
    };
}
export interface LaunchScope {
    roomLink: string;
    peerInviteUrl: string;
    publicMcpUrl: string;
    publicA2AJsonRpcUrl: string;
    publicA2ARestUrl: string;
    joinPosixCommand: string;
    joinPowerShellCommand: string;
    localPrompt: string;
    peerPrompt: string;
    watchRoomEnvelope: string;
    pushEnvelope: string;
}
export declare function resolveLaunchScope(input: {
    launch: LaunchPayload | null;
    roomId: string;
    token: string;
    origin: string;
}): LaunchScope;
