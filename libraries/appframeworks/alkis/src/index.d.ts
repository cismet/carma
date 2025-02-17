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

export interface Name {
  uuid: string;
  namensnummernUUIds?: string[];
  eigentuemerUUId?: string;
}

export interface Owner {
  ownerId: string;
}

export interface AlkisRendererProps {
  landparcelId: string;
  jwt: string;
}
