import type { RoomHistoryEntry, RoomSearchResult, SearchRoomsInput, TaskRoom } from './room-types.js';

export interface RoomRepository {
  loadAll(): Promise<TaskRoom[]>;
  saveAll(rooms: TaskRoom[]): Promise<void>;
}

export interface SearchableRoomRepository {
  searchRooms(input: SearchRoomsInput): Promise<{ rooms: RoomSearchResult[] }>;
  getRoomHistory(roomId: string, limit?: number): Promise<{ entries: RoomHistoryEntry[] }>;
}
