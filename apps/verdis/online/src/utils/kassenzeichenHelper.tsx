import {
  AmKanalAngeschlossen,
  DirekteinleitungInVerrohrtesGewaesser,
  DirekteinleitungOffenesGewaesser,
  VersickerungsanlageMitNotueberlauf,
  Versickernd,
  Dachflaeche,
  Gruendachflaeche,
  Oekopflaster,
  StaedtStrassenflaeche,
  VersiegelteFlaeche,
  StaedtStrassenflaecheOekopflaster,
} from "@carma-collab/wuppertal/verdis-online";

export const colorUnchanged = "black";
export const colorChanged = "#436F8C";
export const colorNeededProof = "#B55959";
export const colorAccepted = "#3D7844";
export const colorRejected = "#B11623";
export const colorDraft = "#BD9546";

const getMergedFlaechenObject = (flaeche, flaechenCR) => {
  let ret = JSON.parse(JSON.stringify(flaeche));

  ret.flaecheninfo.groesse_korrektur =
    flaechenCR.groesse || ret.flaecheninfo.groesse_korrektur;
  ret.flaecheninfo.anschlussgrad =
    flaechenCR.anschlussgrad || ret.flaecheninfo.anschlussgrad;
  ret.flaecheninfo.flaechenart =
    flaechenCR.flaechenart || ret.flaecheninfo.flaechenart;
  return ret;
};

export const getMergedFlaeche = (flaecheOrFlaechenfeature, flaechenCR) => {
  if (flaechenCR === undefined) {
    return flaecheOrFlaechenfeature;
  } else {
    if (flaecheOrFlaechenfeature.flaechenart !== undefined) {
      //feature
      let featureProps = JSON.parse(JSON.stringify(flaecheOrFlaechenfeature));

      let crASG, crFA, crFAAbk, crG;
      try {
        crASG = flaechenCR.anschlussgrad.grad_abkuerzung;
      } catch (skip) {}

      try {
        crFA = flaechenCR.flaechenart.art;
      } catch (skip) {}
      try {
        crFAAbk = flaechenCR.flaechenart.art_abkuerzung;
      } catch (skip) {}
      try {
        crG = flaechenCR.groesse;
      } catch (skip) {}

      featureProps.anschlussgrad = crASG || featureProps.anschlussgrad;
      featureProps.flaechenart = crFA || featureProps.flaechenart;
      featureProps.art_abk = crFAAbk || featureProps.art_abk;
      featureProps.groesse = crG || featureProps.groesse;
      featureProps.groesse_korrektur = crG || featureProps.groesse_korrektur;
      return featureProps;
    } else {
      //flaechenobject
      return getMergedFlaechenObject(flaecheOrFlaechenfeature, flaechenCR);
    }
  }
};

export const getLinkForDoc = (doc) => {
  return "https://wuppertal.regengeld.de/anhang/" + doc.uuid + "_" + doc.name;
};

export const getCRsForFeature = (kassenzeichen, flaechenFeature) => {
  if (
    kassenzeichen.aenderungsanfrage !== undefined &&
    kassenzeichen.aenderungsanfrage !== null &&
    kassenzeichen.aenderungsanfrage.flaechen !== undefined &&
    kassenzeichen.aenderungsanfrage.flaechen[flaechenFeature.bez] !== undefined
  ) {
    const ret = kassenzeichen.aenderungsanfrage.flaechen[flaechenFeature.bez];
    return ret;
  } else {
    return undefined;
  }
};

export const getCRsForFlaeche = (kassenzeichen, flaeche) => {
  if (
    kassenzeichen.aenderungsanfrage !== undefined &&
    kassenzeichen.aenderungsanfrage !== null &&
    kassenzeichen.aenderungsanfrage.flaechen !== undefined &&
    kassenzeichen.aenderungsanfrage.flaechen[flaeche.flaechenbezeichnung] !==
      undefined
  ) {
    const ret =
      kassenzeichen.aenderungsanfrage.flaechen[flaeche.flaechenbezeichnung];
    return ret;
  } else {
    return undefined;
  }
};

export const hasAttachment = (flaechenCR) => {
  if (flaechenCR?.nachrichten !== undefined) {
    for (const nachricht of flaechenCR.nachrichten) {
      if (nachricht.anhang !== undefined) {
        return true;
      }
    }
  }
};

