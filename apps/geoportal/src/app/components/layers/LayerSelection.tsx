import { useSelector } from "react-redux";

import { cn } from "@carma-commons/utils";

import { getBackgroundLayer } from "../../store/slices/mapping";
import { useMapStyle } from "../../hooks/useGeoportalMapStyle";

interface LayerSelectionProps extends React.HTMLAttributes<HTMLButtonElement> {
  /** the background category this column stands for */
  id: string;
  title: string;
  children: React.ReactNode;
}

const LayerSelection = ({
  id,
  title,
  children,
  ...props
}: LayerSelectionProps) => {
  const { setCurrentStyle } = useMapStyle();

  const backgroundLayer = useSelector(getBackgroundLayer);

  return (
    <button
      onClick={(e) => {
        if (
          (e.target as HTMLElement).localName !== "span" &&
          (e.target as HTMLElement).localName !== "input"
        ) {
          setCurrentStyle(id);
        }
      }}
      className={cn(
        "w-full group border-[1px] rounded-s-md",
        backgroundLayer.id === id && "border-[#1677ff]"
      )}
      {...props}
    >
      <div className="w-full flex flex-col text-[14px]/[30px] items-center justify-center gap-3">
        <p
          className={cn(
            "mb-0 group-hover:text-[#1677ff]",
            backgroundLayer.id === id && "text-[#1677ff]"
          )}
        >
          {title}
        </p>
        {children}
      </div>
    </button>
  );
};

export default LayerSelection;
