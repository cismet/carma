import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@carma-commons/utils";

let hasCheckedTailwindPresence = false;
let hasWarnedTailwindMissing = false;

const checkTailwindPresence = () => {
  if (
    hasCheckedTailwindPresence ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }

  hasCheckedTailwindPresence = true;

  const probe = document.createElement("div");
  probe.className = "hidden";
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";

  document.body.appendChild(probe);
  const display = window.getComputedStyle(probe).display;
  document.body.removeChild(probe);

  if (display === "none" || hasWarnedTailwindMissing) {
    return;
  }

  hasWarnedTailwindMissing = true;
  // eslint-disable-next-line no-console
  console.error(
    "[mapping-components] Tailwind CSS utilities were not detected. Components like AnnotationsToolbar require Tailwind in the host app."
  );
};

const useTailwindPresenceWarning = () => {
  useEffect(() => {
    checkTailwindPresence();
  }, []);
};

type AnnotationsToolbarProps = {
  children?: ReactNode;
  className?: string;
};

export const AnnotationsToolbar = ({
  children,
  className,
}: AnnotationsToolbarProps) => {
  useTailwindPresenceWarning();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0 min-h-8 px-2 rounded-full bg-neutral-100 shadow-md",
        className
      )}
    >
      {children}
    </div>
  );
};

type AnnotationsToolbarItemProps = {
  children?: ReactNode;
  className?: string;
};

export const AnnotationsToolbarItem = ({
  children,
  className,
}: AnnotationsToolbarItemProps) => (
  <div className={cn("flex items-center", className)}>{children}</div>
);

type AnnotationsToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children?: ReactNode;
};

export const AnnotationsToolbarButton = ({
  active = false,
  className,
  type = "button",
  children,
  ...buttonProps
}: AnnotationsToolbarButtonProps) => (
  <button
    type={type}
    className={cn(
      "inline-flex items-center justify-center w-11 min-w-11 h-8 px-0 rounded-none border-0 bg-transparent text-gray-700 hover:text-gray-900",
      active ? "bg-white/90 text-gray-900 ring-1 ring-slate-300" : "",
      className
    )}
    {...buttonProps}
  >
    {children}
  </button>
);

export const AnnotationsToolbarIcon = ({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex items-center justify-center text-[18px] leading-none",
      className
    )}
  >
    {children}
  </span>
);

export const AnnotationsToolbarSeparator = ({
  className,
}: {
  className?: string;
}) => (
  <span
    className={cn("inline-block w-px h-[18px] bg-gray-300", className)}
    aria-hidden="true"
  />
);
