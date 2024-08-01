import { useState, useEffect } from 'react';

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
          const trimmedContent = t.currentTarget.textContent.trim();
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
        className="text-[14px] min-h-[20px] min-w-[10px]"
        dangerouslySetInnerHTML={{ __html: capitalizeFirstLetter(content) }}
      ></span>
      <span className="ml-1 text-[14px] text-[#979797]">#{order}</span>
      {/* </Tooltip> */}
    </div>
  );
};

export default MeasurementTitle;

function capitalizeFirstLetter(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
