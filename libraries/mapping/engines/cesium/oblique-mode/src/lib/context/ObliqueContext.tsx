import React, { createContext } from "react";

import type { FeatureCollection, Polygon } from "geojson";

import type { Radians, Meters } from "@carma/units/types";

import type {
  ExteriorOrientations,
  NearestObliqueImageRecord,
  ObliqueAnimationsConfig,
  ObliqueFootprintsStyle,
  ObliqueImagePreviewStyle,
  ObliqueImageRecordMap,
  SelectedImageRefreshFn,
} from "../types";
import type { TypedConverter } from "@carma/geo/proj";

import { FootprintProperties } from "../utils";
import { RBushBySectorBlocks } from "../utils";
import type { CardinalDirectionEnum } from "../utils";
import type { ObliquePreviewQuality } from "../constants";

export interface ObliqueContextType {
  isObliqueMode: boolean;
  toggleObliqueMode: () => void;
  converter: TypedConverter;

  imageRecords: ObliqueImageRecordMap | null;
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterPointsRBushByCardinals: RBushBySectorBlocks | null;

  selectedImage: NearestObliqueImageRecord | null;
  setSelectedImage: (image: NearestObliqueImageRecord | null) => void;
  selectedImageDistance: number | null;
  setSelectedImageDistance: (distance: number | null) => void;

  selectedImageRefresh: SelectedImageRefreshFn | null;
  setSelectedImageRefresh: (refresh: SelectedImageRefreshFn | null) => void;
  lockFootprint: boolean;
  setLockFootprint: (value: boolean) => void;
  suspendSelectionSearch: boolean;
  setSuspendSelectionSearch: (value: boolean) => void;

  isLoading: boolean;
  isAllDataReady: boolean;
  error: string | null;

  previewQualityLevel: ObliquePreviewQuality;
  previewPath: string;
  fixedPitch: Radians;
  fixedHeight: Meters;
  minFov: Radians;
  maxFov: Radians;
  headingOffset: Radians;

  animations: ObliqueAnimationsConfig;
  footprintsStyle: ObliqueFootprintsStyle;
  imagePreviewStyle: ObliqueImagePreviewStyle;

  // Known sibling lookup after visiting images
  knownSiblingIds: Record<
    string,
    Partial<Record<CardinalDirectionEnum, string>>
  >;
  prefetchSiblingPreview: (imageId: string, dir: CardinalDirectionEnum) => void;
  // Optional override for heading used in nearest-image computation (radians). One-shot.
  requestedHeadingRef: React.MutableRefObject<number | null>;
}

export const ObliqueContext = createContext<ObliqueContextType | null>(null);
