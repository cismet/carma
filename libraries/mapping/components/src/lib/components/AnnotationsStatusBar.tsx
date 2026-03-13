import { useEffect, type ReactNode } from "react";

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
    "[mapping-components] Tailwind CSS utilities were not detected. Components like AnnotationsStatusBar require Tailwind in the host app."
  );
};

type AnnotationsStatusBarProps = {
  label: ReactNode;
  values?: readonly ReactNode[];
  className?: string;
};

export const AnnotationsStatusBar = ({
  label,
  values = [],
  className,
}: AnnotationsStatusBarProps) => {
  useEffect(() => {
    checkTailwindPresence();
  }, []);

  return (
    <div
      className={cn(
        "fixed left-0 right-0 bottom-0 flex items-center justify-center gap-3 min-h-[22px] bg-white/30 backdrop-blur-md text-gray-600 pointer-events-none text-[10px]",
        className
      )}
    >
      <span className="font-bold tracking-[0.04em] uppercase text-gray-500">
        {label}
      </span>
      {values.map((value, index) => (
        <span key={`status-value-${index}`} className="font-medium">
          {value}
        </span>
      ))}
    </div>
  );
};
