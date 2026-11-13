import { ReactNode, useEffect, useRef } from "react";
import { Positions, useControlContext } from "../map-control";

interface ControlProps {
  position: Positions;
  children: ReactNode;
  order: number;
  fullCollapseWidth?: boolean;
  bottomLeftWidth?: number;
  bottomRightWidth?: number;
  title?: string;
  /** stays on screen while the surrounding layout hides its controls */
  keepVisible?: boolean;
}

function Control({ position, children, order, keepVisible }: ControlProps) {
  const { registry } = useControlContext();
  const slotIdRef = useRef<number | null>(null);

  // A parent re-render hands over a new `children` element on every pass.
  // The registry passes it to this control's slot only, so the layout and
  // the other controls do not re-render with it.
  useEffect(() => {
    const slotId = slotIdRef.current;
    if (slotId === null) {
      slotIdRef.current = registry.register(
        position,
        order,
        children,
        keepVisible
      );
    } else {
      registry.update(slotId, position, order, children, keepVisible);
    }
  }, [registry, children, order, position, keepVisible]);

  useEffect(
    () => () => {
      const slotId = slotIdRef.current;
      if (slotId === null) return;
      slotIdRef.current = null;
      registry.unregister(slotId);
    },
    [registry]
  );

  return <></>;
}

export default Control;
