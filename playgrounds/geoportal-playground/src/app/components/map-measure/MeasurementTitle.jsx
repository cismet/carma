import { useState, useEffect } from 'react';
import { Tooltip } from 'antd';
const MeasurementTitle = ({
  title,
  shapeId,
  order,
  updateTitleMeasurementById,
  setUpdateMeasurementStatus,
  tooltip,
}) => {
  const [content, setContent] = useState(title);
  const [oldContent, setOldContent] = useState(title);

  return (
    <div className="flex items-center gap-1">
      {/* <Tooltip title={tooltip} placement="topRight"> */}
      <div
        onBlur={(t) => {
          setContent(t.currentTarget.innerHTML);
          if (t.currentTarget.textContent.length === 0) {
            setContent(oldContent);
            t.currentTarget.textContent = oldContent;
          } else {
            setContent(t.currentTarget.innerHTML);
            updateTitleMeasurementById(shapeId, t.currentTarget.innerHTML);
            setUpdateMeasurementStatus(true);
          }
        }}
        onFocus={(t) => {
          console.log('ccc focus');
        }}
        contentEditable
        className="text-[14px] min-h-[20px] min-w-[10px]"
        dangerouslySetInnerHTML={{ __html: capitalizeFirstLetter(content) }}
      ></div>
      <div className="text-[14px] text-[#9b9a9a]">#{order}</div>
      {/* </Tooltip> */}
    </div>
  );
};

export default MeasurementTitle;

function capitalizeFirstLetter(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
