import { Room } from "./room.js";

export class RoomManager {
  private rooms = new Map<string, Room>();

  getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);

    if (!room) {
      room = new Room();
      this.rooms.set(roomId, room);

      console.log(`Room created: ${roomId}`);
    }

    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  removeClientFromRoom(roomId: string, clientId: string) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return;
    }

    room.removeClient(clientId);

    if (room.getClientCount() === 0) {
      this.rooms.delete(roomId);

      console.log(`Room removed: ${roomId}`);
    }
  }
}