export const kassenzeichenFlaechenSorter = (fa, fb) => {
  if (!isNaN(fa.flaechenbezeichnung) && !isNaN(fb.flaechenbezeichnung)) {
    return +fa.flaechenbezeichnung - +fb.flaechenbezeichnung;
  } else if (!isNaN(fa.flaechenbezeichnung) && isNaN(fb.flaechenbezeichnung)) {
    return -1;
  } else if (isNaN(fa.flaechenbezeichnung) && !isNaN(fb.flaechenbezeichnung)) {
    return 1;
  } else {
    if (fa.flaechenbezeichnung < fb.flaechenbezeichnung) {
      return -1;
    } else {
      return 1;
    }
  }
};

export const veranlagungsgrundlage = [
  {
    flaechenart: 6,
    anschlussgrad: 3,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 1,
    anschlussgrad: 2,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 2,
    anschlussgrad: 2,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 3,
    anschlussgrad: 2,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 4,
    anschlussgrad: 2,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 5,
    anschlussgrad: 2,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 6,
    anschlussgrad: 2,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 1,
    anschlussgrad: 3,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 2,
    anschlussgrad: 3,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 3,
    anschlussgrad: 3,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 4,
    anschlussgrad: 3,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  {
    flaechenart: 5,
    anschlussgrad: 3,
    veranlagungsschluessel: 0,
    bezeichner: "999-Rest",
  },
  // {
  //     flaechenart: 2,
  //     anschlussgrad: 4,
  //     veranlagungsschluessel: 0.25,
  //     bezeichner: "730-Va-über"
  // },
  // {
  //     flaechenart: 4,
  //     anschlussgrad: 4,
  //     veranlagungsschluessel: 0.35,
  //     bezeichner: "730-Va-über"
  // },
  {
    flaechenart: 6,
    anschlussgrad: 4,
    veranlagungsschluessel: 0.35,
    bezeichner: "740-VFS",
  },
  {
    flaechenart: 2,
    anschlussgrad: 5,
    veranlagungsschluessel: 0.5,
    bezeichner: "715-GDF",
  },
  // {
  //     flaechenart: 1,
  //     anschlussgrad: 4,
  //     veranlagungsschluessel: 0.5,
  //     bezeichner: "730-Va-über"
  // },
  // {
  //     flaechenart: 3,
  //     anschlussgrad: 4,
  //     veranlagungsschluessel: 0.5,
  //     bezeichner: "730-Va-über"
  // },
  {
    flaechenart: 1,
    anschlussgrad: 4,
    veranlagungsschluessel: 0.4,
    bezeichner: "731-Va-über",
  },
  {
    flaechenart: 3,
    anschlussgrad: 4,
    veranlagungsschluessel: 0.4,
    bezeichner: "731-Va-über",
  },
  {
    flaechenart: 4,
    anschlussgrad: 4,
    veranlagungsschluessel: 0.4,
    bezeichner: "731-Va-über",
  },
  {
    flaechenart: 2,
    anschlussgrad: 1,
    veranlagungsschluessel: 0.5,
    bezeichner: "715-GDF",
  },
  {
    flaechenart: 5,
    anschlussgrad: 4,
    veranlagungsschluessel: 0.5,
    bezeichner: "740-VFS",
  },
  {
    flaechenart: 4,
    anschlussgrad: 5,
    veranlagungsschluessel: 0.7,
    bezeichner: "725-LVF",
  },
  {
    flaechenart: 6,
    anschlussgrad: 1,
    veranlagungsschluessel: 0.7,
    bezeichner: "740-VFS",
  },
  {
    flaechenart: 4,
    anschlussgrad: 1,
    veranlagungsschluessel: 0.7,
    bezeichner: "725-LVF",
  },
  {
    flaechenart: 6,
    anschlussgrad: 5,
    veranlagungsschluessel: 0.7,
    bezeichner: "740-VFS",
  },
  {
    flaechenart: 7,
    anschlussgrad: 5,
    veranlagungsschluessel: 1,
    bezeichner: "VV-750",
  },
  {
    flaechenart: 3,
    anschlussgrad: 1,
    veranlagungsschluessel: 1,
    bezeichner: "720-VF",
  },
  {
    flaechenart: 1,
    anschlussgrad: 5,
    veranlagungsschluessel: 1,
    bezeichner: "710-DF",
  },
  {
    flaechenart: 5,
    anschlussgrad: 1,
    veranlagungsschluessel: 1,
    bezeichner: "740-VFS",
  },
  {
    flaechenart: 3,
    anschlussgrad: 5,
    veranlagungsschluessel: 1,
    bezeichner: "720-VF",
  },
  {
    flaechenart: 5,
    anschlussgrad: 5,
    veranlagungsschluessel: 1,
    bezeichner: "740-VFS",
  },
  {
    flaechenart: 7,
    anschlussgrad: 1,
    veranlagungsschluessel: 1,
    bezeichner: "VV-750",
  },
  {
    flaechenart: 7,
    anschlussgrad: 2,
    veranlagungsschluessel: 1,
    bezeichner: "VV-750",
  },
  {
    flaechenart: 7,
    anschlussgrad: 3,
    veranlagungsschluessel: 1,
    bezeichner: "VV-750",
  },
  {
    flaechenart: 7,
    anschlussgrad: 4,
    veranlagungsschluessel: 1,
    bezeichner: "VV-750",
  },
  {
    flaechenart: 1,
    anschlussgrad: 1,
    veranlagungsschluessel: 1,
    bezeichner: "710-DF",
  },
  {
    flaechenart: 2,
    anschlussgrad: 4,
    veranlagungsschluessel: 0.3,
    bezeichner: "735-GDF-V",
  },
];

export const flaechenartLookupByAbk = {
  DF: 1,
  GDF: 2,
  VF: 3,
  VFS: 5,
  LVS: 6,
  LVF: 4,
  VV: 7,
};

export const anschlussgradLookupByAbk = {
  "angeschl.": 1,
  "vers.": 2,
  "direkt OG": 3,
  "Va-Über": 4,
  "Bach verrohrt": 5,
};

export const getOverlayTextForFlaeche = (flaeche, flaechenCR) => {
  let mergedFlaeche = getMergedFlaeche(flaeche, flaechenCR);
  return (
    <div>
      {getInfoTextForFlaechenart(mergedFlaeche)}
      <br />
      {getInfoTextForAnschlussgrad(mergedFlaeche)}
    </div>
  );
};

export const getInfoTextForFlaechenart = (flaeche) => {
  let flaechenart;
  let switcher;
  if (flaeche.flaechenart) {
    switcher = flaeche.flaechenart;
  } else {
    switcher = flaeche.flaecheninfo.flaechenart.art;
  }

  switch (switcher) {
    case "Dachfläche":
      flaechenart = <Dachflaeche />;
      break;
    case "Gründach":
      flaechenart = <Gruendachflaeche />;
      break;
    case "versiegelte Fläche":
      flaechenart = <VersiegelteFlaeche />;
      break;
    case "städtische Straßenfläche":
      flaechenart = <StaedtStrassenflaeche />;
      break;
    case "leicht versiegelte Straßenfläche":
      flaechenart = <StaedtStrassenflaecheOekopflaster />;
      break;
    case "leicht versiegelte Fläche":
      flaechenart = <Oekopflaster />;
      break;
    default:
      throw new Error("unbekannte Flächenart: " + switcher);
  }

  return flaechenart;
};

export const getInfoTextForAnschlussgrad = (flaeche) => {
  let anschlussgrad;

  let switcher;
  if (flaeche.anschlussgrad) {
    switcher = flaeche.anschlussgrad;
  } else {
    switcher = flaeche.flaecheninfo.anschlussgrad.grad_abkuerzung;
  }
  switch (switcher) {
    case "angeschl.":
      anschlussgrad = <AmKanalAngeschlossen />;
      break;
    case "vers.":
      anschlussgrad = <Versickernd />;
      break;
    case "direkt OG":
      anschlussgrad = <DirekteinleitungOffenesGewaesser />;
      break;
    case "Va-Über":
      anschlussgrad = <VersickerungsanlageMitNotueberlauf />;
      break;
    case "Bach verrohrt":
      anschlussgrad = <DirekteinleitungInVerrohrtesGewaesser />;
      break;
    default:
      throw new Error("unbekannte Anschlussgrad: " + switcher);
  }

  return anschlussgrad;
};

const isProcessedByClerk = (attr, cr) => {
  try {
    if (
      cr !== undefined &&
      cr[attr] !== undefined &&
      cr.pruefung !== undefined &&
      cr.pruefung[attr] !== undefined &&
      cr.pruefung[attr].value !== undefined
    ) {
      // const crValue = cr[attr];
      // const checkValue = cr.pruefung[attr].value;

      return true;

      // switch (attr) {
      //   case "groesse":
      //     return crValue === checkValue;
      //   case "flaechenart":
      //     console.log("xxx processed crValue", crValue);
      //     console.log("xxx processed checkValue", checkValue);
      //     return true;
      //     return (
      //       // crValue.art_abkuerzung === checkValue.art_abkuerzung
      //       //  &&
      //       crValue.art === checkValue.art
      //     );
      //   case "anschlussgrad":
      //     return (
      //       crValue.grad_abkuerzung === checkValue.grad_abkuerzung &&
      //       crValue.grad === checkValue.grad
      //     );
      //   default:
      //     return false;
      // }
    } else {
      return false;
    }
  } catch (e) {
    console.log("error in isChecked", e);
    console.log("cr", cr);

    return false;
  }
};

const setColorForAttr = (
  colorStates,
  attr,
  flaechenCR,
  colorProcessed,
  colorUnprocessed
) => {
  if (isProcessedByClerk(attr, flaechenCR)) {
    colorStates[attr] = colorProcessed;
  } else {
    colorStates[attr] = colorUnprocessed;
  }
};

const setValidationStringForAttr = (
  validationStates,
  attr,
  flaechenCR,
  validationString
) => {
  if (isProcessedByClerk(attr, flaechenCR)) {
    validationStates[attr] = validationString;
  }
};

export const getProcessedFlaechenCR = (flaeche, flaechenCR) => {
  let groesse, art, anschlussgrad;
  let changeCounter = 0;
  let edited = false;
  let validationStates = {
    groesse: null, //means 'pending'
    flaechenart: null, //means 'pending'
    anschlussgrad: null, //means 'pending'
  };
  let colors = {
    groesse: "black",
    flaechenart: "black",
    anschlussgrad: "black",
  };
  if (
    flaechenCR.groesse !== undefined &&
    flaechenCR.groesse !== flaeche.flaecheninfo.groesse_korrektur
  ) {
    groesse = flaechenCR.groesse;
    setValidationStringForAttr(
      validationStates,
      "groesse",
      flaechenCR,
      "error"
    );
    setColorForAttr(colors, "groesse", flaechenCR, colorRejected, colorChanged);
    if (!isProcessedByClerk("groesse", flaechenCR)) {
      changeCounter++;
    }
  } else {
    groesse = flaeche.flaecheninfo.groesse_korrektur;
    setValidationStringForAttr(
      validationStates,
      "groesse",
      flaechenCR,
      "success"
    );
    setColorForAttr(
      colors,
      "groesse",
      flaechenCR,
      colorAccepted,
      colorUnchanged
    );
  }
  if (
    flaechenCR.flaechenart !== undefined &&
    flaechenCR.flaechenart.art_abkuerzung !==
      flaeche.flaecheninfo.flaechenart.art_abkuerzung
  ) {
    art = flaechenCR.flaechenart;
    setValidationStringForAttr(
      validationStates,
      "flaechenart",
      flaechenCR,
      "error"
    );
    setColorForAttr(
      colors,
      "flaechenart",
      flaechenCR,
      colorRejected,
      colorChanged
    );
    if (!isProcessedByClerk("flaechenart", flaechenCR)) {
      changeCounter++;
    }
  } else {
    art = flaeche.flaecheninfo.flaechenart;
    setValidationStringForAttr(
      validationStates,
      "flaechenart",
      flaechenCR,
      "success"
    );
    setColorForAttr(
      colors,
      "flaechenart",
      flaechenCR,
      colorAccepted,
      colorUnchanged
    );
  }

  if (
    flaechenCR.anschlussgrad !== undefined &&
    flaechenCR.anschlussgrad.grad_abkuerzung !==
      flaeche.flaecheninfo.anschlussgrad.grad_abkuerzung
  ) {
    anschlussgrad = flaechenCR.anschlussgrad;
    setValidationStringForAttr(
      validationStates,
      "anschlussgrad",
      flaechenCR,
      "error"
    );
    setColorForAttr(
      colors,
      "anschlussgrad",
      flaechenCR,
      colorRejected,
      colorChanged
    );
    if (!isProcessedByClerk("anschlussgrad", flaechenCR)) {
      changeCounter++;
    }
  } else {
    anschlussgrad = flaeche.flaecheninfo.anschlussgrad;
    setValidationStringForAttr(
      validationStates,
      "anschlussgrad",
      flaechenCR,
      "success"
    );
    setColorForAttr(
      colors,
      "anschlussgrad",
      flaechenCR,
      colorAccepted,
      colorUnchanged
    );
  }
  if (changeCounter > 0) {
    edited = true;
  }

  return {
    groesse,
    art,
    anschlussgrad,
    validationStates,
    changeCounter,
    colors,
    edited,
  };
};

export const flaechenarten = [
  { art_abkuerzung: "DF", art: "Dachfläche" },
  { art_abkuerzung: "GDF", art: "Gründach", nachweis: true },
  { art_abkuerzung: "VF", art: "versiegelte Fläche" },
  { art_abkuerzung: "VFS", art: "städtische Straßenfläche" },
  {
    art_abkuerzung: "LVS",
    art: "leicht versiegelte Straßenfläche",
    nachweis: true,
  },
  { art_abkuerzung: "LVF", art: "leicht versiegelte Fläche", nachweis: true },
  // { art_abkuerzung: 'VV', art: 'vorläufige Veranlagung' }
];

export const anschlussgrade = [
  { grad_abkuerzung: "angeschl.", grad: "Am Kanal angeschlossen" },
  { grad_abkuerzung: "vers.", grad: "versickernd", nachweis: true },
  {
    grad_abkuerzung: "direkt OG",
    grad: "Direkteinleitung in ein offenes Gewässer",
    nachweis: true,
  },
  {
    grad_abkuerzung: "Va-Über",
    grad: "Versickerungsanlage mit Notüberlauf",
    nachweis: true,
  },
  {
    grad_abkuerzung: "Bach verrohrt",
    grad: "Direkteinleitung in ein verrohrtes Gewässer",
    nachweis: true,
  },
];

export const nachweisPflichtText = () => (
  <span>
    <b>Sie haben noch keinen Nachweis hinzugefügt.</b> Bitte beachten Sie, dass
    Änderungswünsche, die nachweispflichtig sind, erst eingereicht werden
    können, wenn Sie einen Nachweis als Dokument hinterlegt haben.
  </span>
);

export const nachweispflicht = {
  flaechenart: ["GDF", "LVS", "LVF"],
  anschlussgrad: ["vers.", "direkt OG", "Va-Über", "Bach verrohrt"],
};

export const needsProof = (flaechenCR) => {
  if (flaechenCR === undefined || flaechenCR === null) {
    return false;
  }
  let needsProofValue = false;
  for (const key in flaechenCR.flaechen) {
    const flaechenCR_SingleFlaeche = flaechenCR.flaechen[key];
    needsProofValue = needsProofSingleFlaeche(flaechenCR_SingleFlaeche);
    if (needsProofValue === true) {
      break;
    }
  }

  if (needsProofValue === true && flaechenCR.nachrichten !== undefined) {
    // now check whether in the messages array is a message that has a anhang property
    if (hasAttachment(flaechenCR) === true) {
      needsProofValue = false;
    }
  }
  return needsProofValue;
};

export const needsProofSingleFlaeche = (flaechenCR_SingleFlaeche) => {
  let needsProofValue = false;
  if (flaechenCR_SingleFlaeche?.flaechenart !== undefined) {
    const flaechenart_abkuerzung =
      flaechenCR_SingleFlaeche.flaechenart.art_abkuerzung;
    //check whether flaechenart.art_abkuerzung is in nachweispflicht.flaechenart array
    if (nachweispflicht.flaechenart.includes(flaechenart_abkuerzung)) {
      needsProofValue = true;
    }
  }

  if (flaechenCR_SingleFlaeche?.anschlussgrad !== undefined) {
    const anschlussgrad_abkuerzung =
      flaechenCR_SingleFlaeche.anschlussgrad.grad_abkuerzung;
    //check whether flaechenart.art_abkuerzung is in nachweispflicht.flaechenart array
    if (nachweispflicht.anschlussgrad.includes(anschlussgrad_abkuerzung)) {
      needsProofValue = true;
    }
  }
  return needsProofValue;
};
