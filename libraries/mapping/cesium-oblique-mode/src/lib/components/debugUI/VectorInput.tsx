import React, { useState, useEffect, useRef, useCallback } from "react";
import { Typography, Input } from "antd";

// Constants for slider behavior
const SLIDER_MIN = -1.0; // Slider range min
const SLIDER_MAX = 1.0; // Slider range max
const SLIDER_SENSITIVITY = 0.01; // How much the vector component changes per interval step, scaled by slider rate
const SLIDER_REPEAT_INTERVAL = 50; // ms interval for applying changes when slider held

// --- VectorAxisSliderControl Component ---
interface VectorAxisSliderControlProps {
  label: string;
  index: number;
  onChangeRate: (index: number, rate: number) => void;
  value: number;
  onChangeValue: (index: number, value: number) => void;
  disabled?: boolean;
}

// TODO simplyfy and remove, but keep non-linear dragging input slider method
const VectorAxisSliderControl: React.FC<VectorAxisSliderControlProps> = ({
  label,
  index,
  onChangeRate,
  value,
  onChangeValue,
  disabled = false,
}) => {
  // State for the slider's current value (representing the rate)
  const [sliderValue, setSliderValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const sliderRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const sliderHeight = 150; // Increased to accommodate text input

  // Functions for handling mouse events
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      if (!sliderRef.current) return;

      const sliderRect = sliderRef.current.getBoundingClientRect();
      const sliderTop = sliderRect.top;
      const sliderBottom = sliderRect.bottom;

      // Calculate relative position (0 at top, 1 at bottom)
      const relativeY = Math.max(
        0,
        Math.min(1, (e.clientY - sliderTop) / (sliderBottom - sliderTop))
      );

      // Convert to slider value (MAX at top, MIN at bottom)
      const newValue = SLIDER_MAX - relativeY * (SLIDER_MAX - SLIDER_MIN);

      setSliderValue(newValue);
      onChangeRate(index, newValue);
    },
    [isDragging, onChangeRate, index]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // Snap back to 0 and report rate 0
    setSliderValue(0);
    onChangeRate(index, 0);

    // Remove global event listeners
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [onChangeRate, index, handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();

      setIsDragging(true);
      startYRef.current = e.clientY;

      // Calculate initial value based on vertical position
      if (sliderRef.current) {
        const sliderRect = sliderRef.current.getBoundingClientRect();
        const sliderTop = sliderRect.top;
        const sliderBottom = sliderRect.bottom;

        // Calculate relative position (0 at top, 1 at bottom)
        const relativeY = Math.max(
          0,
          Math.min(1, (e.clientY - sliderTop) / (sliderBottom - sliderTop))
        );

        // Convert to slider value (MAX at top, MIN at bottom)
        const newValue = SLIDER_MAX - relativeY * (SLIDER_MAX - SLIDER_MIN);

        setSliderValue(newValue);
        onChangeRate(index, newValue);
      }

      // Add global event listeners
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [disabled, onChangeRate, index, handleMouseMove, handleMouseUp]
  );

  // Update input value when prop value changes
  useEffect(() => {
    setInputValue(value.toFixed(4));
  }, [value]);

  // Handle manual input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Handle manual input blur (apply value)
  const handleInputBlur = () => {
    let newValue = parseFloat(inputValue);

    // Validate and clamp input
    if (isNaN(newValue)) {
      setInputValue(value.toFixed(4));
      return;
    }

    // Clamp to valid range
    newValue = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, newValue));

    // Update display and trigger change
    setInputValue(newValue.toFixed(4));
    onChangeValue(index, newValue);
  };

  // Handle key press (apply on Enter)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  // Fix dependency cycle by using a layout effect to set up references
  useEffect(() => {
    const localHandleMouseMove = handleMouseMove;
    const localHandleMouseUp = handleMouseUp;

    return () => {
      document.removeEventListener("mousemove", localHandleMouseMove);
      document.removeEventListener("mouseup", localHandleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Calculate handle position for custom slider
  const handlePosition =
    ((SLIDER_MAX - sliderValue) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  return (
    <div
      style={{
        textAlign: "center",
        margin: "0 8px",
        height: `${sliderHeight}px`,
        width: "80px",
      }}
    >
      <div
        ref={sliderRef}
        style={{
          position: "relative",
          height: "100px",
          width: "100%",
          backgroundColor: "#eee",
          borderRadius: "4px",
          margin: "8px auto",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          overflow: "hidden", // Ensure the label doesn't overflow
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Large centered label in background */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",
            fontWeight: "bold",
            color: "rgba(0, 0, 0, 0.1)", // Very light text as watermark
            pointerEvents: "none", // Make it non-interactive
            userSelect: "none", // Prevent text selection
          }}
        >
          {label}
        </div>

        {/* Slider track - transparent background */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            borderRadius: "4px",
          }}
        />

        {/* Zero mark */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: "1px",
            backgroundColor: "#999",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-20px",
            top: "calc(50% - 8px)",
            fontSize: "12px",
            color: "#999",
          }}
        >
          0
        </div>

        {/* Slider handle */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${handlePosition}%`,
            width: "100%",
            height: "14px",
            transform: "translateY(-50%)",
            backgroundColor: isDragging ? "#1890ff" : "#91caff",
            borderRadius: "4px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
            transition: isDragging ? "none" : "top 0.2s",
          }}
        />
      </div>
      {/* Text input for manual value entry */}
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyPress={handleKeyPress}
        disabled={disabled}
        style={{
          marginTop: "8px",
          width: "100%",
          textAlign: "center",
        }}
      />
    </div>
  );
};

// --- VectorInput Component ---
interface VectorInputProps {
  label: string;
  values: [number, number, number];
  onChange: (newValues: [number, number, number]) => void;
  disabled?: boolean;
}

const VectorInput: React.FC<VectorInputProps> = ({
  label,
  values,
  onChange,
  disabled = false,
}) => {
  const [changeRates, setChangeRates] = useState<[number, number, number]>([
    0, 0, 0,
  ]);
  const intervalRef = useRef<number | null>(null);

  // Refs to store the latest values and rates for the interval callback
  const currentValuesRef = useRef<[number, number, number]>(values);
  const currentRatesRef = useRef<[number, number, number]>(changeRates);

  const handleChangeRate = useCallback((index: number, rate: number) => {
    setChangeRates((prevRates) => {
      const newRates = [...prevRates] as [number, number, number];
      newRates[index] = rate;
      return newRates;
    });
  }, []);

  // Update refs whenever values or rates change
  useEffect(() => {
    currentValuesRef.current = values;
  }, [values]);

  useEffect(() => {
    currentRatesRef.current = changeRates;
  }, [changeRates]);

  // Effect to handle continuous updates when a button is held
  useEffect(() => {
    // Check if any rate is non-zero
    const isActive = currentRatesRef.current.some((rate) => rate !== 0);

    if (isActive && intervalRef.current === null) {
      // Start the interval if active and not already running
      intervalRef.current = window.setInterval(() => {
        const currentValues = currentValuesRef.current;
        const rates = currentRatesRef.current;
        const newValues = [...currentValues] as [number, number, number];
        let changed = false;

        rates.forEach((rate, index) => {
          if (rate !== 0) {
            // Apply non-linear (cubic) scaling to the rate
            const scaledRate = Math.sign(rate) * Math.pow(Math.abs(rate), 3);
            // Apply change based on scaled rate and sensitivity
            newValues[index] += scaledRate * SLIDER_SENSITIVITY;
            changed = true;
          }
        });

        if (changed) {
          // Apply clamping to ensure values are between -1 and 1
          const clampedValues = [
            Math.max(
              SLIDER_MIN,
              Math.min(SLIDER_MAX, Number(newValues[0].toFixed(5)))
            ),
            Math.max(
              SLIDER_MIN,
              Math.min(SLIDER_MAX, Number(newValues[1].toFixed(5)))
            ),
            Math.max(
              SLIDER_MIN,
              Math.min(SLIDER_MAX, Number(newValues[2].toFixed(5)))
            ),
          ] as [number, number, number];

          // Call the parent onChange with the clamped values
          onChange(clampedValues);
        }
      }, SLIDER_REPEAT_INTERVAL);
    } else if (!isActive && intervalRef.current !== null) {
      // Stop the interval if inactive and running
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Cleanup function to clear interval on unmount or when dependencies change
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [changeRates, onChange, values]);

  return (
    <div style={{ marginBottom: "16px" }}>
      <Typography.Text strong>{label}</Typography.Text>
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          marginTop: "8px",
        }}
      >
        <VectorAxisSliderControl
          label="X"
          index={0}
          onChangeRate={handleChangeRate}
          value={values[0]}
          onChangeValue={(index, newValue) => {
            const newValues = [...values] as [number, number, number];
            newValues[index] = newValue;
            onChange(newValues);
          }}
          disabled={disabled}
        />
        <VectorAxisSliderControl
          label="Y"
          index={1}
          onChangeRate={handleChangeRate}
          value={values[1]}
          onChangeValue={(index, newValue) => {
            const newValues = [...values] as [number, number, number];
            newValues[index] = newValue;
            onChange(newValues);
          }}
          disabled={disabled}
        />
        <VectorAxisSliderControl
          label="Z"
          index={2}
          onChangeRate={handleChangeRate}
          value={values[2]}
          onChangeValue={(index, newValue) => {
            const newValues = [...values] as [number, number, number];
            newValues[index] = newValue;
            onChange(newValues);
          }}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default VectorInput;
