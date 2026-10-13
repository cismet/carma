import { useCallback, useEffect, useRef, useState } from "react";

import type { AnnotationDeleteConfirmationRequester } from "@carma-mapping/annotations/runtime";

import { MeasurementDeleteConfirmationModal } from "../components/annotations/MeasurementDeleteConfirmationModal";

type PendingAnnotationDeleteConfirmation = {
  annotationCount: number;
};

/** The requester asking before measurements go, and the modal it needs rendered. */
export const useGeoportalAnnotationDeleteConfirmation = () => {
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingAnnotationDeleteConfirmation | null>(null);

  const closeConfirmation = useCallback((confirmed: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setPendingConfirmation(null);
    resolver?.(confirmed);
  }, []);

  const confirmAnnotationDelete =
    useCallback<AnnotationDeleteConfirmationRequester>(({ annotations }) => {
      if (annotations.length === 0) {
        return false;
      }

      if (resolverRef.current) {
        return false;
      }

      return new Promise((resolve) => {
        resolverRef.current = resolve;
        setPendingConfirmation({
          annotationCount: annotations.length,
        });
      });
    }, []);

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    []
  );

  const deleteConfirmationModal = (
    <MeasurementDeleteConfirmationModal
      show={pendingConfirmation !== null}
      count={pendingConfirmation?.annotationCount ?? 0}
      onConfirm={() => closeConfirmation(true)}
      onCancel={() => closeConfirmation(false)}
    />
  );

  return {
    confirmAnnotationDelete,
    deleteConfirmationModal,
  };
};
