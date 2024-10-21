import { useEffect, useRef } from "react";
import { getGazData } from "../helper/helper";

export const useGazDataRef = () => {
  const gazDataRef = useRef([]);

  useEffect(() => {
    getGazData((data: unknown[]) => (gazDataRef.current = data));
  }, []);

  return gazDataRef;
};
