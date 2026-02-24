import { useState, useEffect, useRef } from "react";
import { MeasurementTitleProps } from "../..";
import { capitalizeFirstLetter, trimLines } from "@carma-commons/utils";

const MeasurementTitle = ({
  title,
  shapeId,
  order,
  updateTitleMeasurementById,
  setUpdateMeasurementStatus,
  isCollapsed,
  collapsedContent,
  editable = false,
  placeholderText,
  clearPlaceholderOnFocus = false,
  showOrder = true,
  capitalize = true,
  multiline = false,
  autoFocusTrigger,
  leadingBadgeText,
}: MeasurementTitleProps) => {
  const focusCaretAtEndOnFocus = true;
  const clearAllOnBackspaceWhenPrefilled = true;
  const normalizedTitle = title.trim();
  const [content, setContent] = useState(normalizedTitle);
  const [oldContent, setOldContent] = useState(normalizedTitle);
  const [lastSavedLabel, setLastSavedLabel] = useState(normalizedTitle);
  const [isShowingPlaceholder, setIsShowingPlaceholder] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editableTitleRef = useRef<HTMLSpanElement>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (isEditingRef.current) return;
    setContent(normalizedTitle);
    setOldContent(normalizedTitle);
    if (normalizedTitle.length > 0) {
      setLastSavedLabel(normalizedTitle);
    }
  }, [normalizedTitle]);

  useEffect(() => {
    if (!editable || autoFocusTrigger === undefined) return;
    const editableTitleElement = editableTitleRef.current;
    if (!editableTitleElement) return;

    if (document.activeElement === editableTitleElement) return;

    editableTitleElement.focus();

    scheduleCaretToEnd(editableTitleElement);
  }, [autoFocusTrigger, editable]);

  const effectivePlaceholder = lastSavedLabel || placeholderText || "";
  const displayText = content || effectivePlaceholder;
  const hasPlaceholder = Boolean(effectivePlaceholder);
  const normalizedLeadingBadgeText = leadingBadgeText?.trim() ?? "";
  const hasLeadingBadge = normalizedLeadingBadgeText.length > 0;
  const formatText = (text: string) =>
    capitalize ? capitalizeFirstLetter(text) : text;

  const moveCaretToEnd = (element: HTMLElement) => {
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const scheduleCaretToEnd = (element: HTMLElement) => {
    requestAnimationFrame(() => {
      moveCaretToEnd(element);
    });
  };

  const getContent = multiline
    ? (el: HTMLElement) => trimLines(el.innerText)
    : (el: HTMLElement) => el.textContent?.trim() || "";

  const setDomContent = multiline
    ? (el: HTMLElement, text: string) => {
        el.innerText = text;
      }
    : (el: HTMLElement, text: string) => {
        el.textContent = formatText(text);
      };

  useEffect(() => {
    if (!editable || isEditing) return;
    const editableTitleElement = editableTitleRef.current;
    if (!editableTitleElement) return;
    setDomContent(editableTitleElement, displayText);
  }, [displayText, editable, isEditing, multiline]);

  return (
    <div className="inline-flex items-center gap-1 min-w-0">
      {hasLeadingBadge && (
        <span
          className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full border border-white/95 bg-[rgba(200,200,200,0.92)] text-[10px] font-semibold leading-none text-[#111111]"
          aria-hidden="true"
        >
          {normalizedLeadingBadgeText}
        </span>
      )}
      {editable ? (
        <span
          ref={editableTitleRef}
          onBlur={(t) => {
            isEditingRef.current = false;
            setIsEditing(false);
            const newContent = getContent(t.currentTarget);
            setIsShowingPlaceholder(false);

            if (newContent.length === 0) {
              if (hasPlaceholder) {
                setContent("");
                setDomContent(t.currentTarget, effectivePlaceholder);
                updateTitleMeasurementById(shapeId, "");
                setUpdateMeasurementStatus(true);
                return;
              }

              setContent(oldContent);
              setDomContent(t.currentTarget, oldContent);
              return;
            }

            setContent(newContent);
            setOldContent(newContent);
            setLastSavedLabel(newContent);
            updateTitleMeasurementById(shapeId, newContent);
            setUpdateMeasurementStatus(true);
          }}
          onInput={(e) => {
            const liveContent = getContent(e.currentTarget);
            setIsShowingPlaceholder(false);
            updateTitleMeasurementById(shapeId, liveContent);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
              return;
            }
            if (e.key === "Backspace" && clearAllOnBackspaceWhenPrefilled) {
              const currentText = getContent(e.currentTarget);
              const isPrefilledValue =
                hasPlaceholder &&
                currentText.toLowerCase() ===
                  effectivePlaceholder.toLowerCase();
              if (isPrefilledValue) {
                e.preventDefault();
                setIsShowingPlaceholder(false);
                setContent("");
                e.currentTarget.innerText = "";
                updateTitleMeasurementById(shapeId, "");
                return;
              }
            }
            if (e.key === "Backspace" && isShowingPlaceholder) {
              e.preventDefault();
              setIsShowingPlaceholder(false);
              setContent("");
              e.currentTarget.innerText = "";
              updateTitleMeasurementById(shapeId, "");
            }
          }}
          onFocus={(t) => {
            isEditingRef.current = true;
            setIsEditing(true);
            const currentText = getContent(t.currentTarget);
            const isOnPlaceholder =
              content.length === 0 ||
              currentText.toLowerCase() === effectivePlaceholder.toLowerCase();

            if (isOnPlaceholder && hasPlaceholder) {
              setIsShowingPlaceholder(true);
              if (clearPlaceholderOnFocus) {
                setContent("");
                t.currentTarget.innerText = "";
              } else {
                scheduleCaretToEnd(t.currentTarget);
              }
            } else if (focusCaretAtEndOnFocus) {
              scheduleCaretToEnd(t.currentTarget);
            }
          }}
          contentEditable
          suppressContentEditableWarning
          className={`text-[14px] min-h-[20px] min-w-[10px] mr-1${
            multiline ? " whitespace-pre-wrap" : ""
          } ${
            isEditing
              ? "bg-[#fef3c7] outline outline-2 outline-[#1677ff] rounded-[3px]"
              : "bg-transparent"
          }`}
        />
      ) : (
        <span className="text-[14px] mr-1">{formatText(displayText)}</span>
      )}
      {showOrder && <span className="text-[14px] mr-2">#{order}</span>}
      {isCollapsed && (
        <span className="text-[12px] text-[#808080]">{collapsedContent}</span>
      )}
    </div>
  );
};

export default MeasurementTitle;
