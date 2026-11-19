/** blue while the ribbon is open, black while it is not */
export const MEASUREMENT3D_ICON_COLOR = { open: "#1677ff", closed: "#000000" };

export const MEASUREMENT3D_TEXT = Object.freeze({
  title: {
    empty: "3D-Messungen",
    singular: "3D-Messung",
    plural: "3D-Messungen",
  },
  tools: "Messwerkzeuge",
});

export const resolveMeasurement3dTitle = (count: number) =>
  count > 0
    ? `${count} ${
        count > 1
          ? MEASUREMENT3D_TEXT.title.plural
          : MEASUREMENT3D_TEXT.title.singular
      }`
    : MEASUREMENT3D_TEXT.title.empty;
