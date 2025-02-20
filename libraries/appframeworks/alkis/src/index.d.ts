import React, { CSSProperties, ReactNode } from "react";
import { Card, CardProps } from "antd";

interface CustomCardProps extends CardProps {
  fullHeight?: boolean;
  title: ReactNode;
  extra?: ReactNode;
  style?: CSSProperties;
  children?: ReactNode;
}

interface TaskParams {
  ALKIS_CODE: string;
  PRODUKT?: string;
  STICHTAG?: string;
}

export interface TaskParameters {
  parameters: TaskParams;
}

// export interface Name {
//   uuid: string;
//   namensnummernUUIds?: string[];
//   eigentuemerUUId?: string;
// }

export interface AdditionalSheetProps {
  owners: Owner[];
  namesArr: Name[];
  legalDesc?: string;
}

export interface Address {
  houseNumber: string;
  postalCode: string;
  city: string;
  street: string;
}

export interface Owner {
  salutation: string;
  firstName?: string;
  surName: string;
  dateOfBirth: string;
  nameNumber: string;
  addresses: Address[];
}

interface Name {
  uuid: string;
  namenummernUUIds?: string[];
  namensnummernUUIds?: string[];
  eigentuemerUUId?: string;
  nenner?: string | number;
  zaehler?: string | number;
  artRechtsgemeinschaft?: string;
}

export interface Owner {
  ownerId: string;
}

export interface AlkisRendererProps {
  landparcelId: string;
  jwt: string;
}

export interface AlkisBookingSheetRendererProps {
  id: string;
  jwt: string;
  flurstueck: string;
}

export interface MapExtractorResult {
  homeCenter: number[];
  homeZoom: number;
  featureCollection: any[];
  styler: (feature: any) => {
    fillColor: string;
    fillOpacity: number;
    color: string;
    weight: number;
  };
  allFeatures?: any[];
}

export interface MapProps<T> {
  dataIn: T;
  extractor?: (input: T) => MapExtractorResult;
}

export interface LandparcelInfoProps {
  title: string;
  name: string;
  gemarkung: string;
  addresses: Addresses[];
  size: number;
  extendedGeom: any;
  sheetsCode: SheetsCode[];
  alkisId: string;
  setIsLoading?: React.Dispatch<React.SetStateAction<boolean>>;
  isLoading: string;
}

interface Addresses {
  alkis_adresse: {
    nummer: string;
    strasse: string;
  };
}

interface SheetsCode {
  buchungsblattcode: string;
  content: AdditionalSheetContent;
}

interface AdditionalSheetContent {
  owners: Owner[];
  namesArr: Name[];
  legalDesc?: string;
  nrCode: string;
}
