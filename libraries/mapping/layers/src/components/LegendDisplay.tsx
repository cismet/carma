import { updateUrl as updateUrlUtil } from "@carma-commons/utils";

interface LegendDisplayProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  url: string;
  updateUrl?: boolean;
}

const LegendDisplay = ({
  url,
  updateUrl = false,
  ...props
}: LegendDisplayProps) => {
  return (
    <img
      src={updateUrl ? updateUrlUtil(url) : url}
      alt="Legende"
      className="max-w-full h-auto"
      {...props}
    />
  );
};

export default LegendDisplay;
