import { Icon } from "../Icon/Icon";
import { formatRankingNumber } from "../RankingsExplorer/types";

export function JumpControls({
  direction,
  visible,
  armed,
  currentPosition,
  total,
  onJump,
}: {
  direction: "up" | "down";
  visible: boolean;
  armed: boolean;
  currentPosition: number;
  total: number;
  onJump: () => void;
}) {
  const nearEdge =
    direction === "up"
      ? currentPosition <= 5000
      : Number.isFinite(total) && currentPosition >= total - 5000;
  let label = `Jump ${formatRankingNumber(5000)}`;
  if (armed || nearEdge) label = direction === "up" ? "Jump to top" : "Jump to end";

  return (
    <div className={`Jump Jump--${direction}${visible ? " visible" : ""}`}>
      <button className="Jump-button" onClick={onJump} type="button">
        <Icon name="arrow" direction={direction} />
        <span>{label}</span>
        <Icon name="arrow" direction={direction} />
      </button>
    </div>
  );
}
