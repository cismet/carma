import { useEffect } from "react";
import {
  selectAuthoringAnnotationEntries,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMeasurement3dActions } from "./measurement3d-state";

/**
 * Reports what the runtime holds to the addon: the authored measurements go
 * into the channel's count, whether a saved set (read-only external entries)
 * is shown goes to `onSavedSetPresence`.
 */
export const Measurement3dEntriesSync = ({
  onSavedSetPresence,
}: {
  onSavedSetPresence: (present: boolean) => void;
}) => {
  const { annotationEntries } = useAnnotationsRuntime();
  const { setCount } = useMeasurement3dActions();
  const count = selectAuthoringAnnotationEntries({ annotationEntries }).length;
  const savedSetPresent = annotationEntries.some(
    (entry) => entry.externalCollection !== undefined && !entry.hidden
  );
  useEffect(() => {
    setCount(count);
  }, [count, setCount]);
  useEffect(() => {
    onSavedSetPresence(savedSetPresent);
  }, [onSavedSetPresence, savedSetPresent]);
  return null;
};
