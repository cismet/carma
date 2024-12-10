import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const SidebarItem = ({
  text,
  icon,
  active,
  onClick,
  disabled,
}: {
  text: string;
  icon: any;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) => {
  return (
    <div
      className={`w-full ${active && "bg-[#f2f2f2]"} ${
        disabled && "cursor-not-allowed"
      } ml-6 rounded-l-md py-3 flex flex-col gap-1 cursor-pointer items-center`}
      onClick={!disabled ? onClick : undefined}
    >
      <FontAwesomeIcon className="w-9 h-9 mr-3 text-gray-400" icon={icon} />

      <p className={`mb-0 text-base font-semibold mr-3 text-gray-400`}>
        {text}
      </p>
    </div>
  );
};
