import { useCallback, type Dispatch, type SetStateAction } from "react";

type UsePointAnnotationCreatedHandlersParams = {
  selectAnnotationByIdImmediate: (id: string | null) => void;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  setDoubleClickChainSourcePointId: Dispatch<SetStateAction<string | null>>;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
};

export const usePointAnnotationCreatedHandlers = ({
  selectAnnotationByIdImmediate,
  setActiveNodeChainAnnotationId,
  setDoubleClickChainSourcePointId,
  setLabelInputPromptPointId,
}: UsePointAnnotationCreatedHandlersParams) => {
  const handlePointAnnotationCreated = useCallback(
    (newPointId: string) => {
      setDoubleClickChainSourcePointId(null);
      setActiveNodeChainAnnotationId(null);
      selectAnnotationByIdImmediate(newPointId);
    },
    [
      selectAnnotationByIdImmediate,
      setActiveNodeChainAnnotationId,
      setDoubleClickChainSourcePointId,
    ]
  );

  const handleLabelAnnotationCreated = useCallback(
    (newPointId: string) => {
      setDoubleClickChainSourcePointId(null);
      setActiveNodeChainAnnotationId(null);
      setLabelInputPromptPointId(newPointId);
      selectAnnotationByIdImmediate(newPointId);
    },
    [
      selectAnnotationByIdImmediate,
      setActiveNodeChainAnnotationId,
      setDoubleClickChainSourcePointId,
      setLabelInputPromptPointId,
    ]
  );

  return {
    handlePointAnnotationCreated,
    handleLabelAnnotationCreated,
  };
};
