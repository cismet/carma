import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { Dropdown, Button, Tooltip } from "antd";
import { useSelector } from "react-redux";
import {
  getPrevious,
  getNext,
  hitPrevious,
  hitNext,
  hitPrevItem,
  hitNextItem,
} from "../../../store/slices/lpHistoryNav";
import { useDispatch } from "react-redux";
import { convertLParcelStrToSetUrlParams } from "../../../core/tools/helper";
import { useSearchParams } from "react-router-dom";

function LandParcelHistoryNav() {
  const dispatch = useDispatch();
  const previous = useSelector(getPrevious);
  const next = useSelector(getNext);
  const [urlParams, setUrlParams] = useSearchParams();

  const handleLParcelUpdate = (q) => {
    const searchParamsObj = convertLParcelStrToSetUrlParams(q);
    setUrlParams(searchParamsObj);
  };
  // Helper to build dropdown menu items without mutating the index and with better accessibility
  const makeItems = (items, actionCreator) =>
    items.map((item, idx) => ({
      key: `${idx}-${item}`,
      label: (
        <div onClick={() => dispatch(actionCreator(handleLParcelUpdate, idx))}>
          {item}
        </div>
      ),
    }));

  const prevItems = makeItems(previous, hitPrevItem);
  const nextItems = makeItems(next, hitNextItem);

  const isPrevDisabled = previous.length === 0;
  const isNextDisabled = next.length === 0;

  return (
    <div className="flex gap-1 items-center">
      <Tooltip title="Klicken, um zurückzugehen">
        <Dropdown
          menu={{ items: prevItems }}
          placement="bottomRight"
          disabled={isPrevDisabled}
        >
          <button
            className={`h-[30px] px-3 rounded border flex items-center justify-center transition-colors ${
              isPrevDisabled
                ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                : "border-gray-300 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer"
            }`}
            onClick={() =>
              !isPrevDisabled && dispatch(hitPrevious(handleLParcelUpdate))
            }
            disabled={isPrevDisabled}
          >
            <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
          </button>
        </Dropdown>
      </Tooltip>
      <Tooltip title="Klicken, um vorwärtszugehen">
        <Dropdown
          menu={{ items: nextItems }}
          placement="bottomLeft"
          disabled={isNextDisabled}
        >
          <button
            className={`h-[30px] px-3 rounded border flex items-center justify-center transition-colors ${
              isNextDisabled
                ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                : "border-gray-300 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer"
            }`}
            onClick={() =>
              !isNextDisabled && dispatch(hitNext(handleLParcelUpdate))
            }
            disabled={isNextDisabled}
          >
            <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
          </button>
        </Dropdown>
      </Tooltip>
    </div>
  );
}

export default LandParcelHistoryNav;
