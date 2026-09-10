export type JoinMessage = {
  type: "join";
  roomId: string;
  clientId: string;
};

export type CursorMessage = {
  type: "cursor";
  seq: number;
  x: number;
  y: number;
  timestamp: number;
};

export type ReactionMessage = {
  type: "reaction";
  seq: number;
  reaction: "❤️";
  x: number;
  y: number;
  timestamp: number;
};

export type PingMessage = {
  type: "ping";
  timestamp: number;
};

export type ClientMessage =
  | JoinMessage
  | CursorMessage
  | ReactionMessage
  | PingMessage;

export type Participant = {
  clientId: string;
  x: number;
  y: number;
};

export type WelcomeMessage = {
  type: "welcome";
  clientId: string;
};

export type SnapshotMessage = {
  type: "snapshot";
  participants: Participant[];
};

export type ParticipantJoinedMessage = {
  type: "participant_joined";
  clientId: string;
};

export type ParticipantLeftMessage = {
  type: "participant_left";
  clientId: string;
};

export type RemoteCursorMessage = {
  type: "cursor";
  clientId: string;
  seq: number;
  x: number;
  y: number;
  timestamp: number;
};

export type RemoteReactionMessage = {
  type: "reaction";
  clientId: string;
  seq: number;
  reaction: "❤️";
  x: number;
  y: number;
  timestamp: number;
};

export type PongMessage = {
  type: "pong";
  timestamp: number;
};

export type ErrorMessage = {
  type: "error";
  code: string;
  message: string;
};

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | RemoteCursorMessage
  | RemoteReactionMessage
  | PongMessage
  | ErrorMessage;