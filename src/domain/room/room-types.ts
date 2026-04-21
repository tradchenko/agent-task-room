export const ROOM_STATUS = {
  OPEN: 'OPEN',
  ACTIVE_DISCUSSION: 'ACTIVE_DISCUSSION',
  NEEDS_HUMAN_CONFIRMATION: 'NEEDS_HUMAN_CONFIRMATION',
  ACTIVE_FOLLOWUP: 'ACTIVE_FOLLOWUP',
  COMPLETED: 'COMPLETED',
} as const;

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];

export const PARTICIPANT_MESSAGE_KINDS = [
  'finding',
  'question',
  'constraint',
  'evidence',
  'proposal',
  'counterargument',
  'request_check',
  'verification_result',
] as const;

export const INTERNAL_MESSAGE_KINDS = ['system_note', 'human_note', 'human_feedback', 'final_position'] as const;

export const MESSAGE_KINDS = [...PARTICIPANT_MESSAGE_KINDS, ...INTERNAL_MESSAGE_KINDS] as const;

export type ParticipantMessageKind = (typeof PARTICIPANT_MESSAGE_KINDS)[number];
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const FINAL_STANCES = ['agree', 'agree_with_risks', 'needs_human_decision', 'disagree'] as const;
export type FinalStance = (typeof FINAL_STANCES)[number];

export const HUMAN_VERDICTS = ['approve_solution', 'reject_solution', 'keep_session_active'] as const;
export type HumanVerdict = (typeof HUMAN_VERDICTS)[number];

export const ROOM_ARTIFACT_KINDS = ['jira_issue', 'github_issue', 'github_pr', 'link', 'log', 'diff', 'note'] as const;
export type RoomArtifactKind = (typeof ROOM_ARTIFACT_KINDS)[number];

export const DECISION_LOG_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'] as const;
export type DecisionLogStatus = (typeof DECISION_LOG_STATUSES)[number];

export interface TaskInput {
  taskDescription: string | null;
  jiraUrl: string | null;
  comment: string | null;
}

export interface ParticipantContext {
  systemScope: string | null;
  summary: string | null;
  constraints: string[];
  artifacts: string[];
  confidence: 'low' | 'medium' | 'high';
  updatedAt: string;
}

export interface FinalPosition {
  stance: FinalStance;
  summary: string;
  decisions: string[];
  openQuestions: string[];
  submittedAt: string;
}

export interface RoomParticipant {
  participantId: string;
  role: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  context: ParticipantContext | null;
  finalPosition: FinalPosition | null;
}

export interface RoomMessage {
  sequence: number;
  authorType: 'system' | 'participant' | 'human';
  authorId: string;
  kind: MessageKind;
  title: string | null;
  body: string;
  references: string[];
  createdAt: string;
}

export interface HumanFeedback {
  verdict: HumanVerdict;
  comment: string | null;
  humanLabel: string;
  createdAt: string;
}

export interface RoomArtifact {
  artifactId: string;
  kind: RoomArtifactKind;
  title: string;
  uri: string | null;
  summary: string | null;
  content: string | null;
  tags: string[];
  authorType: 'system' | 'participant' | 'human';
  authorId: string;
  authorLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionLogEntry {
  decisionId: string;
  title: string;
  summary: string;
  rationale: string | null;
  references: string[];
  status: DecisionLogStatus;
  authorType: 'system' | 'participant' | 'human';
  authorId: string;
  authorLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchRoomsInput {
  query?: string;
  status?: RoomStatus | 'all';
  limit?: number;
}

export interface RoomSearchResult {
  roomId: string;
  title: string;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  resolution: string | null;
  snippet: string | null;
  matchSource: string[];
}

export interface RoomHistoryEntry {
  entryId: string;
  roomId: string;
  entryType: 'message' | 'artifact' | 'decision' | 'human_feedback';
  kind: string;
  title: string | null;
  body: string;
  authorType: 'system' | 'participant' | 'human';
  authorId: string;
  authorLabel: string;
  createdAt: string;
  references: string[];
}

export interface TaskRoom {
  roomId: string;
  title: string;
  taskInput: TaskInput;
  createdAt: string;
  updatedAt: string;
  status: RoomStatus;
  statusReason: string;
  statusFingerprint: string;
  closedAt: string | null;
  closedBy: string | null;
  resolution: string | null;
  participants: Record<string, RoomParticipant>;
  messages: RoomMessage[];
  humanFeedback: HumanFeedback[];
  artifacts: RoomArtifact[];
  decisionLog: DecisionLogEntry[];
  nextSequence: number;
  sharedPrompt: string;
}

export interface RoomSummary {
  roomId: string;
  title: string;
  taskInput: TaskInput;
  status: RoomStatus;
  statusReason: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  resolution: string | null;
  sharedPrompt: string;
  messageCount: number;
  latestSequence: number;
  participants: ParticipantSummary[];
  humanFeedback: HumanFeedback[];
  artifacts: RoomArtifact[];
  decisionLog: DecisionLogEntry[];
}

export interface ParticipantSummary {
  participantId: string;
  label: string;
  role: string;
  contextDeclared: boolean;
  systemScope: string | null;
  confidence: string | null;
  finalPositionSubmitted: boolean;
  finalStance: string | null;
  updatedAt: string;
}

export interface PersistedRoomPayload {
  version: number;
  savedAt: string;
  rooms: TaskRoom[];
}
