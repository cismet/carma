import type { ReactNode } from "react";
import { useImageFallback } from "@carma-commons/utils";
import { resolveIconUrl } from "@carma-mapping/utils";

interface DynamicStylingOptionIconProps {
  icon?: string;
  title?: string;
  /** Shown when the option has no icon or no icon url loads */
  fallback: ReactNode;
}

export const DynamicStylingOptionIcon = ({
  icon,
  title,
  fallback,
}: DynamicStylingOptionIconProps) => {
  const iconFallback = useImageFallback(resolveIconUrl(icon));

  if (!iconFallback.src) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={iconFallback.src}
      alt={title}
      className="w-4 h-4 object-contain"
      onLoad={iconFallback.onLoad}
      onError={iconFallback.onError}
    />
  );
};
