import { describe, expect, it } from 'vitest';

import { buildTaskRoomAgentPrompt } from '../../src/shared/TaskRoomAgentPrompt.js';

describe('TaskRoomAgentPrompt', () => {
  it('строит универсальную инструкцию для агента с ролью', () => {
    const prompt = buildTaskRoomAgentPrompt('peer');

    expect(prompt).toContain('как peer');
    expect(prompt).toContain('agent-task-room search');
    expect(prompt).toContain('watch_room');
    expect(prompt).toContain('human-confirm');
  });
});
