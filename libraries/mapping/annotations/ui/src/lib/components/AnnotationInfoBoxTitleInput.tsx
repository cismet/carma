import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";

export type AnnotationInfoBoxTitleInputProps = {
  value: string;
  placeholder: string;
  onCommit: (nextValue: string) => void;
  readOnly?: boolean;
  shortLabelValue?: string;
  shortLabelPlaceholder?: string;
  onShortLabelCommit?: (nextValue: string) => void;
  visualOptions?: AnnotationInfoBoxVisualOptions;
};

const normalizeTitle = (value: string): string => value.trim();

const annotationInfoBoxTitleInputDefaults = Object.freeze({
  borderRadiusRem: "0.2143rem", // 3 / 14
  shortLabelMaxLength: 64,
  shortLabelWidthPaddingCh: 0.5,
  shortLabelMinWidthCh: 2.5,
});

const normalizeShortLabel = (value: string): string =>
  normalizeTitle(value).slice(
    0,
    annotationInfoBoxTitleInputDefaults.shortLabelMaxLength
  );

const limitShortLabelDraft = (value: string): string =>
  value.slice(0, annotationInfoBoxTitleInputDefaults.shortLabelMaxLength);

export const AnnotationInfoBoxTitleInput = ({
  value,
  placeholder,
  onCommit,
  readOnly = false,
  shortLabelValue,
  shortLabelPlaceholder,
  onShortLabelCommit,
  visualOptions,
}: AnnotationInfoBoxTitleInputProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const [draftValue, setDraftValue] = useState(() => normalizeTitle(value));
  const [draftShortLabelValue, setDraftShortLabelValue] = useState(() =>
    normalizeShortLabel(shortLabelValue ?? "")
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shortLabelInputRef = useRef<HTMLInputElement | null>(null);
  const shortLabelMaxWidthCh =
    annotationInfoBoxTitleInputDefaults.shortLabelMaxLength +
    annotationInfoBoxTitleInputDefaults.shortLabelWidthPaddingCh;
  const shortLabelWidthCh = Math.min(
    Math.max(
      normalizeTitle(draftShortLabelValue || shortLabelPlaceholder || "")
        .length + annotationInfoBoxTitleInputDefaults.shortLabelWidthPaddingCh,
      annotationInfoBoxTitleInputDefaults.shortLabelMinWidthCh
    ),
    shortLabelMaxWidthCh
  );

  useEffect(() => {
    setDraftValue(normalizeTitle(value));
  }, [value]);

  useEffect(() => {
    setDraftShortLabelValue(normalizeShortLabel(shortLabelValue ?? ""));
  }, [shortLabelValue]);

  const commitValue = (nextValue: string) => {
    if (readOnly) {
      setDraftValue(normalizeTitle(value));
      return;
    }

    const normalizedValue = normalizeTitle(nextValue);
    setDraftValue(normalizedValue);
    onCommit(normalizedValue);
  };

  const commitShortLabelValue = (nextValue: string) => {
    if (!onShortLabelCommit || readOnly) {
      setDraftShortLabelValue(normalizeShortLabel(shortLabelValue ?? ""));
      return;
    }

    const normalizedValue = normalizeShortLabel(nextValue);
    if (!normalizedValue) {
      const fallbackValue = normalizeShortLabel(shortLabelValue ?? "");
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

  const titleInputStyle = {
    ...resolvedVisualOptions.titleTextStyle,
    flex: "0 1 auto",
    minWidth: "1ch",
    maxWidth: "100%",
    fieldSizing: "content",
  } as CSSProperties;

  const shortLabelInputStyle = {
    ...resolvedVisualOptions.titleTextStyle,
    borderRadius: annotationInfoBoxTitleInputDefaults.borderRadiusRem,
    flex: "0 1 auto",
    width: `${shortLabelWidthCh}ch`,
    minWidth: `${annotationInfoBoxTitleInputDefaults.shortLabelMinWidthCh}ch`,
    maxWidth: `min(${shortLabelMaxWidthCh}ch, 100%)`,
    fieldSizing: "content",
  } as CSSProperties;

  return (
    <div
      className="inline-flex min-w-0 max-w-full flex-1 items-center"
      style={{ columnGap: "0.35em" }}
      onMouseDown={stopPointerPropagation}
      onClick={stopPointerPropagation}
    >
      <input
        ref={inputRef}
        type="text"
        value={draftValue}
        placeholder={placeholder}
        readOnly={readOnly}
        aria-readonly={readOnly}
        className={resolvedVisualOptions.titleInputClassName}
        style={titleInputStyle}
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
          readOnly={readOnly}
          aria-readonly={readOnly}
          maxLength={annotationInfoBoxTitleInputDefaults.shortLabelMaxLength}
          className={resolvedVisualOptions.shortLabelInputClassName}
          style={shortLabelInputStyle}
          onMouseDown={stopPointerPropagation}
          onClick={stopPointerPropagation}
          onChange={(event) =>
            setDraftShortLabelValue(limitShortLabelDraft(event.target.value))
          }
          onBlur={(event) => commitShortLabelValue(event.target.value)}
          onKeyDown={handleShortLabelKeyDown}
        />
      ) : null}
    </div>
  );
};
