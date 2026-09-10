# Real-Time Multiplayer Cursor & State Sync

A real-time multiplayer synchronization system built using raw WebSockets and TypeScript.

Multiple clients can join the same room and see each other's cursor movement, presence, and reactions in real time.

## Features

- Real-time cursor synchronization using raw WebSockets
- Multiple clients sharing the same room
- Participant presence and join/leave events
- Initial state snapshot for newly connected clients
- Sequence numbers for ordered cursor updates
- Server-side stale update rejection
- Client-side interpolation for smoother cursor movement
- Cursor update throttling at approximately 30 FPS
- Exponential-backoff reconnection
- WebSocket heartbeat using ping/pong frames
- Application-level RTT measurement
- Connection and latency indicators
- Click reactions
- Runtime validation of incoming messages
- Maximum WebSocket message size protection
- Fragmented WebSocket message handling
- TypeScript end-to-end type safety
- No third-party real-time synchronization libraries

## Tech Stack

### Client

- React
- TypeScript
- Vite
- HTML Canvas
- Raw WebSocket API

### Server

- Node.js
- TypeScript
- Native HTTP server
- Raw WebSocket protocol implementation

### Shared

- TypeScript protocol definitions shared between client and server

## Project Structure

```text
multiplayer-sync-assignment/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectionStatus.tsx
│   │   │   ├── Cursor.tsx
│   │   │   ├── ParticipantList.tsx
│   │   │   └── Reaction.tsx
│   │   │
│   │   ├── interpolation/
│   │   │   └── interpolation.ts
│   │   │
│   │   ├── rendering/
│   │   │   └── cursorRenderer.ts
│   │   │
│   │   ├── sync/
│   │   │   ├── connection.ts
│   │   │   ├── protocol.ts
│   │   │   ├── syncEngine.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   │
│   ├── package.json
│   ├── tsconfig.app.json
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── protocol.ts
│   │   ├── room.ts
│   │   ├── roomManager.ts
│   │   └── server.ts
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── shared/
│   └── protocol.ts
│
├── README.md
└── ARCHITECTURE.md