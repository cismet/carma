function createInfoBoxInfo(p) {
  const isToilette = p.carmaInfo && p.carmaInfo.sourceLayer === "toiletten";
  if (!isToilette) return null;
  const c_Konfiguration = "";
  const iconBaseUrl = "https://tiles.cismet.de/toiletten/assets/icons/";
  const fotoUrlPrefix = "https://tiles.cismet.de/toiletten/assets/pics/";
  const item = p;
  const c_Foto_bauen = "";
  let foto;
  if (item.HAUPTBILD) {
    foto = fotoUrlPrefix + item.HAUPTBILD.split("/").pop();
  }
  const c_Icon_Liste_aufbauen = "";
  const icons = [];
  const c_24_7 = "";
  if (item["Q_24/7_OFF"] === "ja") {
    icons.push(iconBaseUrl + "Infobox_24_7_Geoeffnet.svg");
  }
  const c_Entgelt = "";
  if (item.ENTGELT === "ja") {
    icons.push(iconBaseUrl + "Infobox_Kostenpflichtig.svg");
  } else if (item.ENTGELT === "nein") {
    icons.push(iconBaseUrl + "Infobox_Kostenfrei.svg");
  }
  const c_Rollstuhlgerecht = "";
  if (item.ROLLGER === "ja") {
    icons.push(iconBaseUrl + "Infobox_Rollstuhlgerecht.svg");
  }
  const c_Wickeltisch = "";
  if (item.WICKELTIS === "ja") {
    icons.push(iconBaseUrl + "Infobox_Wickeltisch.svg");
  }
  let barrHinwText = item.BARR_HINW || "";
  const c_Subtitle_HTML = "";
  let subtitleHtml = null;
  if (icons.length > 0 || item.OEFFNUNGS || barrHinwText) {
    let iconImgs = "";
    for (let i = 0; i < icons.length; i++) {
      iconImgs +=
        '<img src="' +
        icons[i] +
        '" style="height:24px; margin:6px 0; flex:0 0 auto;"/>';
    }
    const opening = item.OEFFNUNGS
      ? '<div style="font-size:11px; margin-bottom:4px;">' +
        item.OEFFNUNGS +
        "</div>"
      : "";
    const iconsRow =
      icons.length > 0
        ? '<div style="display:flex; gap:4px;">' + iconImgs + "</div>"
        : "";
    const barrHinw = barrHinwText
      ? '<div style="font-size:11px; margin-top:4px;">' +
        barrHinwText +
        "</div>"
      : "";
    subtitleHtml =
      "<html>" +
      '<div style="width:100%; margin-top:4px;">' +
      opening +
      iconsRow +
      barrHinw +
      "</div>" +
      "</html>";
  }
  const additionalInfoHtml =
    "<html>" +
    (item.STRASSE || "") +
    (item.HAUSNUMMER ? " " + item.HAUSNUMMER : "") +
    "<br/><br/>" +
    (item.ORTSBESCHR || "") +
    "</html>";
  const info = {
    headerColor: "#4378CC",
    header: "Öffentliche Toiletten (" + item.NUTZUNG + ")",
    title: item.NAME || "Öffentliche Toilette",
    additionalInfo: additionalInfoHtml,
    subtitle: subtitleHtml,
    foto: foto,
  };
  return info;
}
