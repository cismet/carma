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
  /** The stored set this provider persists to; a shared set is taken once per key. */
  consumerKey: string;
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
  consumerKey,
  confirmConflicts,
}: SharedAnnotationsImportProps) => {
  const { appendAnnotationsRuntimePersistenceState, buildAllAnnotationsGeoJson } =
    useAnnotationsRuntime();
  const confirmRef = useRef(confirmConflicts);
  confirmRef.current = confirmConflicts;
  useEffect(() => {
    // A child's effect runs before the provider's own: importing right away
    // would change the store before its persistence and visual subscriptions
    // exist, and the measurements would neither draw nor save. One tick later
    // every subscription is in place.
    const timers = new Set<number>();
    const unsubscribe = subscribeSharedAnnotations(({ token, state }) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!consumeSharedAnnotations(token, consumerKey)) return;
        const local = resolveAnnotationsRuntimePersistenceFromGeoJson(
          buildAllAnnotationsGeoJson()
        );
        const merge = resolveSharedAnnotationsMerge(state, local);
        console.info(
          `[ANNOTATIONS] shared set taken into ${consumerKey}: ${merge.additions.tables.annotationEntries.length} new, ${merge.unchangedCount} unchanged, ${merge.conflictPairs.length} in conflict`
        );
        if (merge.additions.tables.annotationEntries.length > 0) {
          const appended = appendAnnotationsRuntimePersistenceState(
            merge.additions,
            { skipExisting: true }
          );
          console.info(`[ANNOTATIONS] appended ${appended.length} shared measurements`);
        }
        if (merge.conflictPairs.length === 0) return;
        void confirmRef.current(merge.conflictPairs).then((decision) => {
          if (decision !== "update") return;
          appendAnnotationsRuntimePersistenceState(merge.conflicts, {
            replaceExisting: true,
          });
        });
      }, 0);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [appendAnnotationsRuntimePersistenceState, buildAllAnnotationsGeoJson, consumerKey]);
  return null;
};
