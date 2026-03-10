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
    // Control registration must stay mount-scoped; re-registering on every
    // render (new ReactNode identity) causes control layout update loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <></>;
}

export default Control;
