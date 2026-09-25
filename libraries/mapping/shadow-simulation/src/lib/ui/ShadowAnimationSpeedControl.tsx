import type { ShadowAnimationSpeed } from "../contracts/shadow-simulation";
import { SEGMENT_BUTTON_CLASS_NAME } from "./shadow-control-utils";

export const ShadowAnimationSpeedControl = ({
  value,
  onChange,
}: {
  value: ShadowAnimationSpeed;
  onChange: (speed: ShadowAnimationSpeed) => void;
}) => (
  <div
    role="group"
    aria-label="Animationsgeschwindigkeit"
    className="flex shrink-0 overflow-hidden rounded-md border border-neutral-300"
  >
    {([1, 4, 12] as const).map((speed) => (
      <button
        key={speed}
        type="button"
        className={`${SEGMENT_BUTTON_CLASS_NAME} px-3 ${
          value === speed
            ? "bg-amber-50 font-medium text-amber-700"
            : "bg-white"
        }`}
        aria-pressed={value === speed}
        onClick={() => onChange(speed)}
      >
        {speed}×
      </button>
    ))}
  </div>
);
