# Architecture — Real-Time Multiplayer Cursor & State Sync

## 1. System Overview

The application is a real-time multiplayer synchronization system where multiple clients connect to a shared room and exchange cursor state and reactions.

The system intentionally uses the native WebSocket protocol instead of a real-time abstraction library.

```text
                    ┌─────────────────────┐
                    │      Client A       │
                    │                     │
                    │ React + TypeScript  │
                    │ SyncEngine          │
                    │ Interpolation       │
                    │ Canvas Renderer      │
                    └──────────┬──────────┘
                               │
                               │ WebSocket
                               │
                               ▼
                    ┌─────────────────────┐
                    │       Server        │
                    │                     │
                    │ HTTP + WebSocket    │
                    │ RoomManager         │
                    │ Room State          │
                    │ Protocol Validator │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
          WebSocket                     WebSocket
                 │                           │
                 ▼                           ▼
       ┌─────────────────┐         ┌─────────────────┐
       │    Client B     │         │    Client C     │
       │                 │         │                 │
       │ SyncEngine      │         │ SyncEngine      │
       │ Interpolation   │         │ Interpolation   │
       │ Canvas          │         │ Canvas          │
       └─────────────────┘         └─────────────────┘