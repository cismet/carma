import { type CSSProperties } from "react";
import { Slider, Collapse } from "antd";
import type { CollapseProps } from "antd";

interface ControlPanelProps {
  showImages: boolean;
  onToggleImages: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  offsetImages: boolean;
  onToggleOffsetImages: () => void;
  imageWidth: number;
  onImageWidthChange: (width: number) => void;
  imageHeight: number;
  onImageHeightChange: (height: number) => void;
  cropWidthFactor: number;
  onCropWidthFactorChange: (factor: number) => void;
  cropHeightFactor: number;
  onCropHeightFactorChange: (factor: number) => void;
  imageRotation: number;
  onImageRotationChange: (rotation: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// Reusable styles
const sliderGroupStyle: CSSProperties = {
  marginBottom: "15px",
  paddingTop: "5px",
};

const sliderLabelStyle: CSSProperties = {
  color: "#333",
  marginBottom: "5px",
  display: "flex",
  justifyContent: "space-between",
  fontWeight: "500",
};

const sliderValueStyle: CSSProperties = {
  color: "#1890ff",
  fontWeight: "bold",
};

const getControlButtonStyle = (primary?: boolean): CSSProperties => ({
  background: primary ? "#1890ff" : "white",
  color: primary ? "white" : "#333",
  border: "1px solid #d9d9d9",
  borderRadius: "4px",
  padding: "4px 8px",
  marginRight: "8px",
  marginBottom: "8px",
  cursor: "pointer",
  fontSize: "12px",
  transition: "all 0.3s ease",
  boxShadow: "0 2px 0 rgba(0, 0, 0, 0.015)",
});

export const ObliqueControlPanel: React.FC<ControlPanelProps> = ({
  showImages,
  onToggleImages,
  showLabels,
  onToggleLabels,
  offsetImages,
  onToggleOffsetImages,
  imageWidth,
  onImageWidthChange,
  imageHeight,
  onImageHeightChange,
  cropWidthFactor,
  onCropWidthFactorChange,
  cropHeightFactor,
  onCropHeightFactorChange,
  imageRotation,
  onImageRotationChange,
  isCollapsed,
  onToggleCollapse,
}) => {
  // Items for the Collapse component
  const items: CollapseProps["items"] = [
    {
      key: "1",
      label: "Image Controls",
      children: (
        <>
          <div style={{ display: "flex", marginBottom: "10px" }}>
            <button
              style={getControlButtonStyle(showImages)}
              onClick={onToggleImages}
            >
              {showImages ? "Hide Images" : "Show Images"}
            </button>
            <button
              style={getControlButtonStyle(showLabels)}
              onClick={onToggleLabels}
            >
              {showLabels ? "Hide Labels" : "Show Labels"}
            </button>
            <button
              style={getControlButtonStyle(offsetImages)}
              onClick={onToggleOffsetImages}
            >
              {offsetImages
                ? "Center on Ground Points"
                : "Center on Capture Points"}
            </button>
          </div>

          <div style={sliderGroupStyle}>
            <div style={sliderLabelStyle}>
              <span>Image Width</span>
              <span style={sliderValueStyle}>{imageWidth}px</span>
            </div>
            <Slider
              min={64}
              max={400}
              value={imageWidth}
              onChange={(value) => onImageWidthChange(value as number)}
            />
          </div>

          <div style={sliderGroupStyle}>
            <div style={sliderLabelStyle}>
              <span>Image Height</span>
              <span style={sliderValueStyle}>{imageHeight}px</span>
            </div>
            <Slider
              min={64}
              max={400}
              value={imageHeight}
              onChange={(value) => onImageHeightChange(value as number)}
            />
          </div>

          <div style={sliderGroupStyle}>
            <div style={sliderLabelStyle}>
              <span>Crop Width Factor</span>
              <span style={sliderValueStyle}>{cropWidthFactor}%</span>
            </div>
            <Slider
              min={100}
              max={800}
              value={cropWidthFactor}
              onChange={(value) => onCropWidthFactorChange(value as number)}
            />
          </div>

          <div style={sliderGroupStyle}>
            <div style={sliderLabelStyle}>
              <span>Crop Height Factor</span>
              <span style={sliderValueStyle}>{cropHeightFactor}%</span>
            </div>
            <Slider
              min={100}
              max={800}
              value={cropHeightFactor}
              onChange={(value) => onCropHeightFactorChange(value as number)}
            />
          </div>

          <div style={{ marginTop: "15px", marginBottom: "5px" }}>
            <div style={sliderLabelStyle}>
              <span>Image Rotation</span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-around",
                marginTop: "8px",
              }}
            >
              {[0, 90, 180, 270].map((angle) => (
                <div
                  key={angle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    id={`rotation-${angle}`}
                    name="imageRotation"
                    value={angle}
                    checked={imageRotation === angle}
                    onChange={() => onImageRotationChange(angle)}
                    style={{ cursor: "pointer" }}
                  />
                  <label
                    htmlFor={`rotation-${angle}`}
                    style={{ marginLeft: "4px", cursor: "pointer" }}
                  >
                    {angle}°
                  </label>
                </div>
              ))}
            </div>
          </div>
        </>
      ),
    },
  ];

  return (
    <Collapse
      activeKey={isCollapsed ? [] : ["1"]}
      onChange={onToggleCollapse}
      items={items}
      style={{
        width: "300px",
        background: "rgba(255, 255, 255, 0.9)",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    />
  );
};

export default ObliqueControlPanel;
