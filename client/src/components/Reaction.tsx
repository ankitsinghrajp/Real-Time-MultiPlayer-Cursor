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
      className="reaction"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
      }}
      onAnimationEnd={onComplete}
    >
      ❤️
    </div>
  );
}