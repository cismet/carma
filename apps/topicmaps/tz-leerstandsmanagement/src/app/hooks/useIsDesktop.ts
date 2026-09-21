import { useEffect, useState } from "react";

/** from this viewport on the capture wizard opens as a regular modal, below it full screen */
const DESKTOP_QUERY = "(min-width: 640px) and (min-height: 620px)";

export const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
};
