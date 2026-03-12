import type { ReactNode } from "react";
import { DismissibleHelpBox } from "@carma-commons/ui/components";
import { INFOBOX_SURFACE_BG, INFOBOX_SURFACE_BLUR } from "../shared";

type AnnotationToolbarHelpOverlayProps = {
  content: ReactNode;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

export function AnnotationToolbarHelpOverlay({
  content,
  collapsed,
  onCollapsedChange,
}: AnnotationToolbarHelpOverlayProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: "max(12.5px, env(safe-area-inset-top))",
        right: "max(12.5px, env(safe-area-inset-right))",
        width: collapsed ? "fit-content" : "min(360px, calc(100vw - 25px))",
        maxWidth: "calc(100vw - 25px)",
        zIndex: 2200,
        pointerEvents: "auto",
        fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
        fontSize: "0.75rem",
      }}
    >
      <div
        style={
          collapsed
            ? {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 6,
                borderRadius: 999,
                backgroundColor: INFOBOX_SURFACE_BG,
                backdropFilter: INFOBOX_SURFACE_BLUR,
                WebkitBackdropFilter: INFOBOX_SURFACE_BLUR,
              }
            : undefined
        }
      >
        <DismissibleHelpBox
          content={content}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
          dataTestId="measurement-toolbar-help"
        />
      </div>
    </div>
  );
}
