import { useEffect, useRef, useState } from "react";

import { SyncEngine } from "./sync/syncEngine";
import type {
  Participant,
  RemoteCursor,
} from "./sync/types";

import { CursorRenderer } from "./rendering/cursorRenderer";
import { InterpolationBuffer } from "./interpolation/interpolation";
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
    useRef<InterpolationBuffer | null>(null);

  const remoteCursorsRef =
    useRef<Record<string, RemoteCursor>>({});

  const localPositionRef =
    useRef({
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
    useState<Record<string, Participant>>({});

  const [reactions, setReactions] =
    useState<ReactionState[]>([]);

  useEffect(() => {
    const canvas =
      canvasRef.current;

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

    const syncEngine =
      new SyncEngine({
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
          const nextParticipants:
            Record<string, Participant> = {};

          const nextCursors:
            Record<string, RemoteCursor> = {};

          const now =
            Date.now();

          for (
            const participant of snapshot
          ) {
            if (
              participant.clientId ===
              currentClientId
            ) {
              continue;
            }

            nextParticipants[
              participant.clientId
            ] = participant;

            const cursor:
              RemoteCursor = {
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

          const cursor:
            RemoteCursor = {
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

          setParticipants(
            (current) => ({
              ...current,

              [joinedClientId]: {
                clientId:
                  joinedClientId,
                x: 0.5,
                y: 0.5,
              },
            }),
          );
        },

        onParticipantLeft: (
          leftClientId,
        ) => {
          setParticipants(
            (current) => {
              const next = {
                ...current,
              };

              delete next[
                leftClientId
              ];

              return next;
            },
          );

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

          setParticipants(
            (current) => ({
              ...current,

              [cursor.clientId]: {
                clientId:
                  cursor.clientId,
                x: cursor.x,
                y: cursor.y,
              },
            }),
          );
        },

        onReaction: (
          reactionClientId,
          x,
          y,
        ) => {
          reactionIdRef.current++;

          const reaction:
            ReactionState = {
            id:
              `remote-${reactionClientId}-${reactionIdRef.current}`,
            clientId:
              reactionClientId,
            x,
            y,
          };

          console.log(
            "REMOTE REACTION RECEIVED",
            reaction,
          );

          setReactions(
            (current) => [
              ...current,
              reaction,
            ],
          );

          setTimeout(() => {
            setReactions(
              (current) =>
                current.filter(
                  (item) =>
                    item.id !==
                    reaction.id,
                ),
            );
          }, 5000);
        },
      });

    syncEngineRef.current =
      syncEngine;

    syncEngine.connect();

    let animationFrame = 0;

    const render = () => {
      const now =
        Date.now();

      const interpolatedCursors:
        RemoteCursor[] = [];

      for (
        const cursor of Object.values(
          remoteCursorsRef.current,
        )
      ) {
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
      requestAnimationFrame(
        render,
      );

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

  const getCanvasPosition = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect =
      canvas.getBoundingClientRect();

    return {
      x: Math.max(
        0,
        Math.min(
          1,
          (event.clientX -
            rect.left) /
            rect.width,
        ),
      ),

      y: Math.max(
        0,
        Math.min(
          1,
          (event.clientY -
            rect.top) /
            rect.height,
        ),
      ),
    };
  };

  const handleMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (cursorLocked) {
      return;
    }

    const position =
      getCanvasPosition(event);

    if (!position) {
      return;
    }

    localPositionRef.current =
      position;

    syncEngineRef.current?.sendCursor(
      position.x,
      position.y,
    );
  };

  const handleCanvasClick = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const position =
      getCanvasPosition(event);

    if (!position) {
      return;
    }

    console.log(
      "CANVAS CLICK",
      position,
    );

    localPositionRef.current =
      position;

    /*
     * Cursor update
     */
    syncEngineRef.current?.sendCursor(
      position.x,
      position.y,
    );

    /*
     * Create local reaction
     */
    reactionIdRef.current++;

    const reaction:
      ReactionState = {
      id:
        `local-${reactionIdRef.current}`,

      clientId:
        clientId || "local",

      x: position.x,
      y: position.y,
    };

    console.log(
      "LOCAL REACTION CREATED",
      reaction,
    );

    /*
     * THIS IS THE IMPORTANT PART.
     *
     * Add the reaction directly
     * to React state.
     */
    setReactions(
      (current) => [
        ...current,
        reaction,
      ],
    );

    /*
     * Send reaction to server.
     */
    if (syncEngineRef.current) {
      console.log(
        "SENDING REACTION",
      );

      syncEngineRef.current.sendReaction(
        position.x,
        position.y,
      );
    }

    /*
     * Keep the heart visible
     * for 5 seconds.
     */
    setTimeout(() => {
      setReactions(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              reaction.id,
          ),
      );
    }, 5000);

    /*
     * Lock / unlock cursor.
     */
    setCursorLocked(
      (current) => !current,
    );
  };

  const participantList:
    Participant[] = [
      ...(clientId
        ? [
            {
              clientId,
              x:
                localPositionRef
                  .current.x,
              y:
                localPositionRef
                  .current.y,
            },
          ]
        : []),

      ...Object.values(
        participants,
      ),
    ];

  const latencyText =
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
    <main className="app-shell">
      <div className="app-content">

        <header className="header">

          <div className="brand-section">

            <div className="eyebrow">
              <span className="eyebrow-dot" />
              Live Collaboration
            </div>

            <h1 className="title">
              Real-Time{" "}
              <span className="title-gradient">
                Multiplayer
              </span>
            </h1>

            <p className="subtitle">
              Cursor &amp; state
              synchronization over
              raw WebSockets. Move
              your cursor, click to
              react, and collaborate
              with everyone in the
              room.
            </p>

          </div>

          <div className="status-group">

            <div className="status-card">

              <span
                className={
                  connected
                    ? "status-indicator connected"
                    : "status-indicator disconnected"
                }
              />

              <span className="status-value">
                {connected
                  ? "Connected"
                  : "Disconnected"}
              </span>

            </div>

            <div className="status-card">
              <span className="status-muted">
                RTT
              </span>

              <span className="status-value">
                {latencyText}
              </span>
            </div>

            <div className="status-card">
              <span className="status-muted">
                Network
              </span>

              <span className="status-value">
                {latencyQuality}
              </span>
            </div>

          </div>

        </header>

        <section className="workspace">

          <div className="canvas-section">

            <div className="canvas-header">

              <div className="canvas-title">
                <span className="canvas-title-dot" />
                Multiplayer Workspace
              </div>

              <div
                className={
                  cursorLocked
                    ? "cursor-mode locked"
                    : "cursor-mode"
                }
              >
                {cursorLocked
                  ? "Cursor locked"
                  : "Click to react"}
              </div>

            </div>

            <div className="canvas-wrapper">

              <canvas
                ref={canvasRef}
                width={1200}
                height={700}
                onMouseMove={
                  handleMouseMove
                }
                onClick={
                  handleCanvasClick
                }
                style={{
                  cursor:
                    cursorLocked
                      ? "default"
                      : "crosshair",
                }}
              />

              {/*
               * DIRECT REACTION LAYER
               *
               * No Reaction component.
               * No animation.
               * No animationend.
               *
               * This must display a
               * visible heart.
               */}
              {reactions.map(
                (reaction) => (
                  <div
                    key={
                      reaction.id
                    }
                    style={{
                      position:
                        "absolute",

                      left:
                        `${reaction.x * 100}%`,

                      top:
                        `${reaction.y * 100}%`,

                      transform:
                        "translate(-50%, -50%)",

                      width:
                        "70px",

                      height:
                        "70px",

                      display:
                        "flex",

                      alignItems:
                        "center",

                      justifyContent:
                        "center",

                      background:
                        "rgba(244, 63, 94, 0.12)",

                      border:
                        "2px solid rgba(244, 63, 94, 0.5)",

                      borderRadius:
                        "50%",

                      fontSize:
                        "40px",

                      lineHeight:
                        "1",

                      zIndex:
                        999999,

                      pointerEvents:
                        "none",

                      boxShadow:
                        "0 0 30px rgba(244, 63, 94, 0.45)",
                    }}
                  >
                    ❤️
                  </div>
                ),
              )}

            </div>

            <div className="workspace-footer">

              <div className="footer-item">
                <span className="footer-dot" />
                30 FPS SYNC
              </div>

              <div className="footer-item">
                <span className="footer-dot" />
                INTERPOLATED
              </div>

              <div className="footer-item">
                <span className="footer-dot" />
                RAW WEBSOCKET
              </div>

              <div className="footer-item">
                <span className="footer-dot" />
                SEQUENCE ORDERED
              </div>

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

        </section>

      </div>
    </main>
  );
}

export default App;