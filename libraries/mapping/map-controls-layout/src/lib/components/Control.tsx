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
  /** stays on screen while the layout hides its controls, see `ControlLayoutProps` */
  keepWhenHidden?: boolean;
}

function Control({
  position,
  children,
  order,
  keepWhenHidden = false,
}: ControlProps) {
  const { addControl, updateControl, removeControl } = useControlContext();
  const registeredRef = useRef<ControlComponent | null>(null);

  // A parent re-render hands over a new `children` element on every pass.
  // Replacing the registered entry in place keeps that to one layout update
  // instead of a remove-then-add pair per control.
  useEffect(() => {
    const next: ControlComponent = {
      position,
      component: children,
      order,
      keepWhenHidden,
    };
    const previous = registeredRef.current;
    if (previous) {
      updateControl(previous, next);
    } else {
      addControl(next);
    }
    registeredRef.current = next;
  }, [addControl, children, order, position, keepWhenHidden, updateControl]);

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
