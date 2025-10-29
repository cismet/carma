import {
  FeatureInfo,
  FeatureInfoProperties,
} from "../../../../../types/src/index.ts";
/**
 * @deprecated Use `objectToInfo` instead.
 */
export declare const objectToFeature: (
  jsonOutput: any,
  code: string
) => Promise<
  | FeatureInfo
  | {
      properties: {
        wmsProps: any;
        header?: string;
        headerColor?: string;
        title: string;
        subtitle?: string;
        additionalInfo?: string;
        email?: string;
        tel?: string;
        url?: string;
        genericLinks?: {
          url: string;
          tooltip: string;
          icon: JSX.Element;
          target?: string;
        }[];
      };
    }
>;
export declare const objectToInfo: (
  jsonOutput: any,
  code: string
) => Promise<FeatureInfoProperties | undefined>;
/**
 * @deprecated Use `functionToInfo` instead.
 */
export declare const functionToFeature: (
  output: any,
  code: string
) => Promise<
  | {
      properties: {
        wmsProps: any;
        header?: string;
        headerColor?: string;
        title: string;
        subtitle?: string;
        additionalInfo?: string;
        email?: string;
        tel?: string;
        url?: string;
        genericLinks?: {
          url: string;
          tooltip: string;
          icon: JSX.Element;
          target?: string;
        }[];
      };
    }
  | undefined
>;
export declare const functionToInfo: (
  output: any,
  code: string
) => Promise<FeatureInfoProperties | undefined>;
export declare const createUrl: ({
  baseUrl,
  layerName,
  viewportBbox,
  viewportWidth,
  viewportHeight,
  x,
  y,
}: {
  baseUrl: string;
  layerName: string;
  viewportBbox: {
    left: number;
    bottom: number;
    right: number;
    top: number;
  };
  viewportWidth: number;
  viewportHeight: number;
  x: number;
  y: number;
}) => string;
export declare const createVectorFeature: (
  mapping: any,
  selectedVectorFeature: any
) => Promise<any>;
export declare const getInfoBoxControlObjectFromMappingAndVectorFeature: ({
  mapping,
  selectedVectorFeature,
}: {
  mapping?: never[] | undefined;
  selectedVectorFeature: any;
}) => Promise<FeatureInfoProperties | undefined>;
