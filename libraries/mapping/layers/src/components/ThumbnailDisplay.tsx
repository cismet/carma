import { cn, useImageFallback } from "@carma-commons/utils";

interface ThumbnailDisplayProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  url: string;
  /** Try our mirror when the original host fails, defaults to true */
  fallback?: boolean;
  hovered?: boolean;
}

const ThumbnailDisplay = ({
  url,
  fallback = true,
  hovered = false,
  onLoad,
  onError,
  ...props
}: ThumbnailDisplayProps) => {
  const image = useImageFallback(url, { enabled: fallback });

  if (image.failed) {
    return (
      <div className="h-full w-full bg-gray-200 flex items-center justify-center p-2 text-center text-sm text-gray-500">
        Vorschaubild nicht verfügbar
      </div>
    );
  }

  return (
    <img
      src={image.src}
      alt={"Vorschau"}
      className={cn(
        `object-cover relative h-full overflow-clip w-[calc(130%+7.2px)] transition-all duration-200`,
        hovered && "scale-110",
        props.className
      )}
      {...props}
      onLoad={(e) => {
        image.onLoad();
        onLoad?.(e);
      }}
      onError={(e) => {
        image.onError();
        if (image.isLastCandidate) {
          onError?.(e);
        }
      }}
    />
  );
};

export default ThumbnailDisplay;
