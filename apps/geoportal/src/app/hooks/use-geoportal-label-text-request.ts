import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LabelToolTextRequester } from "@carma-mapping/annotations/builtin-tools";
import {
  addAnnotationLabelTextHistoryEntry,
  mergeAnnotationLabelTextSuggestions,
  resolveAnnotationLabelTextRequest,
} from "@carma-mapping/annotations/core";

type PendingLabelTextRequest = {
  initialValue: string;
  labelSuggestions: readonly string[];
};

export type GeoportalLabelTextModalState = {
  open: boolean;
  initialValue: string;
  labelSuggestions: readonly string[];
  onAbort: () => void;
  onFinish: (text: string) => void;
};

export type UseGeoportalLabelTextRequestOptions = {
  enabled?: boolean;
};

export const useGeoportalLabelTextRequest = ({
  enabled = true,
}: UseGeoportalLabelTextRequestOptions = {}): {
  labelTextModalState: GeoportalLabelTextModalState;
  requestLabelText: LabelToolTextRequester;
} => {
  const labelTextResolverRef = useRef<((text: string | null) => void) | null>(
    null
  );
  const labelTextHistoryRef = useRef<readonly string[]>([]);
  const [pendingLabelTextRequest, setPendingLabelTextRequest] =
    useState<PendingLabelTextRequest | null>(null);
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

  const requestLabelText = useCallback<LabelToolTextRequester>(
    ({ defaultText, labelTextSuggestions }) =>
      new Promise((resolve) => {
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
    []
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

  const labelTextModalState = useMemo<GeoportalLabelTextModalState>(() => {
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

  return {
    labelTextModalState,
    requestLabelText,
  };
};
