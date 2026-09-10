import type { Participant } from "../sync/types";

type ParticipantListProps = {
  participants: Participant[];
  localClientId: string;
};

export function ParticipantList({
  participants,
  localClientId,
}: ParticipantListProps) {
  return (
    <div
      style={{
        width: "240px",
        padding: "16px",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        background: "#ffffff",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: "15px",
          fontWeight: 700,
          marginBottom: "12px",
        }}
      >
        Participants ({participants.length})
      </div>

      {participants.length === 0 && (
        <div
          style={{
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          No participants
        </div>
      )}

      {participants.map((participant) => {
        const isLocal =
          participant.clientId ===
          localClientId;

        return (
          <div
            key={participant.clientId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 0",
              fontSize: "13px",
            }}
          >
            <div
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: isLocal
                  ? "#2563eb"
                  : "#ef4444",
                flexShrink: 0,
              }}
            />

            <span>
              {isLocal
                ? "You"
                : participant.clientId.slice(
                    0,
                    8,
                  )}
            </span>
          </div>
        );
      })}
    </div>
  );
}