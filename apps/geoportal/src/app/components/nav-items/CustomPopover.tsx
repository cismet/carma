import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Popover, Tooltip } from "antd";
import {
  ReactNode,
  useEffect,
  useRef,
  useState,
  isValidElement,
  cloneElement,
  ReactElement,
} from "react";

interface ContentComponentProps {
  closePopover?: () => void;
}

interface PopoverProps {
  tooltip?: string;
  content: ReactNode;
  icon: IconProp;
  testId?: string;
  disabled?: boolean;
  className?: string;
  shiftClickHandler?: () => void;
}

const CustomPopover = ({
  tooltip = "",
  content,
  icon,
  testId,
  disabled,
  className,
  shiftClickHandler,
}: PopoverProps) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  const handleClickOutside = (event: MouseEvent | TouchEvent) => {
    const target = event.target as Node;
    let clickInPopover = false;
    const ifSelectionClicked =
      (event.target as HTMLElement).classList.contains(
        "ant-select-item-option-content"
      ) || (event.target as HTMLElement).classList.contains("ant-select-item");

    const popoverContent = document.querySelectorAll(".ant-popover-content");

    popoverContent.forEach((content) => {
      if (content.contains(target)) {
        clickInPopover = true;
      }
    });

    if (
      buttonRef.current &&
      !buttonRef.current.contains(target) &&
      !ifSelectionClicked &&
      (!popoverContent || !clickInPopover)
    ) {
      setOpen(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mouseup", handleClickOutside);
    document.addEventListener("touchend", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mouseup", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <Tooltip title={tooltip}>
      <Popover
        open={!disabled && open}
        trigger="click"
        placement="bottom"
        content={
          isValidElement(content)
            ? cloneElement(content as ReactElement<ContentComponentProps>, {
                closePopover: () => setOpen(false),
              })
            : content
        }
      >
        <button
          className={` text-xl ${
            disabled ? "text-gray-300" : "hover:text-gray-600"
          } ${className}`}
          data-test-id={testId}
          ref={buttonRef}
          onClick={(event) => {
            // Check if shift key was held during click
            const isShiftClick = event.shiftKey;

            if (isShiftClick && shiftClickHandler) {
              shiftClickHandler();
            } else {
              setOpen(!open);
            }
          }}
        >
          <FontAwesomeIcon icon={icon} />
        </button>
      </Popover>
    </Tooltip>
  );
};

export default CustomPopover;
