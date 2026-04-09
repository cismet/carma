import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
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
      className="flex items-center gap-2"
      onMouseDown={stopPointerPropagation}
      onClick={stopPointerPropagation}
    >
      <input
        ref={inputRef}
        type="text"
        value={draftValue}
        placeholder={placeholder}
        className={resolvedVisualOptions.titleInputClassName}
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
          style={{ width: `${resolvedVisualOptions.shortLabelInputWidthPx}px` }}
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
