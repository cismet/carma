import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { CARMA_CARD_BORDER_RADIUS_CSS } from "@carma-commons/ui/components";
import {
  resolveRuntimeAnnotationInfoBoxVisualOptions,
  type RuntimeAnnotationInfoBoxVisualOptions,
} from "./annotationInfoBoxVisualDefaults";

type RuntimeAnnotationInfoBoxTitleInputProps = {
  value: string;
  placeholder: string;
  onCommit: (nextValue: string) => void;
  shortLabelValue?: string;
  shortLabelPlaceholder?: string;
  onShortLabelCommit?: (nextValue: string) => void;
  visualOptions?: RuntimeAnnotationInfoBoxVisualOptions;
};

const normalizeTitle = (value: string): string => value.trim();

export const RuntimeAnnotationInfoBoxTitleInput = ({
  value,
  placeholder,
  onCommit,
  shortLabelValue,
  shortLabelPlaceholder,
  onShortLabelCommit,
  visualOptions,
}: RuntimeAnnotationInfoBoxTitleInputProps) => {
  const resolvedVisualOptions =
    resolveRuntimeAnnotationInfoBoxVisualOptions(visualOptions);
  const [draftValue, setDraftValue] = useState(() => normalizeTitle(value));
  const [draftShortLabelValue, setDraftShortLabelValue] = useState(() =>
    normalizeTitle(shortLabelValue ?? "")
  );
  const [titleWidthPx, setTitleWidthPx] = useState<number | null>(null);
  const [shortLabelWidthPx, setShortLabelWidthPx] = useState<number | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shortLabelInputRef = useRef<HTMLInputElement | null>(null);
  const titleMeasureRef = useRef<HTMLSpanElement | null>(null);
  const shortLabelMeasureRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setDraftValue(normalizeTitle(value));
  }, [value]);

  useEffect(() => {
    setDraftShortLabelValue(normalizeTitle(shortLabelValue ?? ""));
  }, [shortLabelValue]);

  useLayoutEffect(() => {
    const titleMeasureElement = titleMeasureRef.current;
    if (titleMeasureElement) {
      const measuredTitleWidth = Math.ceil(
        titleMeasureElement.getBoundingClientRect().width
      );
      setTitleWidthPx(measuredTitleWidth);
    }

    const measureElement = shortLabelMeasureRef.current;
    if (!measureElement) {
      return;
    }

    const measuredWidth = Math.ceil(
      measureElement.getBoundingClientRect().width
    );
    setShortLabelWidthPx(measuredWidth);
  }, [
    draftShortLabelValue,
    shortLabelPlaceholder,
    draftValue,
    placeholder,
    resolvedVisualOptions,
  ]);

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
      className="inline-flex max-w-full items-center gap-1"
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
          width: titleWidthPx === null ? undefined : `${titleWidthPx}px`,
          minWidth: "1em",
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
            borderRadius: CARMA_CARD_BORDER_RADIUS_CSS,
            width:
              shortLabelWidthPx === null ? undefined : `${shortLabelWidthPx}px`,
            maxWidth: "100%",
          }}
          onMouseDown={stopPointerPropagation}
          onClick={stopPointerPropagation}
          onChange={(event) => setDraftShortLabelValue(event.target.value)}
          onBlur={(event) => commitShortLabelValue(event.target.value)}
          onKeyDown={handleShortLabelKeyDown}
        />
      ) : null}
      <span
        ref={titleMeasureRef}
        aria-hidden="true"
        className={`${resolvedVisualOptions.titleInputClassName} pointer-events-none absolute invisible w-max whitespace-pre`}
      >
        {draftValue || placeholder || " "}
      </span>
      {onShortLabelCommit ? (
        <span
          ref={shortLabelMeasureRef}
          aria-hidden="true"
          className={`${resolvedVisualOptions.shortLabelInputClassName} pointer-events-none absolute invisible w-max whitespace-pre`}
        >
          {draftShortLabelValue || shortLabelPlaceholder || ""}
        </span>
      ) : null}
    </div>
  );
};
