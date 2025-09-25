import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
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
        <button 
          className="w-8 h-8 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-colors mr-1"
          onClick={() => dispatch(hitPrevious(handleLParcelUpdate))}
        >
          <FontAwesomeIcon 
            icon={faChevronLeft} 
            className="text-xs text-gray-600"
          />
        </button>
      </Dropdown>
      <Dropdown menu={{ items: nextItems }} placement="bottom">
        <button 
          className="w-8 h-8 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-colors ml-1"
          onClick={() => dispatch(hitNext(handleLParcelUpdate))}
        >
          <FontAwesomeIcon 
            icon={faChevronRight} 
            className="text-xs text-gray-600"
          />
        </button>
      </Dropdown>
    </div>
  )
}

export default LandParcelHistoryNav
