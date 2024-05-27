import React, { useState } from 'react';

const MeasurementTitle = ({ title }) => {
  const [content, setContent] = React.useState(title);

  return (
    <div>
      <div
        onBlur={(t) => {
          console.log('iii blur');
          setContent(t.currentTarget.innerHTML);
        }}
        onFocus={(t) => {
          console.log('iii focus');
        }}
        contentEditable
        className="text-[14px]"
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
