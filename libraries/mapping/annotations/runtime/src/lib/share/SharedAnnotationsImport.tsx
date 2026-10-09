import { useEffect, useRef } from "react";

import { useAnnotationsRuntime } from "../context/AnnotationsProvider";
import {
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  resolveSharedAnnotationsMerge,
  type SharedAnnotationsConflict,
} from "../store/persistence/annotations-store-persistence";
import {
  consumeSharedAnnotations,
  subscribeSharedAnnotations,
} from "./pending-shared-annotations";

export type SharedAnnotationsConflictDecision = "update" | "discard";

export type SharedAnnotationsImportProps = {
  /**
   * Asked once per shared set that changes measurements the local set also
   * holds: "update" replaces the local ones, "discard" keeps them.
   */
  confirmConflicts: (
    conflicts: readonly SharedAnnotationsConflict[]
  ) => Promise<SharedAnnotationsConflictDecision>;
};

/**
 * Takes the measurements of a shared configuration into this runtime: new
 * ones join at once, unchanged ones are left alone, changed ones go to the
 * host's confirmation. Mount it inside the provider of the engine on screen.
 */
export const SharedAnnotationsImport = ({
  confirmConflicts,
}: SharedAnnotationsImportProps) => {
  const { appendAnnotationsRuntimePersistenceState, buildAllAnnotationsGeoJson } =
    useAnnotationsRuntime();
  const confirmRef = useRef(confirmConflicts);
  confirmRef.current = confirmConflicts;
  useEffect(
    () =>
      subscribeSharedAnnotations(({ token, state }) => {
        if (!consumeSharedAnnotations(token)) return;
        const local = resolveAnnotationsRuntimePersistenceFromGeoJson(
          buildAllAnnotationsGeoJson()
        );
        const merge = resolveSharedAnnotationsMerge(state, local);
        if (merge.additions.tables.annotationEntries.length > 0) {
          appendAnnotationsRuntimePersistenceState(merge.additions, {
            skipExisting: true,
          });
        }
        if (merge.conflictPairs.length === 0) return;
        void confirmRef.current(merge.conflictPairs).then((decision) => {
          if (decision !== "update") return;
          appendAnnotationsRuntimePersistenceState(merge.conflicts, {
            replaceExisting: true,
          });
        });
      }),
    [appendAnnotationsRuntimePersistenceState, buildAllAnnotationsGeoJson]
  );
  return null;
};
