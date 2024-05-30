import React from 'react';

interface AddressLabelProps {
  address: any;
}

const AddressLabel: React.FC<AddressLabelProps> = ({ address }) => {
  let icon;
  if (address.glyph === 'pie-chart') {
    icon = 'chart-pie';
  } else {
    icon = address.glyph;
  }
  return (
    <div>
      <span>
        <i className={icon && 'fas ' + 'fa-' + icon}></i>
        {'  '}
      </span>
      <span>{address.string}</span>
    </div>
  );
};

export default AddressLabel;
