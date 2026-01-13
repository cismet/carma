import React, { createContext, useContext, useMemo, useState } from "react";

import { PointPrimitiveCollection } from "cesium";

import { FESTPUNKTE_WUPPERTAL } from "@carma-commons/resources";

import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import { useNivPoints } from "./hooks/useNivPoints";
import { TransformedNivPoint } from "./types/NivPointTypes";

interface CesiumNivPointContextType {
  showNivPoints: boolean;
  pointCollection?: PointPrimitiveCollection | null;
  setShowNivPoints: (show: boolean) => void;
  showHistoricNivPoints?: boolean;
  setShowHistoricNivPoints: (show: boolean) => void;
  nearestNivPoint?: TransformedNivPoint | null;
}

const CesiumNivPointContext = createContext<
  CesiumNivPointContextType | undefined
>(undefined);

interface CesiumNivPointProviderProps {
  children: React.ReactNode;
}

export const CesiumNivPointProvider: React.FC<CesiumNivPointProviderProps> = ({
  children,
}) => {
  const { viewer } = useCesiumViewer();

  const [showNivPoints, setShowNivPoints] = useState(true);
  const [showHistoricNivPoints, setShowHistoricNivPoints] = useState(false);

  const { pointCollection, nearestNivPoint } = useNivPoints(
    viewer?.scene ?? null,
    FESTPUNKTE_WUPPERTAL,
    showNivPoints,
    showHistoricNivPoints
  );

  const contextValue = useMemo(
    () => ({
      showNivPoints,
      pointCollection,
      setShowNivPoints,
      showHistoricNivPoints,
      setShowHistoricNivPoints,
      nearestNivPoint,
    }),
    [
      showNivPoints,
      pointCollection,
      setShowNivPoints,
      showHistoricNivPoints,
      setShowHistoricNivPoints,
      nearestNivPoint,
    ]
  );

  return (
    <CesiumNivPointContext.Provider value={contextValue}>
      {children}
    </CesiumNivPointContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCesiumNivPoints = (): CesiumNivPointContextType => {
  const context = useContext(CesiumNivPointContext);
  if (context === undefined) {
    throw new Error(
      "useCesiumNivPoint must be used within a CesiumNivPointProvider"
    );
  }
  return context;
};
