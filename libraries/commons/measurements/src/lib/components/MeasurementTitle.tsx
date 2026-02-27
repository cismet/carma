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
}: MeasurementTitleProps) => {
  const [content, setContent] = useState(title.trim());
  const [oldContent, setOldContent] = useState(title);

  useEffect(() => {}, [content]);

  return (
    <div>
      {editable ? (
        <span
          onBlur={(t) => {
            const trimmedContent = t.currentTarget.textContent?.trim() || "";
            setContent(trimmedContent);

            if (trimmedContent.length === 0) {
              setContent(oldContent);
              t.currentTarget.textContent = capitalizeFirstLetter(oldContent);
            } else {
              setContent(trimmedContent);
              updateTitleMeasurementById(shapeId, trimmedContent);
              setUpdateMeasurementStatus(true);
            }
          }}
          onFocus={(t) => {}}
          contentEditable
          className="text-[14px] min-h-[20px] min-w-[10px] mr-1"
          dangerouslySetInnerHTML={{ __html: capitalizeFirstLetter(content) }}
        ></span>
      ) : (
        <span className="text-[14px] mr-1">
          {capitalizeFirstLetter(content)}
        </span>
      )}
      <span className="text-[14px] mr-2">#{order}</span>
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
