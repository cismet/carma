import { ReactNode, useEffect } from "react";
import { Positions, useControlContext } from "./ControlProvider";

interface ControlProps {
  position: Positions;
  children: ReactNode;
  order: number;
}

export function Control({ position, children, order }: ControlProps) {
  const { addControl, removeControl } = useControlContext();
  console.log("xxx", position);

  useEffect(() => {
    // Add this control component when mounted
    addControl({ position, component: children, order });

    // Remove control when unmounted
    return () => {
      removeControl({ position, component: children, order });
    };
  }, []);

  // Render the children directly
  return <></>;
}
