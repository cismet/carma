import React from 'react'
import { LeftCircleOutlined, RightCircleOutlined } from '@ant-design/icons';
import { Dropdown, Button } from 'antd';
import { useSelector } from 'react-redux';
import { getPrevious, getNext } from '../../../store/slices/lpHistoryNav';

function LandParcelHistoryNav() {
  const previous = useSelector(getPrevious);
  const next = useSelector(getNext);
  const prevItems = previous.map((item) => ({
    key: item.id,
    label: item,
  }));
  const nextItems = next.map((item) => ({
    key: item.id,
    label: item,
  }));
  return (
    <div className="flex gap-1 items-center">
      <LeftCircleOutlined />
      <Dropdown menu={{ items: prevItems }} placement="bottom" open={true}>
        <Button>Previous</Button>
      </Dropdown>
      <RightCircleOutlined />
      <Dropdown menu={{ items: nextItems }} placement="bottom" open={true}>
        <Button>Next</Button>
      </Dropdown>
    </div>
  )
}

export default LandParcelHistoryNav
