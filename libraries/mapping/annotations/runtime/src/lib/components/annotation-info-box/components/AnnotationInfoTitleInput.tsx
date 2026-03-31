import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { capitalizeFirstLetter } from "@carma-commons/utils";
type AnnotationInfoTitleInputProps = {
  value: string;
  placeholder?: string;
  editable?: boolean;
  multiline?: boolean;
  autoFocusTrigger?: number | string;
  leadingBadgeText?: string;
  capitalize?: boolean;
  onChange?: (nextValue: string) => void;
  onCommit?: (nextValue: string) => void;
};

const normalizeTitle = (value: string): string => value.trim();

export const AnnotationInfoTitleInput = ({
  value,
  placeholder,
  editable = false,
  multiline = false,
  autoFocusTrigger,
  leadingBadgeText,
  capitalize = false,
  onChange,
  onCommit,
}: AnnotationInfoTitleInputProps) => {
  const [draftValue, setDraftValue] = useState(() => normalizeTitle(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedBadge = useMemo(
    () => (leadingBadgeText ?? "").trim(),
    [leadingBadgeText]
  );

  useEffect(() => {
    setDraftValue(normalizeTitle(value));
  }, [value]);

  useEffect(() => {
    if (!editable || autoFocusTrigger === undefined) return;
    const input = multiline ? textAreaRef.current : inputRef.current;
    if (!input) return;
    if (document.activeElement === input) return;
    input.focus();
    const length = input.value.length;
    input.setSelectionRange(length, length);
  }, [autoFocusTrigger, editable]);

  const formatDisplay = (text: string): string =>
    capitalize ? capitalizeFirstLetter(text) : text;

  const displayValue = draftValue.length > 0 ? draftValue : "";
  const fallbackText = placeholder ?? "";
  const finalDisplay = formatDisplay(displayValue || fallbackText);

  const handleCommit = (nextValue: string) => {
    const normalized = normalizeTitle(nextValue);
    setDraftValue(normalized);
    onCommit?.(normalized);
  };

  const handleMouseDown = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (multiline && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className="inline-flex items-center gap-1 min-w-0"
      onMouseDown={handleMouseDown}
      onClick={handleMouseDown}
    >
      {normalizedBadge.length > 0 ? (
        <span
          className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full border border-white/95 bg-[rgba(200,200,200,0.92)] text-[10px] font-semibold leading-none text-[#111111]"
          aria-hidden="true"
        >
          {normalizedBadge}
        </span>
      ) : null}
      {editable ? (
        multiline ? (
          <textarea
            ref={textAreaRef}
            value={draftValue}
            placeholder={placeholder}
            rows={1}
            className="text-[14px] min-h-[20px] min-w-[10px] mr-1 w-full resize-none rounded-[3px] bg-transparent focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff]"
            onMouseDown={handleMouseDown}
            onClick={handleMouseDown}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDraftValue(nextValue);
              onChange?.(nextValue);
            }}
            onBlur={(event) => handleCommit(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={draftValue}
            placeholder={placeholder}
            className="text-[14px] min-h-[20px] min-w-[10px] mr-1 w-full rounded-[3px] bg-transparent focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff]"
            onMouseDown={handleMouseDown}
            onClick={handleMouseDown}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDraftValue(nextValue);
              onChange?.(nextValue);
            }}
            onBlur={(event) => handleCommit(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        )
      ) : (
        <span className="text-[14px] mr-1 whitespace-pre-wrap">
          {finalDisplay}
        </span>
      )}
    </div>
  );
};
