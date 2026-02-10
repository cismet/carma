import { useState, useEffect } from "react";
import { MeasurementTitleProps } from "../..";

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

  return (
    <div>
      {editable ? (
        <span
          onBlur={(t) => {
            const trimmedContent = t.currentTarget.textContent?.trim() || "";

            if (trimmedContent.length === 0) {
              if (hasPlaceholder) {
                setContent("");
                t.currentTarget.textContent = capitalizeFirstLetter(
                  placeholderText || ""
                );
                updateTitleMeasurementById(shapeId, "");
                setUpdateMeasurementStatus(true);
                return;
              }

              setContent(oldContent);
              t.currentTarget.textContent = capitalizeFirstLetter(oldContent);
              return;
            }

            setContent(trimmedContent);
            setOldContent(trimmedContent);
            updateTitleMeasurementById(shapeId, trimmedContent);
            setUpdateMeasurementStatus(true);
          }}
          onFocus={(t) => {
            if (!clearPlaceholderOnFocus || !hasPlaceholder) return;

            const currentText = t.currentTarget.textContent?.trim() || "";
            if (
              content.length === 0 ||
              currentText.toLowerCase() === placeholderText?.toLowerCase()
            ) {
              setContent("");
              t.currentTarget.textContent = "";
            }
          }}
          contentEditable
          suppressContentEditableWarning
          className="text-[14px] min-h-[20px] min-w-[10px] mr-1"
        >
          {capitalizeFirstLetter(displayText)}
        </span>
      ) : (
        <span className="text-[14px] mr-1">
          {capitalizeFirstLetter(displayText)}
        </span>
      )}
      {showOrder && <span className="text-[14px] mr-2">#{order}</span>}
      {isCollapsed && (
        <span className="text-[12px] text-[#808080]">{collapsedContent}</span>
      )}
    </div>
  );
};

export default MeasurementTitle;

function capitalizeFirstLetter(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
