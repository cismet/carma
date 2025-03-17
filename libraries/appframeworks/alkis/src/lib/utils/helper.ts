import { Name, Owner } from "../..";

export const getLandparcelTitle = (
  alkisId,
  flur,
  fstck_nenner,
  fstck_zaehler
) => {
  const gemarkung = alkisId.split("-")[0];
  const nenner = parseInt(fstck_nenner, 10);
  const zaehler = parseInt(fstck_zaehler, 10);
  const fullFstck = nenner ? `${zaehler}/${nenner}` : zaehler;
  const title = `Flurstück ${fullFstck} - Flur ${flur} - Gemarkung ${gemarkung}`;

  return title;
};

export const buildGroupedOwnersArr = (namesArr: Name[], owners: Owner[]) => {
  const uuidList: string[] = namesArr.map((n) => n.uuid);
  const existingsUids = namesArr.map((item) => {
    if (item.namensnummernUUIds) {
      return item.namensnummernUUIds;
    } else {
      return [item.uuid];
    }
  });

  let result: string[][] = [];

  existingsUids.forEach((innerArray) => {
    let res: string[] = [];
    innerArray.forEach((uuid) => {
      const matchingObject = namesArr.filter((obj) => obj.uuid === uuid);
      if (matchingObject) {
        const withOwnerId = matchingObject.map((n) => {
          if (n.eigentuemerUUId) {
            return n.eigentuemerUUId;
          } else {
            return "";
          }
        });
        res.push(withOwnerId[0]);
      }
    });

    result.push(res);
  });

  const ownerRes: Owner[][] = [];

  result.forEach((innerArray) => {
    let res: Owner[] = [];
    innerArray.forEach((uuid) => {
      const matchingObject = owners.filter((obj) => obj.ownerId === uuid);
      if (matchingObject) {
        res.push(matchingObject[0]);
      }
    });

    ownerRes.push(res);
  });

  return ownerRes;
  // return ownerRes.slice(0, -1);
};

export const getLandRegisterDistrict = (code) => {
  const codeFirstNumber = code.split("-")[0];
  const districtNamesMap = {
    "053001": "Barmen",
    "053485": "Beyenburg",
    "053279": "Cronenberg",
    "053278": "Dönberg",
    "053135": "Elberfeld",
    "051329": "Gennebreck",
    "051310": "Gevelsberg",
    "051330": "Haßlinghausen",
    "053486": "Langerfeld",
    "053263": "Lennep",
    "053264": "Lüttringhausen",
    "053487": "Nächstebreck",
    "053422": "Oberdüssel",
    "054241": "Radevormwald",
    "053267": "Ronsdorf",
    "051339": "Schwelm",
    "053276": "Schöller",
    "053277": "Vohwinkel",
  };

  const districtName = districtNamesMap[codeFirstNumber];
  return `${districtName} (${codeFirstNumber})`;
};

export const getAdditionalTextForBooking = (newInfos, bookingType) => {
  const number = newInfos.number;
  const fratcion = newInfos.fraction;
  const bookingTypeLandparcel = newInfos.buchungsart;

  let newText = "";

  if (
    bookingTypeLandparcel &&
    (bookingTypeLandparcel !== bookingType || fratcion || number)
  ) {
    newText += ` (`;

    if (bookingTypeLandparcel && bookingTypeLandparcel !== bookingType) {
      newText += `${bookingTypeLandparcel}, `;
    }

    if (fratcion) {
      newText += "Anteil " + fratcion;
    }

    if (number) {
      newText += ", ATP Nr. " + number;
    }

    newText += `)`;
  }

  return newText;
};

export const getBookingByLandparcelCode = (landparcelCode, buchungsstellen) =>
  buchungsstellen.filter(
    (b) =>
      b.buchungsstellen?.[0]?.landParcel?.[0]?.landParcelCode === landparcelCode
  );

export const bookingColors = [
  "#2956B2",
  "#659CEF",
  "#7DBD00",
  "#DCF600",
  "#FF5B00",
];

export const stylerGeometrienStyle = (feature) => {
  const color = bookingColors[feature.properties.id % bookingColors.length];

  const style = {
    fillColor: color,
    fillOpacity: 0.6,
    color: "#000000",
    weight: 0.4,
  };

  return style;
};

export const FLURSTUECKSNACHWEIS_PDF =
  "custom.alkis.product.flurstuecksnachweis";
export const FLURSTUECKS_UND_EIGENTUMSNACHWEIS_NRW_PDF =
  "custom.alkis.product.flurstuecks_eigentumsnachweis_nrw";

export const FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_INTERN_PDF =
  "custom.alkis.product.flurstuecks_eigentumsnachweis_kom_intern";
export const FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_INTERN_HTML =
  "custom.alkis.product.flurstuecks_eigentumsnachweis_kom_intern";

export const FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_PDF =
  "custom.alkis.product.flurstuecks_eigentumsnachweis_kom";
export const FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_HTML =
  "custom.alkis.product.flurstuecks_eigentumsnachweis_kom";

export const BESTANDSNACHWEIS_KOMMUNAL_PDF =
  "custom.alkis.product.bestandsnachweis_kom";
export const BESTANDSNACHWEIS_KOMMUNAL_HTML =
  "custom.alkis.product.bestandsnachweis_kom";

export const BESTANDSNACHWEIS_KOMMUNAL_INTERN_PDF =
  "custom.alkis.product.bestandsnachweis_kom_intern";
export const BESTANDSNACHWEIS_KOMMUNAL_INTERN_HTML =
  "custom.alkis.product.bestandsnachweis_kom_intern";

