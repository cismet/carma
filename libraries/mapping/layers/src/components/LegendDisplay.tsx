import { useImageFallback } from "@carma-commons/utils";

interface LegendDisplayProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  url: string;
  /** Try our mirror when the original host fails, defaults to true */
  fallback?: boolean;
}

const LegendDisplay = ({
  url,
  fallback = true,
  onLoad,
  onError,
  ...props
}: LegendDisplayProps) => {
  const image = useImageFallback(url, { enabled: fallback });

  if (image.failed) {
    return null;
  }

  return (
    <img
      src={image.src}
      alt="Legende"
      className="max-w-full h-auto"
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

export default LegendDisplay;
