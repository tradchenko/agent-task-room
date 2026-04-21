export interface TaskRoomInviteParticipant {
    participantId: string;
    participantLabel: string;
    role: string;
}
export interface TaskRoomUiRoute {
    roomId: string;
    inviteMode: boolean;
    promptMode: 'local' | 'peer';
    participant: TaskRoomInviteParticipant | null;
}
export declare function parseTaskRoomUiRoute(href: string): TaskRoomUiRoute;
