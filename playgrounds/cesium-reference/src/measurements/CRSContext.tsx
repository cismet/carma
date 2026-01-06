/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  FC,
  Dispatch,
} from "react";
import proj4 from "proj4";
import type { Converter } from "proj4/dist/lib/core";

export enum VerticalDatum {
  NHN2016 = "nhn2016",
  NHN = "nhn",
  NN = "nn",
}

export type VerticalDatumType = keyof typeof VerticalDatum;

export const verticalDatumLabels: Record<VerticalDatumType, [string, string]> =
  {
    NHN2016: ["NHN2016", "Normalhöhennull 2016"],
    NHN: ["NHN", "Normalhöhennull"],
    NN: ["NN", "Normalnull"],
  };

export enum CoordinateDisplayMode {
  Cartesian = "cartesian",
  Geographic = "geographic", // WGS84
  Cartographic = "cartographic", // generic cartographic coordinates
}

interface CRSContextType {
  geographicCRS: string;
  geographicCRSLabel: string;
  cartographicCRS: string;
  cartographicCRSLabel: string;
  verticalDatum: VerticalDatum;
  setVerticalDatum: Dispatch<VerticalDatum>;
  toCartographic: Converter;
  coordinateDisplayMode: CoordinateDisplayMode;
  setCoordinateDisplayMode: Dispatch<CoordinateDisplayMode>;
}

const CRSContext = createContext<CRSContextType | undefined>(undefined);

interface CRSContextProviderProps {
  children: React.ReactNode;
  coordinateDisplayMode?: CoordinateDisplayMode;
  cartographicCRS?: string;
  cartographicCRSLabel?: string;
  geographicCRS?: string;
  geographicCRSLabel?: string;
  verticalDatum?: VerticalDatum.NHN2016;
}

export const CRSContextProvider: FC<CRSContextProviderProps> = ({
  children,
  coordinateDisplayMode:
    coordinateDisplayModeProp = CoordinateDisplayMode.Cartographic,
  cartographicCRS = "EPSG:25832",
  cartographicCRSLabel = "UTM32",
  geographicCRS = "EPSG:4326",
  geographicCRSLabel = "WGS84",
  verticalDatum: verticalDatumProp = VerticalDatum.NHN2016,
}) => {
  const [verticalDatum, setVerticalDatum] =
    useState<VerticalDatum>(verticalDatumProp);

  const [coordinateDisplayMode, setCoordinateDisplayMode] =
    useState<CoordinateDisplayMode>(coordinateDisplayModeProp);

  const toCartographic = useMemo(
    () => proj4(geographicCRS, cartographicCRS),
    [geographicCRS, cartographicCRS]
  );

  const contextValue = useMemo(
    () => ({
      cartographicCRS,
      cartographicCRSLabel,
      geographicCRS,
      geographicCRSLabel,
      toCartographic,

      coordinateDisplayMode,
      setCoordinateDisplayMode,

      verticalDatum,
      setVerticalDatum,
    }),
    [
      cartographicCRS,
      cartographicCRSLabel,
      geographicCRS,
      geographicCRSLabel,
      toCartographic,

      coordinateDisplayMode,
      setCoordinateDisplayMode,

      verticalDatum,
      setVerticalDatum,
    ]
  );

  return (
    <CRSContext.Provider value={contextValue}>{children}</CRSContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCRS = (): CRSContextType => {
  const context = useContext(CRSContext);
  if (context === undefined) {
    throw new Error("useCRS must be used within a CRSContextProvider");
  }
  return context;
};

export default CRSContextProvider;
