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
}

function Control({ position, children, order }: ControlProps) {
  const { registry } = useControlContext();
  const slotIdRef = useRef<number | null>(null);

  // A parent re-render hands over a new `children` element on every pass.
  // The registry passes it to this control's slot only, so the layout and
  // the other controls do not re-render with it.
  useEffect(() => {
    const slotId = slotIdRef.current;
    if (slotId === null) {
      slotIdRef.current = registry.register(position, order, children);
    } else {
      registry.update(slotId, position, order, children);
    }
  }, [registry, children, order, position]);

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
