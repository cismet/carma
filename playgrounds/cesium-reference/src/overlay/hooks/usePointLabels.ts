import React, { useEffect, useMemo } from "react";
import { Cartesian3 } from "cesium";
import { useCesiumOverlay } from "../contexts/CesiumOverlayContext";
import { PointLabel } from "../components/PointLabel";

export interface PointLabelData {
  id: string;
  getCanvasPosition?: () => { x: number; y: number } | null; // Callback to get fresh screen coordinates
  getLocalUpVector?: () => { x: number; y: number } | null; // Local up vector in screen space
  text: string;
  selected?: boolean;
  visible?: boolean;
  isOccluded?: boolean;
  isHidden?: boolean; // Hidden (outside viewport) vs occluded (behind geometry)
}

export const usePointLabels = (
  points: PointLabelData[],
  showLabels: boolean = true
) => {
  const { addOverlayElement, removeOverlayElement, clearOverlayElements } =
    useCesiumOverlay();

  // Create a stable reference for selection, visibility, occlusion, and hidden state
  const stateSignature = useMemo(
    () =>
      points
        .map(
          (p) =>
            `${p.id}:${p.text}:${p.selected}:${p.visible}:${p.isOccluded}:${p.isHidden}`
        )
        .join("|"),
    [points]
  );

  useEffect(() => {
    if (!showLabels) {
      clearOverlayElements();
      return;
    }

    // Add/update labels for all points using the React PointLabel component
    points.forEach((point) => {
      const labelId = `point-label-${point.id}`;

      addOverlayElement({
        id: labelId,
        getCanvasPosition: point.getCanvasPosition,
        getLocalUpVector: point.getLocalUpVector,
        content: React.createElement(PointLabel, {
          text: point.text,
          selected: point.selected,
          isOccluded: point.isOccluded,
        }),
        visible: point.visible !== false,
        isHidden: point.isHidden, // Pass hidden state to overlay
        renderCustom: (ctx, anchorPos, upVector) => {
          // Custom rendering: dot at measurement point + hairline + offset label
          const labelOffset = { x: 20, y: -20 }; // 20px right, 20px up
          
          // If we have an up vector, use it to position the label more naturally
          if (upVector) {
            // Position label 30px away in the up direction + 20px right
            labelOffset.x = upVector.x * 30 + 20;
            labelOffset.y = upVector.y * 30 - 20;
          }
          
          const labelPos = {
            x: anchorPos.x + labelOffset.x,
            y: anchorPos.y + labelOffset.y
          };
          
          // Set styles
          ctx.strokeStyle = point.selected ? '#1890ff' : '#666';
          ctx.fillStyle = point.selected ? '#1890ff' : '#333';
          ctx.lineWidth = 1;
          
          // Draw measurement dot at anchor position
          ctx.beginPath();
          ctx.arc(anchorPos.x, anchorPos.y, 3, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw hairline from anchor to label position
          ctx.beginPath();
          ctx.moveTo(anchorPos.x, anchorPos.y);
          ctx.lineTo(labelPos.x, labelPos.y);
          ctx.stroke();
          
          // The React component will be positioned at labelPos automatically
          // by the overlay system using transform
        }
      });
    });

    // Cleanup function to remove labels when component unmounts or points change
    return () => {
      points.forEach((point) => {
        removeOverlayElement(`point-label-${point.id}`);
      });
    };
  }, [
    points,
    showLabels,
    stateSignature,
    addOverlayElement,
    removeOverlayElement,
    clearOverlayElements,
  ]);
};
