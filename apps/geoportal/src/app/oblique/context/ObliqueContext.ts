import { createContext, type MutableRefObject } from "react";

import type { FeatureCollection, Polygon } from "geojson";

import type { Radians } from "@carma-geo/data-structures";

import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import type {
  ExteriorOrientations,
  NearestObliqueImageRecord,
  ObliqueAnimationsConfig,
  ObliqueFootprintsStyle,
  ObliqueImagePreviewStyle,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";
import type { FootprintProperties } from "../utils/footprintUtils";
import type { CardinalDirectionEnum } from "../utils/orientationUtils";
import type { RBushBySectorBlocks } from "../utils/spatialIndexing";

export interface ObliqueContextType {
  isObliqueMode: boolean;
  toggleObliqueMode: () => void;
  converter: Proj4Converter;

  isPreviewVisible: boolean;
  setPreviewVisible: (visible: boolean) => void;

  imageRecords: ObliqueImageRecordMap | null;
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterpointsRBushByCardinals: RBushBySectorBlocks | null;

  selectedImage: NearestObliqueImageRecord | null;
  setSelectedImage: (image: NearestObliqueImageRecord | null) => void;
  selectedImageDistanceRef: MutableRefObject<number | null>;
  lockFootprint: boolean;
  setLockFootprint: (value: boolean) => void;
  suspendSelectionSearch: boolean;
  setSuspendSelectionSearch: (value: boolean) => void;

  isLoading: boolean;
  isAllDataReady: boolean;
  error: string | null;

  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY;
  downloadQualityLevel?: OBLIQUE_PREVIEW_QUALITY;
  previewPath: string;
  fixedPitch: number;
  fixedHeight: number;
  minFov: Radians;
  maxFov: Radians;
  targetEnterObliqueModeFov?: Radians;
  restoreFovOnLeave?: Radians;
  headingOffset: number;

  animations: ObliqueAnimationsConfig;
  footprintsStyle: ObliqueFootprintsStyle;
  imagePreviewStyle: ObliqueImagePreviewStyle;

  knownSiblingIds: Record<
    string,
    Partial<Record<CardinalDirectionEnum, string>>
  >;
  prefetchSiblingPreview: (imageId: string, dir: CardinalDirectionEnum) => void;
  requestedHeadingRef: MutableRefObject<number | null>;
}

export const ObliqueContext = createContext<ObliqueContextType | null>(null);
