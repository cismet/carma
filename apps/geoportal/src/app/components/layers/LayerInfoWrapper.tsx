import { ReactNode } from "react";

interface LayerInfoWrapperProps {
  content: ReactNode;
  footerText: string;
}

const LayerInfoWrapper = ({ content, footerText }: LayerInfoWrapperProps) => {
  return (
    <div className="flex flex-col gap-1 overflow-y-hidden h-full">
      {content}
      <hr className="h-px my-0 bg-gray-300 border-0 w-full absolute bottom-9 left-0" />
      <p className="my-0 pt-2.5 text-gray-400 text-base truncate">
        {footerText}
      </p>
    </div>
  );
};

export default LayerInfoWrapper;
