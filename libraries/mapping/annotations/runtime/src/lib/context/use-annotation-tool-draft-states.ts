import { useEffect, useMemo, useReducer } from "react";
import type { AnnotationToolType } from "@carma-mapping/annotations/core";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
} from "../tools/annotation-tool-plugin.types";

type UseAnnotationToolDraftStatesArgs = {
  draftStore: AnnotationToolDraftStore;
  toolTypes: readonly AnnotationToolType[];
};

export const useAnnotationToolDraftStates = ({
  draftStore,
  toolTypes,
}: UseAnnotationToolDraftStatesArgs): Readonly<
  Partial<Record<AnnotationToolType, AnnotationToolDraftState>>
> => {
  const [version, bumpVersion] = useReducer((current: number) => current + 1, 0);

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
            draft.coordinates.length > 0 || draft.linkedNodeGroupIds.length > 0;

          return hasDraftContent ? ([[toolType, draft]] as const) : [];
        })
      ) as Partial<Record<AnnotationToolType, AnnotationToolDraftState>>,
    [draftStore, toolTypes, version]
  );
};
