import { useEffect } from "react";
import type { ViewStateNavigationEvent } from "../../../core/types";
import { useViewStateNavigationContext } from "./useViewStateNavigationContext";

export const useOnViewStateNavigationEvent = (
  listener: (event: ViewStateNavigationEvent) => void
) => {
  const { registerOnNavigationEvent } = useViewStateNavigationContext();

  useEffect(
    () => registerOnNavigationEvent(listener),
    [listener, registerOnNavigationEvent]
  );
};
