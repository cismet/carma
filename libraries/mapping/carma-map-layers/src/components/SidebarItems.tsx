import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const SimpleText = ({ text }: { text: string }) => {
  return (
    <p className="w-60 rounded-md hover:bg-gray-200 cursor-pointer text-center py-2">
      {text}
    </p>
  );
};

export const TextWithIcon = ({
  icon,
  text,
  border,
  active,
}: {
  icon: any;
  text: string;
  border?: boolean;
  active?: boolean;
}) => {
  return (
    <div
      className={`flex relative hover:bg-gray-200 cursor-pointer items-center gap-2 p-2 w-44 ${
        border ? "!border border-1 border-gray-500" : ""
      }  rounded-md`}
    >
      <FontAwesomeIcon className="w-8" icon={icon} />

      <p className="text-center mb-0 font-normal text-lg">{text}</p>
      {active && (
        <div className="w-2/4 h-0.5 bg-blue-700 rounded-md absolute bottom-0 left-3" />
      )}
    </div>
  );
};

export const TextWithIconVertical = ({
  icon,
  text,
}: {
  icon: any;
  text: string;
}) => {
  return (
    <div className="flex flex-col cursor-pointer items-center gap-2 p-2 -ml-4 w-40 !border border-1 !border-gray-500 rounded-md">
      <FontAwesomeIcon className="w-8 h-8" icon={icon} />

      <p className="text-center mb-0 w-full font-normal text-base">{text}</p>
    </div>
  );
};

export const SidebarItem = ({
  text,
  icon,
  active,
  expanded,
}: {
  text: string;
  icon: any;
  active?: boolean;
  expanded?: boolean;
}) => {
  return (
    <div
      className={`w-full ${
        active && "bg-[#f2f2f2]"
      } ml-6 rounded-l-md py-3 flex gap-3 items-center`}
    >
      <FontAwesomeIcon className="w-9 h-9 pl-3 text-gray-400" icon={icon} />
      {expanded && (
        <p className={`mb-0 text-lg font-semibold text-gray-400`}>{text}</p>
      )}
    </div>
  );
};

export const SidebarItemVertical = ({
  text,
  icon,
  active,
}: {
  text: string;
  icon: any;
  active?: boolean;
}) => {
  return (
    <div
      className={`w-full ${
        active && "bg-[#f2f2f2]"
      } ml-6 rounded-l-md py-3 flex flex-col gap-1 items-center`}
    >
      <FontAwesomeIcon className="w-9 h-9 mr-3 text-gray-400" icon={icon} />

      <p className={`mb-0 text-base font-semibold mr-3 text-gray-400`}>
        {text}
      </p>
    </div>
  );
};
