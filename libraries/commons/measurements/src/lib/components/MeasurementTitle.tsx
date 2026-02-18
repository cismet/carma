import { useState, useEffect } from "react";
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
}: MeasurementTitleProps) => {
  const normalizedTitle = title.trim();
  const [content, setContent] = useState(normalizedTitle);
  const [oldContent, setOldContent] = useState(normalizedTitle);

  useEffect(() => {
    setContent(normalizedTitle);
    setOldContent(normalizedTitle);
  }, [normalizedTitle]);

  const displayText = content || placeholderText || "";
  const hasPlaceholder = Boolean(placeholderText);
  const formatText = (text: string) =>
    capitalize ? capitalizeFirstLetter(text) : text;

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

  return (
    <div>
      {editable ? (
        <span
          onBlur={(t) => {
            const newContent = getContent(t.currentTarget);

            if (newContent.length === 0) {
              if (hasPlaceholder) {
                setContent("");
                setDomContent(t.currentTarget, placeholderText || "");
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
            updateTitleMeasurementById(shapeId, newContent);
            setUpdateMeasurementStatus(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onFocus={(t) => {
            if (!clearPlaceholderOnFocus || !hasPlaceholder) return;

            const currentText = getContent(t.currentTarget);
            if (
              content.length === 0 ||
              currentText.toLowerCase() === placeholderText?.toLowerCase()
            ) {
              setContent("");
              t.currentTarget.innerText = "";
            }
          }}
          contentEditable
          suppressContentEditableWarning
          className={`text-[14px] min-h-[20px] min-w-[10px] mr-1${
            multiline ? " whitespace-pre-wrap" : ""
          }`}
        >
          {formatText(displayText)}
        </span>
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
