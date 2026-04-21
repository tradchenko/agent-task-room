export const ROOM_STATUS = {
    OPEN: 'OPEN',
    ACTIVE_DISCUSSION: 'ACTIVE_DISCUSSION',
    NEEDS_HUMAN_CONFIRMATION: 'NEEDS_HUMAN_CONFIRMATION',
    ACTIVE_FOLLOWUP: 'ACTIVE_FOLLOWUP',
    COMPLETED: 'COMPLETED',
};
export const PARTICIPANT_MESSAGE_KINDS = [
    'finding',
    'question',
    'constraint',
    'evidence',
    'proposal',
    'counterargument',
    'request_check',
    'verification_result',
];
export const INTERNAL_MESSAGE_KINDS = ['system_note', 'human_note', 'human_feedback', 'final_position'];
export const MESSAGE_KINDS = [...PARTICIPANT_MESSAGE_KINDS, ...INTERNAL_MESSAGE_KINDS];
export const FINAL_STANCES = ['agree', 'agree_with_risks', 'needs_human_decision', 'disagree'];
export const HUMAN_VERDICTS = ['approve_solution', 'reject_solution', 'keep_session_active'];
export const ROOM_ARTIFACT_KINDS = ['jira_issue', 'github_issue', 'github_pr', 'link', 'log', 'diff', 'note'];
export const DECISION_LOG_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'];
//# sourceMappingURL=room-types.js.map