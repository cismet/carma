import { cn, updateUrl as updateUrlUtil } from "@carma-commons/utils";

interface ThumbnailDisplayProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  url: string;
  updateUrl?: boolean;
  hovered?: boolean;
}

const ThumbnailDisplay = ({
  url,
  updateUrl = false,
  hovered = false,
  ...props
}: ThumbnailDisplayProps) => {
  return (
    <img
      src={updateUrl ? updateUrlUtil(url) : url}
      alt={"Vorschau"}
      className={cn(
        `object-cover relative h-full overflow-clip w-[calc(130%+7.2px)] transition-all duration-200`,
        hovered && "scale-110",
        props.className
      )}
      {...props}
    />
  );
};

export default ThumbnailDisplay;
