export default function klimaortTitleFactory({ featureCollectionContext }) {
  const getThemaById = (id) => {
    const result = featureCollectionContext?.items?.find(
      (item) => item?.thema?.id === id
    );
    return result?.thema?.name;
  };

  let desc = "?";

  if (
    featureCollectionContext?.filteredItems?.length ===
    featureCollectionContext?.items?.filter((item) => item.typ === "ort").length //there are more items than just orte
  ) {
    desc = undefined;
  } else if (featureCollectionContext?.filterMode === "themen") {
    if (featureCollectionContext?.filterState?.themen?.length <= 2) {
      const themenIds = featureCollectionContext?.filterState?.themen;
      const themen = [];
      for (const id of themenIds) {
        themen.push(getThemaById(id));
      }

      desc = "nach Themen gefiltert (nur " + themen.join(", ") + ")";
    } else {
      desc =
        "nach Themen gefiltert (" +
        featureCollectionContext?.filterState?.themen?.length +
        " Themen)";
    }
  } else if (featureCollectionContext?.filterMode === "kategorien") {
    if (featureCollectionContext?.filterState?.kategorien?.length <= 3) {
      desc =
        "nach Kategorien gefiltert (nur " +
        featureCollectionContext?.filterState?.kategorien?.join(", ") +
        ")";
    } else {
      desc =
        "nach Kategorien gefiltert (" +
        featureCollectionContext?.filterState?.kategorien?.length +
        " Kategorien)";
    }
  }
  if (desc) {
    if (featureCollectionContext?.filteredItems?.length === 0) {
      return (
        <span>
          <b>Keine Klimaorte gefunden!</b> Bitte überprüfen Sie Ihre
          Filtereinstellungen.
        </span>
      );
    } else {
      return (
        <span>
          <b>Meine Klimaorte:</b> {desc}
        </span>
      );
    }
  } else {
    return (
      <span>
        <b>Klimaorte in Wuppertal</b> {desc}
      </span>
    );
  }
}
