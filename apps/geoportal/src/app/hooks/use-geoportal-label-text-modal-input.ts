import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { InputRef } from "antd";

export type UseGeoportalLabelTextModalInputOptions = {
  initialValue: string;
  labelSuggestions: readonly string[];
  onAbort: () => void;
  onFinish: (text: string) => void;
  open: boolean;
};

export const resolveFinishedLabelText = (
  value: string,
  fallbackText: string
): string => value.trim() || fallbackText;

export const resolveVisibleLabelTextSuggestions = ({
  labelSuggestions,
  value,
}: {
  labelSuggestions: readonly string[];
  value: string;
}): readonly string[] =>
  labelSuggestions.filter((suggestion) => suggestion !== value.trim());

export const useGeoportalLabelTextModalInput = ({
  initialValue,
  labelSuggestions,
  onAbort,
  onFinish,
  open,
}: UseGeoportalLabelTextModalInputOptions) => {
  const inputRef = useRef<InputRef>(null);
  const [value, setValue] = useState(initialValue);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ cursor: "all" });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValue(initialValue);
    const frameId = window.requestAnimationFrame(focusInput);

    return () => window.cancelAnimationFrame(frameId);
  }, [focusInput, initialValue, open]);

  const finish = useCallback(() => {
    onFinish(resolveFinishedLabelText(value, initialValue));
  }, [initialValue, onFinish, value]);

  const handlePressEnter = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    },
    [finish]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        onAbort();
      }
    },
    [onAbort]
  );

  const handleSuggestionMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
    },
    []
  );

  const selectSuggestion = useCallback(
    (suggestion: string) => {
      setValue(suggestion);
      window.requestAnimationFrame(focusInput);
    },
    [focusInput]
  );

  const visibleSuggestions = useMemo(
    () => resolveVisibleLabelTextSuggestions({ labelSuggestions, value }),
    [labelSuggestions, value]
  );

  return {
    finish,
    focusInput,
    handleKeyDown,
    handlePressEnter,
    handleSuggestionMouseDown,
    inputRef,
    selectSuggestion,
    setValue,
    value,
    visibleSuggestions,
  };
};
