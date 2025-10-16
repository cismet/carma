import { ReactNode, useEffect, useState } from "react";
import { Leva } from "leva";

export const LevaProvider = ({ children }: { children: ReactNode }) => {
  const [isHidden, setIsHidden] = useState(true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        setIsHidden((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Leva collapsed hidden={isHidden} />
      {children}
    </>
  );
};
