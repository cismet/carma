import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addAnnotationLabelTextHistoryEntry,
  mergeAnnotationLabelTextSuggestions,
  resolveAnnotationLabelTextRequest,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationNodeLinkId,
  CesiumGeographicCoordinate,
} from "../store";

type PendingAnnotationLabelTextRequest = {
  initialValue: string;
  labelSuggestions: readonly string[];
};

export type AnnotationLabelTextRequestContext = {
  coordinate: CesiumGeographicCoordinate;
  defaultText: string;
  labelTextSuggestions: readonly string[];
  linkedNodeGroupId?: AnnotationNodeLinkId | null;
};

export type AnnotationLabelTextRequester = (
  context: AnnotationLabelTextRequestContext
) => string | null | Promise<string | null>;

export type AnnotationLabelTextDialogState = {
  open: boolean;
  initialValue: string;
  labelSuggestions: readonly string[];
  onAbort: () => void;
  onFinish: (text: string) => void;
};

export type UseAnnotationLabelTextRequestOptions = {
  enabled?: boolean;
};

export type AnnotationLabelTextRequestState = {
  labelTextDialogState: AnnotationLabelTextDialogState;
  requestLabelText: AnnotationLabelTextRequester;
};

export const useAnnotationLabelTextRequest = ({
  enabled = true,
}: UseAnnotationLabelTextRequestOptions = {}): AnnotationLabelTextRequestState => {
  const labelTextResolverRef = useRef<((text: string | null) => void) | null>(
    null
  );
  const labelTextHistoryRef = useRef<readonly string[]>([]);
  const [pendingLabelTextRequest, setPendingLabelTextRequest] =
    useState<PendingAnnotationLabelTextRequest | null>(null);
  const [labelTextHistory, setLabelTextHistory] = useState<readonly string[]>(
    []
  );

  const resolveLabelTextRequest = useCallback((text: string | null) => {
    const resolver = labelTextResolverRef.current;
    labelTextResolverRef.current = null;
    setPendingLabelTextRequest(null);

    if (text !== null) {
      const nextHistory = addAnnotationLabelTextHistoryEntry(
        labelTextHistoryRef.current,
        text
      );
      labelTextHistoryRef.current = nextHistory;
      setLabelTextHistory(nextHistory);
    }

    resolver?.(text);
  }, []);

  const requestLabelText = useCallback<AnnotationLabelTextRequester>(
    ({ defaultText, labelTextSuggestions }) =>
      new Promise((resolve) => {
        if (!enabled) {
          resolve(null);
          return;
        }

        labelTextResolverRef.current?.(null);
        labelTextResolverRef.current = resolve;
        setPendingLabelTextRequest(
          resolveAnnotationLabelTextRequest({
            defaultText,
            labelTextHistory: labelTextHistoryRef.current,
            labelTextSuggestions,
          })
        );
      }),
    [enabled]
  );

  useEffect(
    () => () => {
      labelTextResolverRef.current?.(null);
      labelTextResolverRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!enabled) {
      resolveLabelTextRequest(null);
    }
  }, [enabled, resolveLabelTextRequest]);

  const labelTextDialogState = useMemo<AnnotationLabelTextDialogState>(() => {
    if (!enabled || !pendingLabelTextRequest) {
      return {
        open: false,
        initialValue: "",
        labelSuggestions: [],
        onAbort: () => undefined,
        onFinish: () => undefined,
      };
    }

    return {
      open: true,
      initialValue: pendingLabelTextRequest.initialValue,
      labelSuggestions: mergeAnnotationLabelTextSuggestions(
        labelTextHistory,
        pendingLabelTextRequest.labelSuggestions
      ),
      onAbort: () => resolveLabelTextRequest(null),
      onFinish: resolveLabelTextRequest,
    };
  }, [
    enabled,
    labelTextHistory,
    pendingLabelTextRequest,
    resolveLabelTextRequest,
  ]);

  return useMemo(
    () => ({
      labelTextDialogState,
      requestLabelText,
    }),
    [labelTextDialogState, requestLabelText]
  );
};
