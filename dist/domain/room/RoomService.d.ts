import type { RoomRepository } from './RoomRepository.js';
import { type DecisionLogStatus, type FinalStance, type HumanVerdict, type ParticipantMessageKind, type RoomArtifactKind, type RoomHistoryEntry, type RoomMessage, type RoomSearchResult, type RoomSummary, type RoomStatus, type SearchRoomsInput } from './room-types.js';
export interface OpenRoomInput {
    roomId?: string;
    title: string;
    taskDescription?: string;
    jiraUrl?: string;
    comment?: string;
    initiatorId: string;
    initiatorLabel?: string;
    initiatorRole?: string;
}
export interface JoinRoomInput {
    roomId: string;
    participantId: string;
    participantLabel?: string;
    role?: string;
}
export interface DeclareContextInput extends JoinRoomInput {
    systemScope: string;
    summary: string;
    constraints?: string[];
    artifacts?: string[];
    confidence?: 'low' | 'medium' | 'high';
}
export interface PostMessageInput extends JoinRoomInput {
    kind: ParticipantMessageKind;
    title?: string;
    body: string;
    references?: string[];
}
export interface PostHumanMessageInput {
    roomId: string;
    humanLabel?: string;
    title?: string;
    body: string;
    references?: string[];
}
export interface AddArtifactInput {
    roomId: string;
    participantId?: string;
    participantLabel?: string;
    role?: string;
    humanLabel?: string;
    kind: RoomArtifactKind;
    title: string;
    uri?: string;
    summary?: string;
    content?: string;
    references?: string[];
    tags?: string[];
}
export interface RecordDecisionInput {
    roomId: string;
    participantId?: string;
    participantLabel?: string;
    role?: string;
    humanLabel?: string;
    title: string;
    summary: string;
    rationale?: string;
    references?: string[];
    status?: DecisionLogStatus;
}
export interface SubmitFinalPositionInput extends JoinRoomInput {
    stance: FinalStance;
    summary: string;
    decisions: string[];
    openQuestions?: string[];
}
export interface RecordHumanFeedbackInput {
    roomId: string;
    humanLabel?: string;
    verdict: HumanVerdict;
    comment?: string;
}
export interface CloseRoomInput {
    roomId: string;
    actorLabel?: string;
    resolution?: 'completed' | 'manual_close';
}
export interface RoomUpdatesResult extends Record<string, unknown> {
    status: string;
    latestSequence: number;
    updates: RoomMessage[];
}
export interface RoomActivityEvent {
    roomId: string;
    status: RoomStatus;
    statusReason: string;
    latestSequence: number;
    updatedAt: string;
    resolution: string | null;
}
export declare class RoomService {
    private readonly repository;
    private readonly rooms;
    private readonly roomListeners;
    constructor(repository: RoomRepository);
    load(): Promise<number>;
    listRooms(): Promise<{
        rooms: RoomSummary[];
    }>;
    searchRooms(input: SearchRoomsInput): Promise<{
        rooms: RoomSearchResult[];
    }>;
    getRoomHistory(roomId: string, limit?: number): Promise<{
        entries: RoomHistoryEntry[];
    }>;
    openRoom(input: OpenRoomInput): Promise<{
        roomId: string;
        status: string;
        sharedPrompt: string;
        nextActions: string[];
    }>;
    joinRoom(input: JoinRoomInput): Promise<{
        roomId: string;
        status: string;
        sharedPrompt: string;
    }>;
    getRoomOverview(roomId: string): Promise<{
        room: RoomSummary;
    }>;
    declareContext(input: DeclareContextInput): Promise<{
        status: string;
        latestSequence: number;
    }>;
    postRoomMessage(input: PostMessageInput): Promise<{
        status: string;
        latestSequence: number;
    }>;
    postHumanMessage(input: PostHumanMessageInput): Promise<{
        status: string;
        latestSequence: number;
    }>;
    addArtifact(input: AddArtifactInput): Promise<{
        artifactId: string;
        status: string;
        latestSequence: number;
    }>;
    recordDecision(input: RecordDecisionInput): Promise<{
        decisionId: string;
        status: string;
        latestSequence: number;
    }>;
    getRoomUpdates(roomId: string, afterSequence?: number, limit?: number): Promise<RoomUpdatesResult>;
    submitFinalPosition(input: SubmitFinalPositionInput): Promise<{
        status: string;
        latestSequence: number;
    }>;
    recordHumanFeedback(input: RecordHumanFeedbackInput): Promise<{
        status: string;
        latestSequence: number;
    }>;
    closeRoom(input: CloseRoomInput): Promise<{
        status: string;
        resolution: string | null;
    }>;
    subscribeToRoom(roomId: string, listener: (event: RoomActivityEvent) => void): () => void;
    private persist;
    private persistAndEmit;
    private createRoom;
    private normalizeRoom;
    private normalizeStoredParticipant;
    private normalizeStoredContext;
    private normalizeStoredFinalPosition;
    private normalizeStoredMessage;
    private normalizeStoredFeedback;
    private normalizeStoredArtifact;
    private normalizeStoredDecision;
    private getRoomOrThrow;
    private normalizeParticipant;
    private summarizeRoom;
    private summarizeParticipant;
    private summarizeTask;
    private normalizeLimit;
    private buildSearchResult;
    private collectSearchSources;
    private buildSnippet;
    private buildHistoryEntries;
    private resolveHistoryAuthorLabel;
    private buildSharedPrompt;
    private resolveActor;
    private addArtifactEntry;
    private addDecisionEntry;
    private addMessage;
    private emitRoomEvent;
    private syncRoomStatus;
    private evaluateRoomStatus;
    private formatParticipantLine;
}
