import { ReactNode, useEffect } from "react";
import { Positions, useControlContext } from "./ControlProvider";

interface ControlProps {
  position: Positions;
  children: ReactNode;
  order: number;
}

export function Control({ position, children, order }: ControlProps) {
  const { addControl, removeControl } = useControlContext();

  useEffect(() => {
    addControl({ position, component: children, order });

    return () => {
      removeControl({ position, component: children, order });
    };
  }, [children]);

  return <></>;
}
