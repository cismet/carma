import { cn } from "@carma-commons/utils";

type ResponsiveStatusFooterProps = {
  text: string | null;
  className?: string;
  backgroundHeight?: string;
};

const DEFAULT_BACKGROUND_HEIGHT = "63px";

const ResponsiveStatusFooter = ({
  text,
  className,
  backgroundHeight = DEFAULT_BACKGROUND_HEIGHT,
}: ResponsiveStatusFooterProps) => {
  const isVisible = Boolean(text);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-[1000000] pointer-events-none transition-all duration-300",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      )}
      style={{ height: backgroundHeight, pointerEvents: "none" }}
      role="status"
      aria-live="polite"
      aria-hidden={!isVisible}
    >
      <div className="w-full h-full bg-white/80 flex items-center justify-center pointer-events-none">
        <div
          className={cn(
            "mx-auto w-full px-4 text-center text-black mb-0 font-semibold text-lg min-w-max pointer-events-none",
            className
          )}
        >
          {text ?? ""}
        </div>
      </div>
    </div>
  );
};

export type { ResponsiveStatusFooterProps };
export { ResponsiveStatusFooter };
