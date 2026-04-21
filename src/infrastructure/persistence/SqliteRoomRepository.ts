import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { RoomRepository, SearchableRoomRepository } from '../../domain/room/RoomRepository.js';
import type { RoomHistoryEntry, RoomSearchResult, SearchRoomsInput, TaskRoom } from '../../domain/room/room-types.js';

function trimText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class SqliteRoomRepository implements RoomRepository, SearchableRoomRepository {
  public constructor(private readonly storageFile: string) {}

  public async loadAll(): Promise<TaskRoom[]> {
    return this.withDatabase((database) => {
      const rows = database
        .prepare('SELECT snapshot_json as snapshotJson FROM rooms ORDER BY updated_at DESC')
        .all() as Array<{ snapshotJson: string }>;

      return rows.map((row) => JSON.parse(String(row.snapshotJson)) as TaskRoom);
    });
  }

  public async saveAll(rooms: TaskRoom[]): Promise<void> {
    this.withDatabase((database) => {
      database.exec('BEGIN');

      try {
        database.exec('DELETE FROM room_history');
        database.exec('DELETE FROM rooms');

        const insertRoom = database.prepare(`
          INSERT INTO rooms (
            room_id,
            title,
            status,
            created_at,
            updated_at,
            closed_at,
            resolution,
            task_description,
            jira_url,
            comment,
            search_text,
            snapshot_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertHistory = database.prepare(`
          INSERT INTO room_history (
            entry_id,
            room_id,
            entry_type,
            kind,
            title,
            body,
            author_type,
            author_id,
            author_label,
            created_at,
            references_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const room of rooms) {
          insertRoom.run(
            room.roomId,
            room.title,
            room.status,
            room.createdAt,
            room.updatedAt,
            room.closedAt,
            room.resolution,
            room.taskInput.taskDescription,
            room.taskInput.jiraUrl,
            room.taskInput.comment,
            this.buildSearchText(room),
            JSON.stringify(room),
          );

          for (const entry of this.buildHistoryEntries(room)) {
            insertHistory.run(
              entry.entryId,
              entry.roomId,
              entry.entryType,
              entry.kind,
              entry.title,
              entry.body,
              entry.authorType,
              entry.authorId,
              entry.authorLabel,
              entry.createdAt,
              JSON.stringify(entry.references),
            );
          }
        }

        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    });
  }

  public async searchRooms(input: SearchRoomsInput): Promise<{ rooms: RoomSearchResult[] }> {
    return this.withDatabase((database) => {
      const query = trimText(input.query);
      const limit = this.normalizeLimit(input.limit, 20);
      const status = trimText(input.status);
      const conditions: string[] = [];
      const parameters: Array<string | number> = [];

      if (status && status !== 'all') {
        conditions.push('status = ?');
        parameters.push(status);
      }

      if (query) {
        conditions.push('lower(search_text) LIKE ?');
        parameters.push(`%${query.toLowerCase()}%`);
      }

      const sql = [
        'SELECT snapshot_json as snapshotJson',
        'FROM rooms',
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        'ORDER BY updated_at DESC',
        'LIMIT ?',
      ]
        .filter(Boolean)
        .join(' ');

      const rows = database.prepare(sql).all(...parameters, limit) as Array<{ snapshotJson: string }>;

      return {
        rooms: rows
          .map((row) => JSON.parse(String(row.snapshotJson)) as TaskRoom)
          .map((room) => this.buildSearchResult(room, query))
          .filter((room): room is RoomSearchResult => room !== null),
      };
    });
  }

  public async getRoomHistory(roomId: string, limit = 50): Promise<{ entries: RoomHistoryEntry[] }> {
    return this.withDatabase((database) => {
      const rows = database
        .prepare(`
          SELECT
            entry_id as entryId,
            room_id as roomId,
            entry_type as entryType,
            kind,
            title,
            body,
            author_type as authorType,
            author_id as authorId,
            author_label as authorLabel,
            created_at as createdAt,
            references_json as referencesJson
          FROM room_history
          WHERE room_id = ?
          ORDER BY created_at DESC, entry_id DESC
          LIMIT ?
        `)
        .all(roomId, this.normalizeLimit(limit, 50, 200)) as Array<{
        entryId: string;
        roomId: string;
        entryType: RoomHistoryEntry['entryType'];
        kind: string;
        title: string | null;
        body: string;
        authorType: RoomHistoryEntry['authorType'];
        authorId: string;
        authorLabel: string;
        createdAt: string;
        referencesJson: string;
      }>;

      return {
        entries: rows.map((row) => ({
          entryId: row.entryId,
          roomId: row.roomId,
          entryType: row.entryType,
          kind: row.kind,
          title: row.title,
          body: row.body,
          authorType: row.authorType,
          authorId: row.authorId,
          authorLabel: row.authorLabel,
          createdAt: row.createdAt,
          references: this.parseReferences(row.referencesJson),
        })),
      };
    });
  }

  private withDatabase<T>(callback: (database: DatabaseSync) => T): T {
    fs.mkdirSync(path.dirname(this.storageFile), { recursive: true });
    const database = new DatabaseSync(this.storageFile);

    try {
      this.ensureSchema(database);
      return callback(database);
    } finally {
      database.close();
    }
  }

  private ensureSchema(database: DatabaseSync): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT,
        resolution TEXT,
        task_description TEXT,
        jira_url TEXT,
        comment TEXT,
        search_text TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS room_history (
        entry_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT,
        body TEXT NOT NULL,
        author_type TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        references_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS rooms_updated_at_idx ON rooms(updated_at DESC);
      CREATE INDEX IF NOT EXISTS rooms_status_idx ON rooms(status);
      CREATE INDEX IF NOT EXISTS room_history_room_created_idx ON room_history(room_id, created_at DESC);
    `);
  }

  private normalizeLimit(value: number | undefined, fallback: number, max = 100): number {
    if (!Number.isFinite(value) || !value || value <= 0) {
      return fallback;
    }

    return Math.min(Math.trunc(value), max);
  }

  private parseReferences(rawJson: string): string[] {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      return Array.isArray(parsed) ? parsed.map(String).map(trimText).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  private buildSearchText(room: TaskRoom): string {
    const parts: string[] = [
      room.roomId,
      room.title,
      room.status,
      room.statusReason,
      room.taskInput?.taskDescription ?? '',
      room.taskInput?.jiraUrl ?? '',
      room.taskInput?.comment ?? '',
    ];

    for (const participant of Object.values(room.participants ?? {})) {
      parts.push(
        participant.label,
        participant.role,
        participant.context?.systemScope ?? '',
        participant.context?.summary ?? '',
      );
    }

    for (const message of room.messages ?? []) {
      parts.push(message.title ?? '', message.body, ...(message.references ?? []));
    }

    for (const artifact of room.artifacts ?? []) {
      parts.push(artifact.title, artifact.summary ?? '', artifact.content ?? '', artifact.uri ?? '', ...(artifact.tags ?? []));
    }

    for (const decision of room.decisionLog ?? []) {
      parts.push(decision.title, decision.summary, decision.rationale ?? '', decision.status, ...(decision.references ?? []));
    }

    for (const feedback of room.humanFeedback ?? []) {
      parts.push(feedback.humanLabel, feedback.verdict, feedback.comment ?? '');
    }

    return parts.map(trimText).filter(Boolean).join('\n');
  }

  private buildSearchResult(room: TaskRoom, query: string): RoomSearchResult | null {
    const sources = this.collectSearchSources(room);

    if (!query) {
      return {
        roomId: room.roomId,
        title: room.title,
        status: room.status,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        closedAt: room.closedAt,
        resolution: room.resolution,
        snippet: this.buildSnippet(sources[0]?.text ?? '', ''),
        matchSource: ['recent'],
      };
    }

    const matched = sources.filter((source) => source.text.toLowerCase().includes(query.toLowerCase()));

    if (matched.length === 0) {
      return null;
    }

    return {
      roomId: room.roomId,
      title: room.title,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      closedAt: room.closedAt,
      resolution: room.resolution,
      snippet: this.buildSnippet(matched[0]?.text ?? '', query),
      matchSource: matched.map((entry) => entry.source),
    };
  }

  private collectSearchSources(room: TaskRoom): Array<{ source: string; text: string }> {
    const sources: Array<{ source: string; text: string }> = [
      { source: 'room', text: room.roomId },
      { source: 'title', text: room.title },
      { source: 'status', text: room.statusReason },
      { source: 'task', text: room.taskInput?.taskDescription ?? '' },
      { source: 'jira', text: room.taskInput?.jiraUrl ?? '' },
      { source: 'comment', text: room.taskInput?.comment ?? '' },
    ];

    for (const participant of Object.values(room.participants ?? {})) {
      sources.push({
        source: 'participant',
        text: [participant.label, participant.role, participant.context?.systemScope, participant.context?.summary]
          .filter(Boolean)
          .join(' '),
      });
    }

    for (const message of room.messages ?? []) {
      sources.push({
        source: 'message',
        text: [message.title, message.body, ...(message.references ?? [])].filter(Boolean).join(' '),
      });
    }

    for (const artifact of room.artifacts ?? []) {
      sources.push({
        source: 'artifact',
        text: [artifact.title, artifact.summary, artifact.content, artifact.uri, ...(artifact.tags ?? [])]
          .filter(Boolean)
          .join(' '),
      });
    }

    for (const decision of room.decisionLog ?? []) {
      sources.push({
        source: 'decision',
        text: [decision.title, decision.summary, decision.rationale, decision.status, ...(decision.references ?? [])]
          .filter(Boolean)
          .join(' '),
      });
    }

    for (const feedback of room.humanFeedback ?? []) {
      sources.push({
        source: 'human_feedback',
        text: [feedback.humanLabel, feedback.verdict, feedback.comment].filter(Boolean).join(' '),
      });
    }

    return sources
      .map((source) => ({
        source: source.source,
        text: trimText(source.text),
      }))
      .filter((source) => source.text.length > 0);
  }

  private buildHistoryEntries(room: TaskRoom): RoomHistoryEntry[] {
    const entries: RoomHistoryEntry[] = [
      ...(room.messages ?? []).map((message) => ({
        entryId: `message-${room.roomId}-${message.sequence}`,
        roomId: room.roomId,
        entryType: 'message' as const,
        kind: message.kind,
        title: message.title,
        body: message.body,
        authorType: message.authorType,
        authorId: message.authorId,
        authorLabel: this.resolveHistoryAuthorLabel(room, message.authorType, message.authorId),
        createdAt: message.createdAt,
        references: [...(message.references ?? [])],
      })),
      ...(room.artifacts ?? []).map((artifact) => ({
        entryId: artifact.artifactId,
        roomId: room.roomId,
        entryType: 'artifact' as const,
        kind: artifact.kind,
        title: artifact.title,
        body: [artifact.summary, artifact.content, artifact.uri, (artifact.tags ?? []).join(', ')].filter(Boolean).join('\n'),
        authorType: artifact.authorType,
        authorId: artifact.authorId,
        authorLabel: artifact.authorLabel,
        createdAt: artifact.createdAt,
        references: [...(artifact.tags ?? [])],
      })),
      ...(room.decisionLog ?? []).map((decision) => ({
        entryId: decision.decisionId,
        roomId: room.roomId,
        entryType: 'decision' as const,
        kind: decision.status,
        title: decision.title,
        body: [decision.summary, decision.rationale].filter(Boolean).join('\n'),
        authorType: decision.authorType,
        authorId: decision.authorId,
        authorLabel: decision.authorLabel,
        createdAt: decision.createdAt,
        references: [...(decision.references ?? [])],
      })),
      ...(room.humanFeedback ?? []).map((feedback, index) => ({
        entryId: `human-feedback-${room.roomId}-${index}-${feedback.createdAt}`,
        roomId: room.roomId,
        entryType: 'human_feedback' as const,
        kind: feedback.verdict,
        title: 'Решение человека',
        body: [feedback.verdict, feedback.comment].filter(Boolean).join('\n'),
        authorType: 'human' as const,
        authorId: feedback.humanLabel,
        authorLabel: feedback.humanLabel,
        createdAt: feedback.createdAt,
        references: [],
      })),
    ];

    return entries.sort((left, right) => {
      const byDate = right.createdAt.localeCompare(left.createdAt);

      if (byDate !== 0) {
        return byDate;
      }

      return right.entryId.localeCompare(left.entryId);
    });
  }

  private resolveHistoryAuthorLabel(
    room: TaskRoom,
    authorType: RoomHistoryEntry['authorType'],
    authorId: string,
  ): string {
    if (authorType === 'participant') {
      return room.participants[authorId]?.label ?? authorId;
    }

    return authorId;
  }

  private buildSnippet(text: string, query: string): string | null {
    const normalizedText = trimText(text);

    if (!normalizedText) {
      return null;
    }

    if (!query) {
      return normalizedText.slice(0, 180);
    }

    const normalizedQuery = query.toLowerCase();
    const matchIndex = normalizedText.toLowerCase().indexOf(normalizedQuery);

    if (matchIndex < 0) {
      return normalizedText.slice(0, 180);
    }

    const start = Math.max(0, matchIndex - 48);
    const end = Math.min(normalizedText.length, matchIndex + normalizedQuery.length + 96);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < normalizedText.length ? '...' : '';

    return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
  }
}
