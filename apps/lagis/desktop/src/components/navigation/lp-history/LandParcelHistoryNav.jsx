import React from 'react'
import {   LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Dropdown, Button } from 'antd';
import { useSelector } from 'react-redux';
import { getPrevious, getNext, hitPrevious, hitNext, hitPrevItem, hitNextItem } from '../../../store/slices/lpHistoryNav';
import { useDispatch } from 'react-redux';
import { convertLParcelStrToSetUrlParams } from '../../../core/tools/helper';
import { useSearchParams } from 'react-router-dom';

function LandParcelHistoryNav() {
  const dispatch = useDispatch();
  const previous = useSelector(getPrevious);
  const next = useSelector(getNext);
  const [urlParams, setUrlParams] = useSearchParams();

  const handleLParcelUpdate= (q) => {
    const searchParamsObj = convertLParcelStrToSetUrlParams(q);
    setUrlParams(searchParamsObj);
  };
  const prevItems = previous.map((item, index) => ({
    key: item + '-' + index,
    label: <div onClick={() => dispatch(hitPrevItem(handleLParcelUpdate, index++))}>{item}</div>,
  }));
  const nextItems = next.map((item, index) => ({
    key: item + '-' + index,
    label: <div onClick={() => dispatch(hitNextItem(handleLParcelUpdate, index++))}>{item}</div>,
  }));

  return (
    <div className="flex gap-1 items-center">
      <Dropdown menu={{ items: prevItems }} placement="bottom">
      <LeftOutlined className="text-sm mr-1" onClick={() => dispatch(hitPrevious(handleLParcelUpdate))}/>

      </Dropdown>
      <Dropdown menu={{ items: nextItems }} placement="bottom">
      <RightOutlined className="text-sm ml-1" onClick={() => dispatch(hitNext(handleLParcelUpdate))} />
      </Dropdown>
    </div>
  )
}

export default LandParcelHistoryNav
