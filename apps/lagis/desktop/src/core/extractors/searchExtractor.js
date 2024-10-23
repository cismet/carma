export function searchContractExtractor(
  contractFlurstuckeArr,
  mipaFlurstuckeArr
) {
  // console.log("search extractor mipa", mipaFlurstuckeArr);
  // console.log("search extractor contract", contractFlurstuckeArr);
  if (contractFlurstuckeArr === undefined || mipaFlurstuckeArr === undefined) {
    return [];
  } else {
    const addedFstck = new Set();

    const updatedContractArr = contractFlurstuckeArr.map((c) => {
      const fstck = c.flurstueck_schluessel;
      const gemarkung = fstck.gemarkung.bezeichnung;
      const flur = fstck.flur;
      const nennerZaehler = `${fstck.flurstueck_zaehler}-${fstck.flurstueck_nenner}`;
      const fstckString = `${gemarkung} ${flur} ${fstck.flurstueck_zaehler}/${fstck.flurstueck_nenner}`;
      const searchParamsObj = {
        gem: gemarkung,
        flur: flur,
        fstck: nennerZaehler,
      };
      const iconType = fstck.flurstueck_art.bezeichnung;
      const ifHistorical = fstck.gueltig_bis;
      addedFstck.add(fstckString);
      return {
        id: c.id,
        content: fstckString,
        searchParamsObj,
        gemarkung: gemarkung,
        flur: flur,
        color: getColorForSearchResults(iconType, ifHistorical ? true : false),
        iconType: iconType === "städtisch" ? "bank" : "block",
        ifHistorical: ifHistorical ? true : false,
      };
    });
    mipaFlurstuckeArr.forEach((m) => {
      const gemarkung = m.gemarkung;
      const flur = m.flur;
      const fstckString = `${gemarkung} ${flur} ${m.flurstueck_zaehler}/${m.flurstueck_nenner}`;
      if (!addedFstck.has(fstckString)) {
        const iconType = m.flurstueck_art;

        const mipaObj = {
          id: m.id,
          content: fstckString,
          searchParamsObj: {
            gem: gemarkung,
            flur: flur,
            fstck: `${m.flurstueck_zaehler}-${m.flurstueck_nenner}`,
          },
          gemarkung: gemarkung,
          flur: flur,
          color: getColorForSearchResults(iconType, m.historisch),
          iconType: iconType === "städtisch" ? "bank" : "block",
          ifHistorical: m.historisch,
        };
        updatedContractArr.push(mipaObj);
      }
    });
    updatedContractArr.sort((a, b) => {
      const gemarkungA = a.gemarkung.toUpperCase();
      const gemarkungB = b.gemarkung.toUpperCase();
      if (gemarkungA < gemarkungB) {
        return -1;
      }
      if (gemarkungA > gemarkungB) {
        return 1;
      }
      const flurA = parseInt(a.flur, 10);
      const flurB = parseInt(b.flur, 10);
      return flurA - flurB;
    });

    const debagArr = updatedContractArr.filter((f) => f.id === 20994);

    const debagArrContent = updatedContractArr.filter(
      (f) => f.content === "Barmen 308 29/0"
    );

    return updatedContractArr;
  }
}

function getColorForSearchResults(iconType, historisch) {
  let color = "lightgrey";
  if (historisch === false && iconType === "städtisch") {
    color = "black";
  } else if (historisch === false && iconType === "Abteilung IX") {
    color = "purple";
  }

  return color;
}
