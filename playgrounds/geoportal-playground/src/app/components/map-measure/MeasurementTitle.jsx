import { useState } from 'react';
const MeasurementTitle = ({ title, shapeId, setMeasurementById }) => {
  const [content, setContent] = useState(title);

  return (
    <div>
      <div
        onChange={(t) => {
          setContent(t.currentTarget.innerHTML);
          setMeasurementById(shapeId, t.currentTarget.innerHTML);
        }}
        onFocus={(t) => {
          console.log('iii focus');
        }}
        contentEditable
        className="text-[14px] min-h-[40px] min-w-[100px]"
        dangerouslySetInnerHTML={{ __html: capitalizeFirstLetter(content) }}
      ></div>
    </div>
  );
};

export default MeasurementTitle;

function capitalizeFirstLetter(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
