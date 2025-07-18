import React, { useEffect, useMemo } from "react";
import { Cartesian3 } from "cesium";
import { useCesiumOverlay } from "../contexts/CesiumOverlayContext";
import { PointLabel } from "../components/PointLabel";

export interface PointLabelData {
  id: string;
  position: Cartesian3;
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
  const { addOverlayElement, removeOverlayElement, clearOverlayElements } = useCesiumOverlay();

  // Create a stable reference for selection, visibility, occlusion, and hidden state
  const stateSignature = useMemo(() => 
    points.map(p => `${p.id}:${p.text}:${p.selected}:${p.visible}:${p.isOccluded}:${p.isHidden}`).join('|'), 
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
        position: point.position,
        content: React.createElement(PointLabel, {
          text: point.text,
          selected: point.selected,
          isOccluded: point.isOccluded,
        }),
        visible: point.visible !== false,
        isHidden: point.isHidden, // Pass hidden state to overlay
      });
    });

    // Cleanup function to remove labels when component unmounts or points change
    return () => {
      points.forEach((point) => {
        removeOverlayElement(`point-label-${point.id}`);
      });
    };
  }, [points, showLabels, stateSignature, addOverlayElement, removeOverlayElement, clearOverlayElements]);
};