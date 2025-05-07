import React from "react";
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

// Styled components for internal elements
import { styled } from "styled-components";

const SliderGroup = styled.div`
  margin-bottom: 15px;
  padding-top: 5px;

  .ant-slider-track {
    background-color: #1890ff;
  }

  .ant-slider-handle {
    border-color: #1890ff;
  }
`;

const SliderLabel = styled.div`
  color: #333;
  margin-bottom: 5px;
  display: flex;
  justify-content: space-between;
  font-weight: 500;
`;

const SliderValue = styled.span`
  color: #1890ff;
  font-weight: bold;
`;

interface ControlButtonProps {
  primary?: boolean;
}

const ControlButton = styled.button<ControlButtonProps>`
  background: ${(props) => (props.primary ? "#1890ff" : "white")};
  color: ${(props) => (props.primary ? "white" : "#333")};
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 4px 8px;
  margin-right: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.015);

  &:hover {
    background: ${(props) => (props.primary ? "#40a9ff" : "#f5f5f5")};
    border-color: ${(props) => (props.primary ? "#40a9ff" : "#d9d9d9")};
  }

  &:active {
    background: ${(props) => (props.primary ? "#096dd9" : "#e6e6e6")};
  }
`;

const ButtonRow = styled.div`
  display: flex;
  margin-bottom: 10px;
`;

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
          <ButtonRow>
            <ControlButton primary={showImages} onClick={onToggleImages}>
              {showImages ? "Hide Images" : "Show Images"}
            </ControlButton>
            <ControlButton primary={showLabels} onClick={onToggleLabels}>
              {showLabels ? "Hide Labels" : "Show Labels"}
            </ControlButton>
            <ControlButton
              primary={offsetImages}
              onClick={onToggleOffsetImages}
            >
              {offsetImages
                ? "Center on Ground Points"
                : "Center on Capture Points"}
            </ControlButton>
          </ButtonRow>

          <SliderGroup>
            <SliderLabel>
              <span>Image Width</span>
              <SliderValue>{imageWidth}px</SliderValue>
            </SliderLabel>
            <Slider
              min={64}
              max={400}
              value={imageWidth}
              onChange={(value) => onImageWidthChange(value as number)}
            />
          </SliderGroup>

          <SliderGroup>
            <SliderLabel>
              <span>Image Height</span>
              <SliderValue>{imageHeight}px</SliderValue>
            </SliderLabel>
            <Slider
              min={64}
              max={400}
              value={imageHeight}
              onChange={(value) => onImageHeightChange(value as number)}
            />
          </SliderGroup>

          <SliderGroup>
            <SliderLabel>
              <span>Crop Width Factor</span>
              <SliderValue>{cropWidthFactor}%</SliderValue>
            </SliderLabel>
            <Slider
              min={100}
              max={800}
              value={cropWidthFactor}
              onChange={(value) => onCropWidthFactorChange(value as number)}
            />
          </SliderGroup>

          <SliderGroup>
            <SliderLabel>
              <span>Crop Height Factor</span>
              <SliderValue>{cropHeightFactor}%</SliderValue>
            </SliderLabel>
            <Slider
              min={100}
              max={800}
              value={cropHeightFactor}
              onChange={(value) => onCropHeightFactorChange(value as number)}
            />
          </SliderGroup>

          <div style={{ marginTop: "15px", marginBottom: "5px" }}>
            <SliderLabel>
              <span>Image Rotation</span>
            </SliderLabel>

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
