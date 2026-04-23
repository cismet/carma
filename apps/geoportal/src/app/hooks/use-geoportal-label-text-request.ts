import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LabelToolTextRequester } from "@carma-mapping/annotations/builtin-tools";
import {
  addAnnotationLabelTextHistoryEntry,
  resolveNextAnnotationLabelText,
} from "@carma-mapping/annotations/core";

type PendingLabelTextRequest = {
  initialValue: string;
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
    ({ defaultText }) =>
      new Promise((resolve) => {
        labelTextResolverRef.current?.(null);
        labelTextResolverRef.current = resolve;
        setPendingLabelTextRequest({
          initialValue: resolveNextAnnotationLabelText(
            labelTextHistoryRef.current[0],
            defaultText
          ),
        });
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

  const labelTextModalState = useMemo<GeoportalLabelTextModalState>(
    () => ({
      open: pendingLabelTextRequest !== null,
      initialValue: pendingLabelTextRequest?.initialValue ?? "",
      labelSuggestions: labelTextHistory,
      onAbort: () => resolveLabelTextRequest(null),
      onFinish: resolveLabelTextRequest,
    }),
    [labelTextHistory, pendingLabelTextRequest, resolveLabelTextRequest]
  );

  return {
    labelTextModalState,
    requestLabelText,
  };
};
