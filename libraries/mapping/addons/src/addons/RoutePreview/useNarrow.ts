import { useEffect, useState } from "react";

const NARROW_QUERY = "(max-width: 639px)";

/** below Tailwind's `sm`, where the picker turns into a row as well */
export const useNarrow = () => {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(NARROW_QUERY).matches
  );
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return narrow;
};
