import { useState, useEffect } from 'react';
const MeasurementTitle = ({
  title,
  shapeId,
  updateTitleMeasurementById,
  setUpdateMeasurementStatus,
}) => {
  const [content, setContent] = useState(title);
  const [oldContent, setOldContent] = useState(title);

  return (
    <div>
      <div
        // onChange={(t) => {
        //   console.log('ccc on change', t.currentTarget);
        //   setContent(t.currentTarget.innerHTML);
        //   setMeasurementById(shapeId, t.currentTarget.innerHTML);
        // }}
        // onInput={(t) => {
        //   console.log('ccc on change', t.currentTarget.textContent);
        //   setContent(t.currentTarget.innerHTML);
        //   setMeasurementById(shapeId, t.currentTarget.innerHTML);
        // }}
        // onBlur={(t) => {
        //   console.log('ccc', t.currentTarget.textContent.length);
        //   setContent(t.currentTarget.innerHTML);
        //   if (t.currentTarget.textContent.length === 0) {
        //     console.log('ccc 000', oldContent);
        //     setContent(oldContent);
        //     t.currentTarget.textContent = oldContent;
        //   } else {
        //     console.log('ccc else');
        //     setContent(t.currentTarget.innerHTML);
        //     updateTitleMeasurementById(shapeId, t.currentTarget.innerHTML);
        //   }
        // }}
        onBlur={(t) => {
          console.log('ccc', t.currentTarget.textContent.length);
          setContent(t.currentTarget.innerHTML);
          if (t.currentTarget.textContent.length === 0) {
            console.log('ccc 000', oldContent);
            setContent(oldContent);
            t.currentTarget.textContent = oldContent;
          } else {
            console.log('ccc else');
            setContent(t.currentTarget.innerHTML);
            updateTitleMeasurementById(shapeId, t.currentTarget.innerHTML);
            setUpdateMeasurementStatus(true);
          }
        }}
        onFocus={(t) => {
          console.log('ccc focus');
        }}
        contentEditable
        className="text-[14px] min-h-[20px] min-w-[100px]"
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
