import React, { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { Dropdown, Tooltip } from "antd";
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
  const [prevOpen, setPrevOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);

  const closeDropdowns = useCallback(() => {
    setPrevOpen(false);
    setNextOpen(false);
  }, []);

  const handleLParcelUpdate = (q) => {
    const searchParamsObj = convertLParcelStrToSetUrlParams(q);
    setUrlParams(searchParamsObj);
  };
  // Helper to build dropdown menu items without mutating the index and with better accessibility
  const makeItems = (items, actionCreator) =>
    items.map((item, idx) => ({
      key: `${idx}-${item}`,
      label: (
        <div
          onClick={() => {
            closeDropdowns();
            dispatch(actionCreator(handleLParcelUpdate, idx));
          }}
        >
          {item}
        </div>
      ),
    }));

  const prevItems = makeItems(previous, hitPrevItem);
  const nextItems = makeItems(next, hitNextItem);

  const isPrevDisabled = previous.length === 0;
  const isNextDisabled = next.length === 0;

  // Shared styles for navigation buttons
  const baseBtnClasses =
    "h-[30px] px-3 rounded border flex items-center justify-center transition-colors";
  const enabledClasses =
    "border-gray-300 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer";
  const disabledClasses =
    "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed";

  // Reusable renderer for nav dropdowns
  const renderNavDropdown = ({
    items,
    placement,
    disabled,
    onClick,
    icon,
    ariaLabel,
    open,
    onOpenChange,
  }) => (
    <Dropdown
      menu={{ items }}
      placement={placement}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        className={`${baseBtnClasses} ${
          disabled ? disabledClasses : enabledClasses
        }`}
        onClick={() => {
          if (!disabled) {
            closeDropdowns();
            onClick();
          }
        }}
        disabled={disabled}
      >
        <FontAwesomeIcon icon={icon} className="text-xs" />
      </button>
    </Dropdown>
  );

  return (
    <div className="flex gap-1 items-center">
      {/* <Tooltip title="Klicken, um zurückzugehen"> */}
      {renderNavDropdown({
        items: prevItems,
        placement: "bottomRight",
        disabled: isPrevDisabled,
        onClick: () => dispatch(hitPrevious(handleLParcelUpdate)),
        icon: faChevronLeft,
        ariaLabel: "Zurück",
        open: prevOpen,
        onOpenChange: setPrevOpen,
      })}
      {/* </Tooltip> */}
      {/* <Tooltip title="Klicken, um vorwärtszugehen"> */}
      {renderNavDropdown({
        items: nextItems,
        placement: "bottomLeft",
        disabled: isNextDisabled,
        onClick: () => dispatch(hitNext(handleLParcelUpdate)),
        icon: faChevronRight,
        ariaLabel: "Vorwärts",
        open: nextOpen,
        onOpenChange: setNextOpen,
      })}
      {/* </Tooltip> */}
    </div>
  );
}

export default LandParcelHistoryNav;
