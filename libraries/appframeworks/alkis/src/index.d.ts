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
  legalDesc?: string[] | null | undefined;
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
  foreName?: string;
  nameOfBirth?: string;
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
  beschriebRechtsgemeinschaft?: string | null;
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
  selectedFeature?: number | null;
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
  legalDesc?: string[] | null | undefined;
  nrCode: string;
}

interface CRS {
  type: string;
  properties: Record<string, unknown>;
}

interface GeoField {
  coordinates: Array<{
    crs: CRS;
    type: string;
  }>;
}

interface ExtendedGeom {
  geo_field: GeoField;
  id: number;
  landparcelCode: string;
  lfn: string;
}

interface AlkisBuchungsblattLandparcel {
  extended_geom: ExtendedGeom;
  landparcelcode: string;
  lfn: string;
  id;
}

export interface DataItem {
  alkis_buchungsblatt_landparcel: AlkisBuchungsblattLandparcel;
}

export interface AlkisFeature {
  type: string;
  id: number;
  geometry: {
    type: string;
    coordinates: any[];
  };
  properties: {
    id: number;
  };
  crs: CRS;
}

export interface ConfigPdfProduct {
  configurationAttribute: string;
  loadingAttribute: string;
  name: string;
  permission: string;
}

export interface BookingResData {
  res: {
    bezirkCode: string | null;
    bezirkName: string | null;
    blattart: string;
    blattartCode: string;
    buchungsblattCode: string;
    buchungsstellen: Array<object>;
    descriptionOfRechtsgemeinschaft: string[] | null;
    id: string;
    multiBuchungsblattUuids: string | null;
    namensnummern: Name[];
    offices: Office;
    owners: Owner[];
  };
}