export const BESTANDSNACHWEIS_NRW_PDF =
  "custom.alkis.product.bestandsnachweis_nrw";
export const BESTANDSNACHWEIS_NRW_HTML =
  "custom.alkis.product.bestandsnachweis_nrw";

export const BESTANDSNACHWEIS_STICHTAGSBEZOGEN_NRW_PDF =
  "custom.alkis.product.bestandsnachweis_stichtagsbezogen_nrw";

export const GRUNDSTUECKSNACHWEIS_NRW_PDF =
  "custom.alkis.product.grundstuecksnachweis_nrw";
export const GRUNDSTUECKSNACHWEIS_NRW_HTML =
  "custom.alkis.product.grundstuecksnachweis_nrw";

export const KARTE = "custom.alkis.product.karte";

export const PRODUCT_ACTION_TAG_BAULASTBESCHEINIGUNG_ENABLED =
  "baulast.report.bescheinigung_enabled";
export const PRODUCT_ACTION_TAG_BAULASTBESCHEINIGUNG_DISABLED =
  "baulast.report.bescheinigung_disabled";

// Constant for loading Flurstueck
export const LOADING_FLURSTUECKSNACHWEIS_PDF = "LB.GDBNRW.A.FNW.1";
export const LOADING_FLURSTUECKS_UND_EIGENTUMSNACHWEIS_NRW_PDF =
  "LB.GDBNRW.A.FENW.1";
export const LOADING_FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_PDF =
  "LB.NRW.K.FENW.1";
export const LOADING_FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_INTERN_PDF =
  "LB.GDBNRW.I.FENW.1";
// Constant for loading Buchungsblatt
export const LOADING_BESTANDSNACHWEIS_NRW_PDF = "LB.GDBNRW.A.BNW.1";
export const LOADING_BESTANDSNACHWEIS_STICHTAGSBEZOGEN_NRW_PDF =
  "LB.GDBNRW.A.BNWST.1";
export const LOADING_BESTANDSNACHWEIS_KOMMUNAL_PDF = "LB.NRW.K.BNW.1";

export const LOADING_BESTANDSNACHWEIS_KOMMUNAL_INTERN_PDF = "LB.GDBNRW.I.BNW.1";
export const LOADING_GRUNDSTUECKSNACHWEIS_NRW_PDF = "LB.GDBNRW.A.GNW.1";

export const pdfProductsSheet = [
  {
    name: "Bestandsnachweis (NRW)",
    configurationAttribute: BESTANDSNACHWEIS_NRW_PDF,
    loadingAttribute: LOADING_BESTANDSNACHWEIS_NRW_PDF,
  },
  {
    name: "Bestandsnachweis stichtagsbezogen (NRW)",
    configurationAttribute: BESTANDSNACHWEIS_STICHTAGSBEZOGEN_NRW_PDF,
    loadingAttribute: LOADING_BESTANDSNACHWEIS_STICHTAGSBEZOGEN_NRW_PDF,
  },
  {
    name: "Bestandsnachweis (kommunal)",
    configurationAttribute: BESTANDSNACHWEIS_KOMMUNAL_PDF,
    loadingAttribute: LOADING_BESTANDSNACHWEIS_KOMMUNAL_PDF,
  },
  {
    name: "Bestandsnachweis (NRW, intern)",
    configurationAttribute: BESTANDSNACHWEIS_KOMMUNAL_INTERN_PDF,
    loadingAttribute: LOADING_BESTANDSNACHWEIS_KOMMUNAL_INTERN_PDF,
  },
  // {
  //   name: "Grundstücksnachweis (NRW)",
  //   configurationAttribute: GRUNDSTUECKSNACHWEIS_NRW_PDF,
  //   loadingAttribute: LOADING_GRUNDSTUECKSNACHWEIS_NRW_PDF,
  // },
  // {
  //   name: "Baulastbescheinigung",
  //   configurationAttribute: "",
  //   loadingAttribute: "",
  // },
];

export const pdfProductsLandparcel = [
  {
    name: "Flurstücksnachweis",
    configurationAttribute: FLURSTUECKSNACHWEIS_PDF,
    loadingAttribute: LOADING_FLURSTUECKSNACHWEIS_PDF,
  },
  {
    name: "Flurstücks- und Eigentumsnachweis (NRW)",
    configurationAttribute: FLURSTUECKS_UND_EIGENTUMSNACHWEIS_NRW_PDF,
    loadingAttribute: LOADING_FLURSTUECKS_UND_EIGENTUMSNACHWEIS_NRW_PDF,
  },
  {
    name: "Flurstücks- und Eigentumsnachweis (kommunal)",
    configurationAttribute: FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_PDF,
    loadingAttribute: LOADING_FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_PDF,
  },
  {
    name: "Flurstücks- und Eigentumsnachweis (NRW, intern)",
    configurationAttribute:
      FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_INTERN_PDF,
    loadingAttribute:
      LOADING_FLURSTUECKS_UND_EIGENTUMSNACHWEIS_KOMMUNAL_INTERN_PDF,
  },
  // {
  //   name: "Baulastbescheinigung",
  // },
  {
    name: "Karte",
    configurationAttribute: KARTE,
    loadingAttribute: "",
  },
];

const landparcelGeomStyle = () => {
  return {
    fillColor: "#ff1010",
    fillOpacity: 0.6,
    color: "#000000",
    weight: 1,
  };
};

export const landparcelExtractor = (geometry) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: [geometry],
    styler: landparcelGeomStyle,
  };
};

export const additionalSheetExtractor = (geometry) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: geometry,
    styler: stylerGeometrienStyle,
  };
};
