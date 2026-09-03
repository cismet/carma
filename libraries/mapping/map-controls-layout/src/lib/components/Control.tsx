import { ReactNode, useEffect, useRef } from "react";
import { ControlComponent, Positions, useControlContext } from "../map-control";

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
  const { addControl, updateControl, removeControl } = useControlContext();
  const registeredRef = useRef<ControlComponent | null>(null);

  // A parent re-render hands over a new `children` element on every pass.
  // Replacing the registered entry in place keeps that to one layout update
  // instead of a remove-then-add pair per control.
  useEffect(() => {
    const next: ControlComponent = { position, component: children, order };
    const previous = registeredRef.current;
    if (previous) {
      updateControl(previous, next);
    } else {
      addControl(next);
    }
    registeredRef.current = next;
  }, [addControl, children, order, position, updateControl]);

  useEffect(
    () => () => {
      const registered = registeredRef.current;
      if (!registered) return;
      registeredRef.current = null;
      removeControl(registered);
    },
    [removeControl]
  );

  return <></>;
}

export default Control;
