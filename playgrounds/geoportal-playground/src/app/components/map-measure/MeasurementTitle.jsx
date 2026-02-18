import { useState, useEffect } from "react";

function textToHtml(text) {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .join("<br>");
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

const MeasurementTitle = ({
  title,
  shapeId,
  order,
  updateTitleMeasurementById,
  setUpdateMeasurementStatus,
  tooltip,
}) => {
  const [content, setContent] = useState(title.trim());
  const [oldContent, setOldContent] = useState(title);

  useEffect(() => {}, [content]);

  return (
    <div>
      {/* <Tooltip title={tooltip} placement="topRight"> */}
      <span
        onBlur={(t) => {
          const newContent = htmlToText(t.currentTarget.innerHTML);

          if (newContent.length === 0) {
            setContent(oldContent);
            t.currentTarget.innerHTML = textToHtml(oldContent);
          } else {
            setContent(newContent);
            updateTitleMeasurementById(shapeId, newContent);
            setUpdateMeasurementStatus(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onFocus={(t) => {}}
        contentEditable
        className="text-[14px] min-h-[20px] min-w-[10px] whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: textToHtml(content) }}
      ></span>
      <span className="ml-1 text-[14px] text-[#979797]">#{order}</span>
      {/* </Tooltip> */}
    </div>
  );
};

export default MeasurementTitle;
