import React, { createContext, useContext, useState, useMemo } from "react";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import { useNivPoints } from "./hooks/useNivPoints";
import { FESTPUNKTE_WUPPERTAL } from "@carma-commons/resources";
import { Entity } from "cesium";

interface CesiumNivPointContextType {
  showNivPoints: boolean;
  nivPointEntities?: Entity[];
  setShowNivPoints: (show: boolean) => void;
  showHistoricNivPoints?: boolean;
  setShowHistoricNivPoints: (show: boolean) => void;
  nearestNivPoint?: Entity;
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

  const { entities: nivPointEntities, nearestNivPoint } = useNivPoints(
    viewer,
    FESTPUNKTE_WUPPERTAL,
    showNivPoints,
    showHistoricNivPoints
  );

  const contextValue = useMemo(
    () => ({
      showNivPoints,
      nivPointEntities,
      setShowNivPoints,
      showHistoricNivPoints,
      setShowHistoricNivPoints,
      nearestNivPoint,
    }),
    [
      showNivPoints,
      nivPointEntities,
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
