import { nanoid } from "@reduxjs/toolkit";
import { fetchNutzungStammdaten } from "./api";

let stammdatenCache;

export const loadUsageStammdaten = async (jwt) => {
  if (!stammdatenCache) {
    stammdatenCache = await fetchNutzungStammdaten(jwt);
  }
  return stammdatenCache;
};

export const newUsageRow = () => ({
  id: nanoid(),
  anlageklasseId: undefined,
  nutzungsartId: undefined,
  flaeche: null,
  quadratmeterpreis: null,
});

export const gesamtpreis = (row) =>
  Number.isFinite(row.flaeche) && Number.isFinite(row.quadratmeterpreis)
    ? row.flaeche * row.quadratmeterpreis
    : null;
