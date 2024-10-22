import { useEffect, useRef } from "react";
import { getGazData } from "../helper/helper";

export const useGazDataRef = () => {
  const gazDataRef = useRef([]);
  console.debug("HOOK: gazDataRef");

  useEffect(() => {
    getGazData((data: unknown[]) => (gazDataRef.current = data));
  }, []);

  return gazDataRef;
};
