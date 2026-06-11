export const DEFAULT_MEASUREMENT_EMOJI_UNIFIED = "1f4cf";

export const MEASUREMENT_THUMBNAIL_URL =
  "https://wupp-digitaltwin-assets.cismet.de/v2/geoportal/thumbnails/measurements.png";

export type MeasurementSaveValues = {
  title: string;
  description: string;
  selectedUnified: string;
  clearAfterSave: boolean;
};

export const hashString = (input: string) => {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export const getUniqueTitle = (
  baseTitle: string,
  existingTitles: Set<string>
) => {
  if (!existingTitles.has(baseTitle)) {
    return baseTitle;
  }
  let counter = 1;
  while (existingTitles.has(`${baseTitle} (${counter})`)) {
    counter++;
  }
  return `${baseTitle} (${counter})`;
};

export const downloadMeasurementJsonFile = (
  fileName: string,
  data: unknown
) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
