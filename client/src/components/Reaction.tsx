type ReactionProps = {
  x: number;
  y: number;
  onComplete?: () => void;
};

export function Reaction({
  x,
  y,
  onComplete,
}: ReactionProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: "translate(-50%, -50%)",
        fontSize: "40px",
        lineHeight: "1",
        zIndex: 100,
        pointerEvents: "none",
        animation:
          "reactionFloat 1200ms ease-out forwards",
      }}
      onAnimationEnd={onComplete}
    >
      ❤️
    </div>
  );
}