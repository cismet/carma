import type { SelectionMetaData } from "@carma-appframeworks/portals";
import { ENDPOINT, isAreaTypeWithGEP } from "@carma-commons/resources";
import type { SearchResultItem } from "@carma/types";

export const buildFloodingmapGazetteerSelection = (
  selection: SearchResultItem,
  timestampMs: number
): SearchResultItem & SelectionMetaData => ({
  ...selection,
  selectedFrom: "gazetteer",
  selectionTimestamp: timestampMs,
  isAreaSelection: isAreaTypeWithGEP(selection.type as ENDPOINT),
});
