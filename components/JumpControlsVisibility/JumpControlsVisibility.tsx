import "./JumpControlsVisibility.css";
import type { ReactElement } from "react";

export function JumpControlsVisibility({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactElement;
}) {
  return (
    <div className="JumpControlsVisibility" data-visible={visible}>
      {children}
    </div>
  );
}
