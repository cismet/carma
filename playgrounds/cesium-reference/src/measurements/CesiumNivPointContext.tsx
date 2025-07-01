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
  verticalDatum: "nhn2016" | "nhn" | "nn";
  setVerticalDatum: (datum: "nhn2016" | "nhn" | "nn") => void;
  nearestNivPoint?: Entity;
}

const CesiumNivPointContext = createContext<
  CesiumNivPointContextType | undefined
>(undefined);

interface CesiumNivPointProviderProps {
  children: React.ReactNode;
  verticalDatum?: "nhn2016" | "nhn" | "nn";
}

export const CesiumNivPointProvider: React.FC<CesiumNivPointProviderProps> = ({
  children,
  verticalDatum: verticalDatumProp,
}) => {
  const { viewer } = useCesiumViewer();

  const verticalDatumInit = verticalDatumProp ?? "nhn2016";

  const [verticalDatum, setVerticalDatum] = useState<"nhn2016" | "nhn" | "nn">(
    verticalDatumInit
  );

  const [showNivPoints, setShowNivPoints] = useState(true);
  const [showHistoricNivPoints, setShowHistoricNivPoints] = useState(false);

  const { entities: nivPointEntities, nearestNivPoint } = useNivPoints(
    viewer,
    FESTPUNKTE_WUPPERTAL,
    showNivPoints,
    verticalDatum,
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
      verticalDatum,
      setVerticalDatum,
    }),
    [
      showNivPoints,
      nivPointEntities,
      setShowNivPoints,
      showHistoricNivPoints,
      setShowHistoricNivPoints,
      verticalDatum,
      nearestNivPoint,
      setVerticalDatum,
    ]
  );

  return (
    <CesiumNivPointContext.Provider value={contextValue}>
      {children}
    </CesiumNivPointContext.Provider>
  );
};

export const useCesiumNivPoints = (): CesiumNivPointContextType => {
  const context = useContext(CesiumNivPointContext);
  if (context === undefined) {
    throw new Error(
      "useCesiumNivPoint must be used within a CesiumNivPointProvider"
    );
  }
  return context;
};
