import { ReactNode, useEffect } from "react";
import { Positions, useControlContext } from "./ControlProvider";

interface ControlProps {
  position: Positions;
  children: ReactNode;
}

export function Control({ position, children }: ControlProps) {
  const { addControl, removeControl } = useControlContext();

  useEffect(() => {
    // Add this control component when mounted
    addControl({ position, component: children });

    // Remove control when unmounted
    return () => {
      removeControl({ position, component: children });
    };
  }, []);

  // Render the children directly
  return <>{children}</>;
}
