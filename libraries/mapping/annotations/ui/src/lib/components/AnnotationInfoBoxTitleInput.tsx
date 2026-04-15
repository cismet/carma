import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";

type AnnotationInfoBoxTitleInputProps = {
  value: string;
  placeholder: string;
  onCommit: (nextValue: string) => void;
  shortLabelValue?: string;
  shortLabelPlaceholder?: string;
  onShortLabelCommit?: (nextValue: string) => void;
  visualOptions?: AnnotationInfoBoxVisualOptions;
};

const normalizeTitle = (value: string): string => value.trim();

const annotationInfoBoxTitleInputDefaults = Object.freeze({
  borderRadiusRem: "0.2143rem", // 3 / 14
});

export const AnnotationInfoBoxTitleInput = ({
  value,
  placeholder,
  onCommit,
  shortLabelValue,
  shortLabelPlaceholder,
  onShortLabelCommit,
  visualOptions,
}: AnnotationInfoBoxTitleInputProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const [draftValue, setDraftValue] = useState(() => normalizeTitle(value));
  const [draftShortLabelValue, setDraftShortLabelValue] = useState(() =>
    normalizeTitle(shortLabelValue ?? "")
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shortLabelInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftValue(normalizeTitle(value));
  }, [value]);

  useEffect(() => {
    setDraftShortLabelValue(normalizeTitle(shortLabelValue ?? ""));
  }, [shortLabelValue]);

  const commitValue = (nextValue: string) => {
    const normalizedValue = normalizeTitle(nextValue);
    setDraftValue(normalizedValue);
    onCommit(normalizedValue);
  };

  const commitShortLabelValue = (nextValue: string) => {
    if (!onShortLabelCommit) {
      return;
    }

    const normalizedValue = normalizeTitle(nextValue);
    if (!normalizedValue) {
      const fallbackValue = normalizeTitle(shortLabelValue ?? "");
      setDraftShortLabelValue(fallbackValue);
      return;
    }

    setDraftShortLabelValue(normalizedValue);
    onShortLabelCommit(normalizedValue);
  };

  const stopPointerPropagation = (
    event: MouseEvent<HTMLInputElement | HTMLDivElement>
  ) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    inputRef.current?.blur();
  };

  const handleShortLabelKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    shortLabelInputRef.current?.blur();
  };

  return (
    <div
      className="inline-flex min-w-0 max-w-full items-center gap-1"
      onMouseDown={stopPointerPropagation}
      onClick={stopPointerPropagation}
    >
      <input
        ref={inputRef}
        type="text"
        value={draftValue}
        placeholder={placeholder}
        className={resolvedVisualOptions.titleInputClassName}
        style={{
          ...resolvedVisualOptions.titleTextStyle,
          flex: "0 1 auto",
          minWidth: "1ch",
          maxWidth: "100%",
        }}
        onMouseDown={stopPointerPropagation}
        onClick={stopPointerPropagation}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={(event) => commitValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {onShortLabelCommit ? (
        <input
          ref={shortLabelInputRef}
          type="text"
          value={draftShortLabelValue}
          placeholder={shortLabelPlaceholder}
          className={resolvedVisualOptions.shortLabelInputClassName}
          style={{
            ...resolvedVisualOptions.titleTextStyle,
            borderRadius: annotationInfoBoxTitleInputDefaults.borderRadiusRem,
            flex: "0 1 auto",
            minWidth: "1ch",
          }}
          onMouseDown={stopPointerPropagation}
          onClick={stopPointerPropagation}
          onChange={(event) => setDraftShortLabelValue(event.target.value)}
          onBlur={(event) => commitShortLabelValue(event.target.value)}
          onKeyDown={handleShortLabelKeyDown}
        />
      ) : null}
    </div>
  );
};
