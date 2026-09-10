import { useEffect, useRef, useState } from "react";

import { SyncEngine } from "./sync/syncEngine";
import type {
  Participant,
  RemoteCursor,
} from "./sync/types";

import { CursorRenderer } from "./rendering/cursorRenderer";
import { InterpolationBuffer } from "./interpolation/interpolation";
import { Reaction } from "./components/Reaction";
import { ParticipantList } from "./components/ParticipantList";

type ReactionState = {
  id: string;
  clientId: string;
  x: number;
  y: number;
};

function getClientId(): string {
  const existing =
    sessionStorage.getItem("clientId");

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();

  sessionStorage.setItem(
    "clientId",
    id,
  );

  return id;
}

function App() {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const syncEngineRef =
    useRef<SyncEngine | null>(null);

  const rendererRef =
    useRef<CursorRenderer | null>(null);

  const interpolationRef =
    useRef<InterpolationBuffer | null>(
      null,
    );

  const remoteCursorsRef =
    useRef<Record<string, RemoteCursor>>(
      {},
    );

  const localPositionRef = useRef({
    x: 0.5,
    y: 0.5,
  });

  const reactionIdRef =
    useRef(0);

  const [connected, setConnected] =
    useState(false);

  const [clientId, setClientId] =
    useState("");

  const [latency, setLatency] =
    useState<number | null>(null);

  const [cursorLocked, setCursorLocked] =
    useState(false);

  const [participants, setParticipants] =
    useState<
      Record<string, Participant>
    >({});

  const [reactions, setReactions] =
    useState<ReactionState[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    rendererRef.current =
      new CursorRenderer(canvas);

    interpolationRef.current =
      new InterpolationBuffer();

    const currentClientId =
      getClientId();

    setClientId(currentClientId);

    const syncEngine = new SyncEngine({
      roomId: "demo-room",
      clientId: currentClientId,

      onConnected: () => {
        setConnected(true);
      },

      onDisconnected: () => {
        setConnected(false);
        setLatency(null);
      },

      onLatency: (value) => {
        setLatency(value);
      },

      onSnapshot: (snapshot) => {
        const nextParticipants: Record<
          string,
          Participant
        > = {};

        const nextCursors: Record<
          string,
          RemoteCursor
        > = {};

        const now = Date.now();

        for (const participant of snapshot) {
          if (
            participant.clientId ===
            currentClientId
          ) {
            continue;
          }

          nextParticipants[
            participant.clientId
          ] = participant;

          const cursor: RemoteCursor = {
            clientId:
              participant.clientId,
            x: participant.x,
            y: participant.y,
            seq: 0,
            timestamp: now,
          };

          nextCursors[
            participant.clientId
          ] = cursor;

          interpolationRef.current?.addSample(
            cursor,
          );
        }

        setParticipants(
          nextParticipants,
        );

        remoteCursorsRef.current =
          nextCursors;
      },

      onParticipantJoined: (
        joinedClientId,
      ) => {
        if (
          joinedClientId ===
          currentClientId
        ) {
          return;
        }

        const cursor: RemoteCursor = {
          clientId:
            joinedClientId,
          x: 0.5,
          y: 0.5,
          seq: 0,
          timestamp: Date.now(),
        };

        remoteCursorsRef.current[
          joinedClientId
        ] = cursor;

        interpolationRef.current?.addSample(
          cursor,
        );

        setParticipants((current) => ({
          ...current,

          [joinedClientId]: {
            clientId:
              joinedClientId,
            x: 0.5,
            y: 0.5,
          },
        }));
      },

      onParticipantLeft: (
        leftClientId,
      ) => {
        setParticipants((current) => {
          const next = {
            ...current,
          };

          delete next[leftClientId];

          return next;
        });

        delete remoteCursorsRef.current[
          leftClientId
        ];

        interpolationRef.current?.removeCursor(
          leftClientId,
        );
      },

      onCursor: (cursor) => {
        interpolationRef.current?.addSample(
          cursor,
        );

        remoteCursorsRef.current[
          cursor.clientId
        ] = cursor;

        setParticipants((current) => ({
          ...current,

          [cursor.clientId]: {
            clientId:
              cursor.clientId,
            x: cursor.x,
            y: cursor.y,
          },
        }));
      },

      onReaction: (
        reactionClientId,
        x,
        y,
      ) => {
        reactionIdRef.current++;

        const reaction: ReactionState =
          {
            id: `${reactionClientId}-${reactionIdRef.current}`,
            clientId:
              reactionClientId,
            x,
            y,
          };

        setReactions((current) => [
          ...current,
          reaction,
        ]);
      },
    });

    syncEngineRef.current =
      syncEngine;

    syncEngine.connect();

    let animationFrame = 0;

    const render = () => {
      const now = Date.now();

      const interpolatedCursors: RemoteCursor[] =
        [];

      for (const cursor of Object.values(
        remoteCursorsRef.current,
      )) {
        const position =
          interpolationRef.current?.getPosition(
            cursor.clientId,
            now,
          );

        if (!position) {
          continue;
        }

        interpolatedCursors.push({
          ...cursor,
          x: position.x,
          y: position.y,
        });
      }

      rendererRef.current?.render(
        localPositionRef.current,
        interpolatedCursors,
      );

      animationFrame =
        requestAnimationFrame(
          render,
        );
    };

    animationFrame =
      requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(
        animationFrame,
      );

      syncEngine.disconnect();

      syncEngineRef.current =
        null;

      rendererRef.current =
        null;

      interpolationRef.current =
        null;
    };
  }, []);

  const handleMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (cursorLocked) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    const x = Math.max(
      0,
      Math.min(
        1,
        (event.clientX -
          rect.left) /
          rect.width,
      ),
    );

    const y = Math.max(
      0,
      Math.min(
        1,
        (event.clientY -
          rect.top) /
          rect.height,
      ),
    );

    localPositionRef.current = {
      x,
      y,
    };

    syncEngineRef.current?.sendCursor(
      x,
      y,
    );
  };

  const handleClick = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    const x = Math.max(
      0,
      Math.min(
        1,
        (event.clientX -
          rect.left) /
          rect.width,
      ),
    );

    const y = Math.max(
      0,
      Math.min(
        1,
        (event.clientY -
          rect.top) /
          rect.height,
      ),
    );

    reactionIdRef.current++;

    const localReaction: ReactionState =
      {
        id: `local-${reactionIdRef.current}`,
        clientId: "local",
        x,
        y,
      };

    setReactions((current) => [
      ...current,
      localReaction,
    ]);

    syncEngineRef.current?.sendReaction(
      x,
      y,
    );

    if (!cursorLocked) {
      setCursorLocked(true);

      localPositionRef.current = {
        x,
        y,
      };

      syncEngineRef.current?.sendCursor(
        x,
        y,
      );
    } else {
      setCursorLocked(false);

      localPositionRef.current = {
        x,
        y,
      };

      syncEngineRef.current?.sendCursor(
        x,
        y,
      );
    }
  };

  const participantList: Participant[] =
    [
      ...(clientId
        ? [
            {
              clientId,
              x: localPositionRef.current
                .x,
              y: localPositionRef.current
                .y,
            },
          ]
        : []),

      ...Object.values(participants),
    ];

  const latencyLabel =
    latency === null
      ? "--"
      : `${latency} ms`;

  const latencyQuality =
    latency === null
      ? "Waiting"
      : latency < 100
        ? "Excellent"
        : latency < 200
          ? "Good"
          : latency < 400
            ? "Fair"
            : "High";

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px",
        boxSizing: "border-box",
        fontFamily:
          "Arial, sans-serif",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          marginBottom: "16px",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
            }}
          >
            Real-Time Multiplayer Sync
          </h1>

          <p
            style={{
              marginTop: "8px",
              marginBottom: 0,
              color: "#64748b",
            }}
          >
            Move your cursor. Click
            to lock/unlock its
            position.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              padding:
                "8px 12px",
              borderRadius:
                "8px",
              background:
                connected
                  ? "#dcfce7"
                  : "#fee2e2",
              color: connected
                ? "#166534"
                : "#991b1b",
              fontSize:
                "14px",
              fontWeight: 600,
            }}
          >
            {connected
              ? "Connected"
              : "Disconnected"}
          </div>

          <div
            style={{
              padding:
                "8px 12px",
              borderRadius:
                "8px",
              background:
                "#ffffff",
              border:
                "1px solid #e2e8f0",
              color: "#334155",
              fontSize:
                "14px",
              fontWeight: 600,
            }}
          >
            RTT: {latencyLabel}
          </div>

          <div
            style={{
              padding:
                "8px 12px",
              borderRadius:
                "8px",
              background:
                "#ffffff",
              border:
                "1px solid #e2e8f0",
              color: "#64748b",
              fontSize:
                "13px",
            }}
          >
            {latencyQuality}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "20px",
          alignItems:
            "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            flex: "1 1 700px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              marginBottom:
                "12px",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              fontSize:
                "14px",
              fontWeight: 600,
            }}
          >
            <span>
              Participants:{" "}
              {participantList.length}
            </span>

            <span
              style={{
                color:
                  cursorLocked
                    ? "#b45309"
                    : "#64748b",
                fontWeight: 500,
              }}
            >
              Cursor:{" "}
              {cursorLocked
                ? "Locked"
                : "Following mouse"}
            </span>
          </div>

          <div
            style={{
              position:
                "relative",
              width: "100%",
              maxWidth:
                "1200px",
            }}
          >
            <canvas
              ref={canvasRef}
              width={1200}
              height={700}
              onMouseMove={
                handleMouseMove
              }
              onClick={
                handleClick
              }
              style={{
                width: "100%",
                maxWidth:
                  "1200px",
                height: "auto",
                aspectRatio:
                  "12 / 7",
                display: "block",
                border:
                  "2px solid #222",
                borderRadius:
                  "12px",
                background:
                  "#ffffff",
                cursor:
                  cursorLocked
                    ? "default"
                    : "crosshair",
              }}
            />

            {reactions.map(
              (reaction) => (
                <Reaction
                  key={
                    reaction.id
                  }
                  x={
                    reaction.x
                  }
                  y={
                    reaction.y
                  }
                  onComplete={() => {
                    setReactions(
                      (
                        current,
                      ) =>
                        current.filter(
                          (
                            item,
                          ) =>
                            item.id !==
                            reaction.id,
                        ),
                    );
                  }}
                />
              ),
            )}
          </div>
        </div>

        <ParticipantList
          participants={
            participantList
          }
          localClientId={
            clientId
          }
        />
      </div>
    </div>
  );
}

export default App;