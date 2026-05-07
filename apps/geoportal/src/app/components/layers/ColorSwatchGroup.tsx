import {
  useRef,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { faEyeDropper } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { cn } from "@carma-commons/utils";

export type ColorSwatchGroupOption = {
  color: string;
  label: string;
};

type ColorSwatchGroupProps = {
  swatches: readonly ColorSwatchGroupOption[];
  value: string;
  onChange: (color: string) => void;
  className?: string;
  colorPickerLabel?: string;
  showColorPicker?: boolean;
  tintMix?: number;
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = "#000000";
const COLOR_PICKER_CHECKERBOARD_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #d1d5db 25%, transparent 25%, transparent 75%, #d1d5db 75%), linear-gradient(45deg, #d1d5db 25%, transparent 25%, transparent 75%, #d1d5db 75%)",
  backgroundColor: "#ffffff",
  backgroundPosition: "0 0, 5px 5px",
  backgroundSize: "10px 10px",
};

const normalizeColor = (color: string) => color.trim().toLowerCase();

const resolveColorInputValue = (color: string) =>
  HEX_COLOR_PATTERN.test(color.trim()) ? normalizeColor(color) : FALLBACK_COLOR;

const swatchButtonClassName = (isActive: boolean) =>
  cn(
    "relative box-border h-9 w-9 overflow-hidden rounded border p-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 hover:border-blue-500",
    isActive ? "border-blue-500 shadow-[0_0_0_1px_#1677ff]" : "border-gray-300"
  );

const resolveTintOpacity = (tintMix: number | undefined) =>
  typeof tintMix === "number" && Number.isFinite(tintMix)
    ? Math.min(1, Math.max(0, tintMix))
    : 1;

export const ColorSwatchGroup = ({
  swatches,
  value,
  onChange,
  className,
  colorPickerLabel = "Farbe wählen",
  showColorPicker = false,
  tintMix,
}: ColorSwatchGroupProps) => {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const normalizedValue = normalizeColor(value);
  const matchesSwatch = swatches.some(
    (swatch) => normalizeColor(swatch.color) === normalizedValue
  );
  const colorInputValue = resolveColorInputValue(value);
  const tintOpacity = resolveTintOpacity(tintMix);

  const handleColorPickerChange = (
    event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>
  ) => {
    onChange(event.currentTarget.value);
  };

  const handleSwatchClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    color: string
  ) => {
    event.currentTarget.blur();
    onChange(color);
  };

  return (
    <div className={cn("grid grid-cols-5 gap-2", className)}>
      {swatches.map((swatch) => {
        const normalizedSwatchColor = normalizeColor(swatch.color);
        const isActive = normalizedValue === normalizedSwatchColor;

        return (
          <button
            key={normalizedSwatchColor}
            aria-label={swatch.label}
            aria-pressed={isActive}
            className={swatchButtonClassName(isActive)}
            onClick={(event) => handleSwatchClick(event, swatch.color)}
            onMouseDown={(event) => event.preventDefault()}
            title={swatch.label}
            type="button"
          >
            <span
              className="absolute inset-0"
              style={COLOR_PICKER_CHECKERBOARD_STYLE}
            />
            <span
              className="absolute inset-0"
              style={{
                backgroundColor: swatch.color,
                opacity: tintOpacity,
              }}
            />
          </button>
        );
      })}
      {showColorPicker && (
        <>
          <button
            aria-label={colorPickerLabel}
            aria-pressed={!matchesSwatch}
            className={cn(
              "relative flex items-center justify-center overflow-hidden",
              swatchButtonClassName(!matchesSwatch)
            )}
            onClick={() => colorInputRef.current?.click()}
            onMouseDown={(event) => event.preventDefault()}
            title={colorPickerLabel}
            type="button"
          >
            <span
              className="absolute inset-0"
              style={COLOR_PICKER_CHECKERBOARD_STYLE}
            />
            <span
              className="absolute inset-0"
              style={{
                backgroundColor: colorInputValue,
                opacity: tintOpacity,
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center bg-white/35 text-gray-900">
              <FontAwesomeIcon icon={faEyeDropper} className="text-xs" />
            </span>
          </button>
          <input
            ref={colorInputRef}
            aria-hidden="true"
            className="sr-only"
            tabIndex={-1}
            type="color"
            value={colorInputValue}
            onChange={handleColorPickerChange}
            onInput={handleColorPickerChange}
          />
        </>
      )}
    </div>
  );
};
