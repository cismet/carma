import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge } from "antd";
import "./badge.css";

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
  return (
    <div
      className={`w-full ${active && "bg-[#f2f2f2]"} ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      } ml-6 rounded-l-md py-3 flex flex-col gap-1 items-center`}
      onClick={!disabled ? onClick : undefined}
    >
      <Badge count={numberOfItems} color="#9ca3af" overflowCount={500}>
        <FontAwesomeIcon className="w-9 h-9 mr-3 text-gray-400" icon={icon} />
      </Badge>

      <p className={`mb-0 text-base font-semibold mr-3 text-gray-400`}>
        {text}
      </p>
    </div>
  );
};
