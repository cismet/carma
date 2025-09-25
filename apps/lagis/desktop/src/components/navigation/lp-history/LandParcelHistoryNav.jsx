import React from 'react'
import { LeftCircleOutlined, RightCircleOutlined } from '@ant-design/icons';
import { Dropdown, Button } from 'antd';
import { useSelector } from 'react-redux';
import { getPrevious, getNext, hitPrevious, hitNext, hitPrevItem } from '../../../store/slices/lpHistoryNav';
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
    label: <span>{item}</span>,
  }));

  return (
    <div className="flex gap-1 items-center">
      <LeftCircleOutlined onClick={() => dispatch(hitPrevious(handleLParcelUpdate))}/>
      <Dropdown menu={{ items: prevItems }} placement="bottom" open={true}>
        <Button>Previous</Button>
      </Dropdown>
      <RightCircleOutlined onClick={() => dispatch(hitNext(handleLParcelUpdate))} />
      <Dropdown menu={{ items: nextItems }} placement="bottom" open={true}>
        <Button>Next</Button>
      </Dropdown>
    </div>
  )
}

export default LandParcelHistoryNav
