import { useRef } from "react";
import { Slider } from "antd";

export interface HistogramRangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

/** Range slider whose selected interval can also be dragged as one fixed-width range. */
export function HistogramRangeSlider({
  min,
  max,
  step,
  value,
  onChange,
}: HistogramRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; low: number; high: number } | null>(null);

  const updateFromPointer = (clientX: number) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;
    const width = track.getBoundingClientRect().width;
    const delta = ((clientX - drag.startX) / Math.max(1, width)) * (max - min);
    const span = drag.high - drag.low;
    const low = Math.max(min, Math.min(max - span, drag.low + delta));
    const snapped = Math.round((low - min) / step) * step + min;
    onChange([snapped, snapped + span]);
  };

  const leftPercent = ((value[0] - min) / Math.max(1e-9, max - min)) * 100;
  const rightPercent = ((value[1] - min) / Math.max(1e-9, max - min)) * 100;
  const centerPercent = (leftPercent + rightPercent) / 2;

  return (
    <div ref={trackRef} className="relative flex-1 pt-1">
      <Slider
        range
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(next) => onChange(next as [number, number])}
      />
      <div
        className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-cyan-600 shadow-[0_0_0_1px_rgba(8,145,178,0.8)] hover:scale-125"
        style={{ left: `${centerPercent}%` }}
        onPointerDown={(event) => {
          event.preventDefault();
          dragRef.current = { startX: event.clientX, low: value[0], high: value[1] };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => updateFromPointer(event.clientX)}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        title="Bereich verschieben"
      />
    </div>
  );
}
