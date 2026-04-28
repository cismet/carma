import { Dropdown } from "antd";
import {
  faPalette,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { resolveIconSrc } from "./dynamicStyling.helpers";
import type { DynamicStylingControlProps } from "./DynamicStylingControl";

export const DynamicStylingList = ({
  config: listConfig,
  carmaLayerId,
  currentSelection,
  onSelectionChange,
  showIcon: showIconProp,
  children,
}: DynamicStylingControlProps) => {
  const currentOption = listConfig.options.find(
    (o) => o.id === currentSelection
  );
  const isBinaryToggle = listConfig.options.length === 2;
  const showIcon = showIconProp ?? listConfig.showIcon !== false;

  const handleOptionSelect = (key: string) => {
    if (key === currentSelection) {
      return;
    }
    const opt = listConfig.options.find((o) => o.id === key);
    if (!opt) {
      return;
    }
    onSelectionChange(key);
  };

  const dropdownItems = listConfig.options.map((opt) => ({
    key: opt.id,
    label: (
      <div className="flex items-center gap-2">
        {resolveIconSrc(opt.icon) ? (
          <img
            src={resolveIconSrc(opt.icon)}
            alt={opt.title}
            className="w-4 h-4 object-contain"
          />
        ) : (
          <FontAwesomeIcon icon={faPalette} className="text-sm text-gray-400" />
        )}
        {opt.title}
      </div>
    ),
  }));

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownProps: Pick<
    React.ComponentProps<typeof Dropdown>,
    "trigger" | "align" | "menu"
  > = {
    trigger: ["click"],
    align: { offset: [-16, 10] },
    menu: {
      selectedKeys: [currentSelection],
      onClick: ({ key, domEvent }) => {
        domEvent.stopPropagation();
        handleOptionSelect(key);
      },
      items: dropdownItems,
    },
  };

  if (children) {
    return (
      <Dropdown
        {...dropdownProps}
        open={dropdownOpen}
        onOpenChange={setDropdownOpen}
      >
        <div
          className="flex items-center cursor-pointer"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
          <FontAwesomeIcon
            icon={dropdownOpen ? faChevronUp : faChevronDown}
            style={{ fontSize: "6px", marginLeft: "2px" }}
            className="text-gray-500"
          />
        </div>
      </Dropdown>
    );
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextOption = listConfig.options.find(
      (o) => o.id !== currentSelection
    );
    if (nextOption) handleOptionSelect(nextOption.id);
  };

  if (isBinaryToggle) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          id={`stylingLayerButton-${carmaLayerId}`}
          className="px-1.5 flex items-center gap-1 justify-center"
          onClick={handleToggle}
        >
          {showIcon && (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-600 hover:text-gray-500"
            />
          )}
          {resolveIconSrc(currentOption?.icon) ? (
            <img
              src={resolveIconSrc(currentOption?.icon)}
              alt={currentOption?.title}
              className="w-4 h-4 object-contain"
            />
          ) : (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-400"
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Dropdown {...dropdownProps}>
        <button
          id={`stylingLayerButton-${carmaLayerId}`}
          className="px-1.5 flex items-center gap-1 justify-center"
        >
          {showIcon && (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-600 hover:text-gray-500"
            />
          )}
          {resolveIconSrc(currentOption?.icon) ? (
            <img
              src={resolveIconSrc(currentOption?.icon)}
              alt={currentOption?.title}
              className="w-4 h-4 object-contain"
            />
          ) : (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-400"
            />
          )}
        </button>
      </Dropdown>
    </div>
  );
};
