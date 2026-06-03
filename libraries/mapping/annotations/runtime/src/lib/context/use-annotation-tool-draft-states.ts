import { useEffect, useMemo, useReducer } from "react";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
} from "../registry";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";

type UseAnnotationToolDraftStatesArgs = {
  draftStore: AnnotationToolDraftStore;
  toolTypes: readonly AnnotationToolId[];
};

export const useAnnotationToolDraftStates = ({
  draftStore,
  toolTypes,
}: UseAnnotationToolDraftStatesArgs): Readonly<
  Partial<Record<AnnotationToolId, AnnotationToolDraftState>>
> => {
  const [version, bumpVersion] = useReducer(
    (current: number) => current + 1,
    0
  );

  useEffect(() => {
    const unsubscribeCallbacks = toolTypes.map((toolType) =>
      draftStore.subscribe(toolType, bumpVersion)
    );

    return () => {
      unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    };
  }, [draftStore, toolTypes]);

  return useMemo(
    () =>
      Object.fromEntries(
        toolTypes.flatMap((toolType) => {
          const draft = draftStore.get(toolType);
          const hasDraftContent =
            draft.coordinates.length > 0 ||
            draft.linkedNodeGroupIds.length > 0 ||
            Boolean(draft.feedback);

          return hasDraftContent ? ([[toolType, draft]] as const) : [];
        })
      ) as Partial<Record<AnnotationToolId, AnnotationToolDraftState>>,
    [draftStore, toolTypes, version]
  );
};
