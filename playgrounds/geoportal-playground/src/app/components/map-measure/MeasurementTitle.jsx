import React, { useState, useRef } from 'react';

const MeasurementTitle = ({ title }) => {
  const [content, setContent] = React.useState(title);

  return (
    <div>
      <div
        onBlur={(t) => setContent(t.currentTarget.innerHTML)}
        contentEditable
        className="text-[14px]"
        // style={{
        //   border: '1px solid black',
        //   padding: '10px',
        //   minHeight: '20px',
        // }}
      >
        {capitalizeFirstLetter(content)}
      </div>
    </div>
  );
};

export default MeasurementTitle;

function capitalizeFirstLetter(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
