import { ReactNode, useEffect } from "react";
import { useControlContext } from "./ControlProvider";

interface MainProps {
  children: ReactNode;
}

export function Main({ children }: MainProps) {
  const { setMain } = useControlContext();

  useEffect(() => {
    // Set this as the main component when mounted
    setMain(children);

    // Clear main component when unmounted
    return () => {
      setMain(null);
    };
    // Note: We intentionally omit children from dependencies to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMain]);

  // Render the children directly
  return <>{children}</>;
}
