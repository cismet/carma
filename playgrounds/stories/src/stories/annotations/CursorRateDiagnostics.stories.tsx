import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";

import { createCursorRateDiagnosticsController } from "./create-cursor-rate-diagnostics-controller";

type CursorRateDiagnosticsStoryProps = {
  maxRateHz: number;
  showPointerMove: boolean;
  showPointerRawUpdate: boolean;
  showCoalesced: boolean;
  showDistinctPosition: boolean;
  showPaintedPosition: boolean;
  showMouseMove: boolean;
  showAnimationFrame: boolean;
  showTouchMove: boolean;
  showTouchStart: boolean;
  showTouchEnd: boolean;
  showTouchForceChange: boolean;
};

const SURFACE_STYLE = {
  position: "relative" as const,
  width: "100%",
  height: "100vh",
  background: "#f8fafc",
  userSelect: "none" as const,
  overflow: "hidden" as const,
};

const STATUS_BAR_HEIGHT_PX = 24;
const CHART_HEIGHT_PX = 284;

const CHART_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: STATUS_BAR_HEIGHT_PX,
  height: CHART_HEIGHT_PX,
};

const STATUS_BAR_STYLE: CSSProperties = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  pointerEvents: "none" as const,
  zIndex: 2,
};

const ROW_LABELS_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: STATUS_BAR_HEIGHT_PX,
  height: CHART_HEIGHT_PX,
  pointerEvents: "none" as const,
  zIndex: 2,
};

const CursorRateDiagnosticsSandbox = ({
  maxRateHz,
  showPointerMove,
  showPointerRawUpdate,
  showCoalesced,
  showDistinctPosition,
  showPaintedPosition,
  showMouseMove,
  showAnimationFrame,
  showTouchMove,
  showTouchStart,
  showTouchEnd,
  showTouchForceChange,
}: CursorRateDiagnosticsStoryProps) => {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const rowLabelsRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<HTMLSpanElement | null>(null);
  const rawSupportRef = useRef<HTMLSpanElement | null>(null);
  const maxRateRef = useRef<HTMLSpanElement | null>(null);
  const controllerRef = useRef<ReturnType<
    typeof createCursorRateDiagnosticsController
  > | null>(null);

  const statusValues = useMemo(
    () => [
      <span key="position" ref={positionRef}>
        position idle
      </span>,
      <span key="raw-support" ref={rawSupportRef} />,
      <span key="max-rate" ref={maxRateRef} />,
    ],
    []
  );

  useEffect(() => {
    if (!surfaceRef.current || !chartRef.current) {
      return;
    }

    controllerRef.current = createCursorRateDiagnosticsController({
      surfaceElement: surfaceRef.current,
      chartElement: chartRef.current,
      rowLabelsElement: rowLabelsRef.current,
      positionElement: positionRef.current,
      rawSupportElement: rawSupportRef.current,
      maxRateElement: maxRateRef.current,
      options: {
        maxRateHz,
        showPointerMove,
        showPointerRawUpdate,
        showCoalesced,
        showDistinctPosition,
        showPaintedPosition,
        showMouseMove,
        showAnimationFrame,
        showTouchMove,
        showTouchStart,
        showTouchEnd,
        showTouchForceChange,
      },
    });

    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.updateOptions({
      maxRateHz,
      showPointerMove,
      showPointerRawUpdate,
      showCoalesced,
      showDistinctPosition,
      showPaintedPosition,
      showMouseMove,
      showAnimationFrame,
      showTouchMove,
      showTouchStart,
      showTouchEnd,
      showTouchForceChange,
    });
  }, [
    maxRateHz,
    showAnimationFrame,
    showCoalesced,
    showDistinctPosition,
    showMouseMove,
    showPaintedPosition,
    showPointerMove,
    showPointerRawUpdate,
    showTouchMove,
    showTouchStart,
    showTouchEnd,
    showTouchForceChange,
  ]);

  return (
    <div ref={surfaceRef} style={SURFACE_STYLE}>
      <div style={STATUS_BAR_STYLE}>
        <ResponsiveStatusBar
          label="cursor diagnostics"
          values={statusValues}
          tone="dark"
        />
      </div>
      <div ref={chartRef} style={CHART_STYLE} />
      <div ref={rowLabelsRef} style={ROW_LABELS_STYLE} />
    </div>
  );
};

const meta: Meta<CursorRateDiagnosticsStoryProps> = {
  title: "Annotations/Cursor Diagnostics",
  component: CursorRateDiagnosticsSandbox,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    maxRateHz: {
      control: { type: "range", min: 30, max: 240, step: 1 },
    },
    showPointerMove: {
      control: { type: "boolean" },
    },
    showPointerRawUpdate: {
      control: { type: "boolean" },
    },
    showDistinctPosition: {
      control: { type: "boolean" },
    },
    showPaintedPosition: {
      control: { type: "boolean" },
    },
    showMouseMove: {
      control: { type: "boolean" },
    },
    showAnimationFrame: {
      control: { type: "boolean" },
    },
    showTouchMove: { control: { type: "boolean" } },
    showTouchStart: { control: { type: "boolean" } },
    showTouchEnd: { control: { type: "boolean" } },
    showTouchForceChange: { control: { type: "boolean" } },
    showCoalesced: { control: { type: "boolean" } },
  },
};

export default meta;

export const PollingRates: StoryObj<CursorRateDiagnosticsStoryProps> = {
  args: {
    maxRateHz: 144,
    showPointerMove: true,
    showPointerRawUpdate: true,
    showCoalesced: true,
    showDistinctPosition: true,
    showPaintedPosition: true,
    showMouseMove: true,
    showAnimationFrame: true,
    showTouchMove: true,
    showTouchStart: true,
    showTouchEnd: true,
    showTouchForceChange: true,
  },
};
