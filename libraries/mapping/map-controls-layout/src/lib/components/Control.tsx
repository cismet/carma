import { ReactNode, useEffect } from "react";
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
  const { addControl, removeControl } = useControlContext();

  useEffect(() => {
    addControl({ position, component: children, order });

    return () => {
      removeControl({ position, component: children, order });
    };
  }, [children]);

  return <></>;
}

export default Control;
