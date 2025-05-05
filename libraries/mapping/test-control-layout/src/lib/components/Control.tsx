import { ReactNode, useEffect } from "react";
import { useControlContext } from "./ControlProvider";

interface ControlProps {
  children: ReactNode;
}

export function Control({ children }: ControlProps) {
  const { addControl, removeControl } = useControlContext();

  useEffect(() => {
    // Add this control component when mounted
    addControl(children);

    // Remove control when unmounted
    return () => {
      removeControl(children);
    };
  }, []);

  // Render the children directly
  return <>{children}</>;
}
