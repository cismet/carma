import type { Layer } from "@carma-commons/types";
import { HTMLAttributes, ReactNode, forwardRef, ForwardedRef } from "react";
import { cn } from "@carma-commons/utils";

interface LayerButtonProps extends HTMLAttributes<HTMLDivElement> {
  layer: Layer;
  children?: ReactNode;
  classNames?: string[];
  useShadow?: boolean;
}

export const LayerButton = forwardRef(
  (
    {
      layer,
      children,
      classNames = [],
      useShadow = true,
      ...divProps
    }: LayerButtonProps,
    ref: ForwardedRef<HTMLDivElement>
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "w-fit min-w-max relative flex items-center gap-1 rounded-[10px] h-8 z-[9999999] bg-white",
          useShadow ? "button-shadow" : "",
          ...classNames
        )}
        {...divProps}
      >
        {children}
      </div>
    );
  }
);
