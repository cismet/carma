import { useEffect, useMemo, useState } from "react";
import { InputNumber } from "antd";

export interface EditableMetricValueProps {
  value: number;
  onValueChange: (nextValue: number) => void;
  label: string;
  unit?: string;
  locale?: string;
  decimalSeparator?: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  inputWidth?: number;
  dataTestIdPrefix?: string;
  onEditStateChange?: (isEditing: boolean) => void;
  forceCloseSignal?: number;
  inputClassName?: string;
}

export const EditableMetricValue = ({
  value,
  onValueChange,
  label,
  unit = "m",
  locale = "de-DE",
  decimalSeparator = ",",
  min,
  max,
  step = 0.1,
  precision = 2,
  inputWidth = 88,
  dataTestIdPrefix = "editable-metric-value",
  onEditStateChange,
  forceCloseSignal,
  inputClassName,
}: EditableMetricValueProps) => {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    setIsEditing(false);
    onEditStateChange?.(false);
  }, [forceCloseSignal]);

  const displayText = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value),
    [locale, value]
  );

  const startEdit = () => {
    setIsEditing(true);
    onEditStateChange?.(true);
  };

  const stopEdit = () => {
    setIsEditing(false);
    onEditStateChange?.(false);
  };

  if (isEditing) {
    return (
      <span
        className="inline-flex items-center gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <InputNumber
          value={value}
          min={min}
          max={max}
          step={step}
          precision={precision}
          decimalSeparator={decimalSeparator}
          controls
          changeOnWheel
          size="small"
          className={inputClassName}
          style={{ width: inputWidth }}
          addonAfter={unit}
          data-test-id={`${dataTestIdPrefix}-edit-input`}
          formatter={(nextValue) => {
            if (nextValue === null || nextValue === undefined) {
              return "";
            }
            const numericValue =
              typeof nextValue === "number"
                ? nextValue
                : Number.parseFloat(String(nextValue));
            if (!Number.isFinite(numericValue)) {
              return "";
            }
            return String(numericValue).replace(".", decimalSeparator);
          }}
          parser={(nextValue) => {
            const normalizedValue = String(nextValue ?? "")
              .replace(decimalSeparator, ".")
              .replace(/[^0-9+-.]/g, "");
            return Number.parseFloat(normalizedValue);
          }}
          onWheel={(event) => {
            event.stopPropagation();
          }}
          onChange={(nextValue) => {
            if (typeof nextValue === "number" && Number.isFinite(nextValue)) {
              onValueChange(nextValue);
            }
          }}
          onPressEnter={stopEdit}
        />
        <button
          type="button"
          onClick={stopEdit}
          className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
          data-test-id={`${dataTestIdPrefix}-edit-complete-btn`}
          aria-label={`${label} bearbeiten abschließen`}
        >
          ✓
        </button>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={startEdit}
        className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
        data-test-id={`${dataTestIdPrefix}-display-btn`}
      >
        {displayText}
      </button>
      <span>
        {unit} {label}
      </span>
    </>
  );
};

export default EditableMetricValue;
