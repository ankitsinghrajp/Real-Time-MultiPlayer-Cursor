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
    <aside className="participants-panel">

      <div className="panel-header">

        <div className="panel-title">
          Participants
        </div>

        <div className="panel-count">
          {participants.length}
        </div>

      </div>

      <div className="participant-list">

        {participants.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              •
            </div>

            <div>
              Waiting for participants
            </div>
          </div>
        )}

        {participants.map(
          (participant) => {
            const isLocal =
              participant.clientId ===
              localClientId;

            const shortId =
              participant.clientId.slice(
                0,
                6,
              );

            return (
              <div
                key={
                  participant.clientId
                }
                className="participant"
              >

                <div
                  className={
                    isLocal
                      ? "participant-avatar you"
                      : "participant-avatar remote"
                  }
                >
                  {isLocal
                    ? "Y"
                    : shortId
                        .charAt(0)
                        .toUpperCase()}
                </div>

                <div className="participant-info">

                  <div className="participant-name">
                    {isLocal
                      ? "You"
                      : `User ${shortId}`}
                  </div>

                  <div className="participant-role">
                    {isLocal
                      ? "Your cursor"
                      : "Remote participant"}
                  </div>

                </div>

                <div
                  className={
                    isLocal
                      ? "participant-status you"
                      : "participant-status"
                  }
                />

              </div>
            );
          },
        )}

      </div>

    </aside>
  );
}