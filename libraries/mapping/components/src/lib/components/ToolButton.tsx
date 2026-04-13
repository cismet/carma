import {
  ButtonHTMLAttributes,
  ForwardedRef,
  ReactNode,
  forwardRef,
} from "react";

import { cn } from "@carma-commons/utils";

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  classNames?: string[];
  useShadow?: boolean;
}

export const ToolButton = forwardRef(
  (
    {
      children,
      classNames = [],
      useShadow = true,
      type = "button",
      ...buttonProps
    }: ToolButtonProps,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "w-fit min-w-max relative inline-flex items-center justify-center gap-2 sm:gap-1 rounded-[10px] h-8 z-[9999999] bg-white border-0",
          useShadow ? "button-shadow" : "",
          ...classNames
        )}
        {...buttonProps}
      >
        {children}
      </button>
    );
  }
);
