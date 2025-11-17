import type { Layer } from "@carma/types";
import { HTMLAttributes, ReactNode, forwardRef, ForwardedRef } from "react";
import { cn } from "@carma-commons/utils";

interface LayerButtonProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  classNames?: string[];
  useShadow?: boolean;
}

export const LayerButton = forwardRef(
  (
    {
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
          "w-fit min-w-max relative flex items-center gap-2 sm:gap-1 rounded-[10px] h-8 z-[9999999] bg-white",
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
