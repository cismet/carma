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
