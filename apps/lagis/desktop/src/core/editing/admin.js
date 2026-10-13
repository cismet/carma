import { planarArea } from "../wizard/geometry";

const round2 = (number) => Math.round(number * 100) / 100;

export const parcelAreaOf = (geometry) =>
  geometry ? round2(planarArea(geometry)) : undefined;

// A single Dienststelle manages the whole parcel; with more, a row only has
// the area drawn for it.
export const dienststelleArea = (row, rowCount, parcelArea) => {
  if (rowCount === 1) {
    return parcelArea ?? null;
  }
  return row.geometry ? round2(planarArea(row.geometry)) : 0;
};

const withoutArea = ({ flaeche, ...row }) => row;

// Stored areas are only recomputed when the Dienststellen change, otherwise
// small differences to the stored values would add a history entry on
// every save.
export const withDienststelleAreas = (draft, original, parcelArea) => {
  const rows = draft.dienststellen;
  const unchanged =
    JSON.stringify(rows.map(withoutArea)) ===
    JSON.stringify(original.dienststellen.map(withoutArea));
  if (unchanged) {
    return { ...draft, dienststellen: original.dienststellen };
  }
  return {
    ...draft,
    dienststellen: rows.map((row) => ({
      ...row,
      flaeche: dienststelleArea(row, rows.length, parcelArea),
    })),
  };
};
