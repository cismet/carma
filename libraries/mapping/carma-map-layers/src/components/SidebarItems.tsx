import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge } from "antd";
import "./badge.css";
import { useWindowSize } from "@uidotdev/usehooks";

interface SidebarItemProps {
  text: string;
  icon: any;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  numberOfItems?: number;
  showNumberOfItems?: boolean;
}

export const SidebarItem = ({
  text,
  icon,
  active,
  onClick,
  disabled,
  numberOfItems,
  showNumberOfItems,
}: SidebarItemProps) => {
  const size = useWindowSize();

  return (
    <div
      className={`w-full ${active && "bg-[#f2f2f2]"} ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      } ml-6 rounded-l-md py-3 flex flex-col gap-1 items-center`}
      onClick={!disabled ? onClick : undefined}
    >
      <Badge
        count={numberOfItems}
        offset={size.width && size.width < 640 ? [-12, 0] : [0, 0]}
        size={size.width && size.width < 640 ? "small" : "default"}
        color="#9ca3af"
        overflowCount={500}
      >
        <FontAwesomeIcon
          className={`sm:w-9 sm:h-9 w-7 h-7 mr-3 ${
            disabled ? "text-gray-500" : "text-gray-400"
          }`}
          icon={icon}
        />
      </Badge>

      <p
        className={`mb-0 hidden sm:block text-base font-semibold mr-3 ${
          disabled ? "text-gray-500" : "text-gray-400"
        }`}
      >
        {text}
      </p>
    </div>
  );
};
