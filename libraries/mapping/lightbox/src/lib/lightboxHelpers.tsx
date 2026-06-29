import { faCopyright } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import queryString from "query-string";
import type { ReactNode } from "react";
import type { LightBoxDispatchValue } from "./LightBoxContextProvider";

// Ported from react-cismap src/lib/tools/lightboxHelpers.js. The only change
// vs. the original is the icon: react-cismap commons/Icon -> FontAwesome
// faCopyright. The Wuppertal specifics (Foto-Kraemer URLs, the cismet photo
// series harvester) are kept intentionally unchanged.

// react-cismap features are loosely typed; keep them permissive on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TriggerLightBoxForFeatureArgs {
  currentFeature: any;
  getPhotoUrl: (feature: any) => string | undefined;
  getPhotoSeriesUrl: (feature: any) => string | undefined;
  getPhotoSeriesArray?: (feature: any) => string[] | undefined;
  urlManipulation?: (input: any) => any;
  lightBoxDispatchContext: LightBoxDispatchValue;
  captionFactory?: (linkUrl: string, feature?: any) => ReactNode;
  fallbackLinkUrl?: string;
  harvester?: (data: string) => { urls: string[]; selectionWish: number };
}

export const triggerLightBoxForFeature = ({
  currentFeature,
  getPhotoUrl,
  getPhotoSeriesUrl,
  getPhotoSeriesArray = () => undefined,
  urlManipulation = (input) => input,
  lightBoxDispatchContext,
  captionFactory = (linkUrl) => (
    <a href="https://www.wuppertal.de/service/impressum.php" target="_impressum">
      <FontAwesomeIcon icon={faCopyright} /> Stadt Wuppertal
    </a>
  ),
  fallbackLinkUrl = "http://www.fotokraemer-wuppertal.de/",
  harvester = (data) => {
    const tmp = document.implementation.createHTMLDocument();
    tmp.body.innerHTML = data;
    const urls: string[] = [];
    let counter = 0;
    const mainfotoname = decodeURIComponent(currentFeature.properties.foto)
      .split("/")
      .pop()
      ?.trim();
    let selectionWish = 0;
    for (const el of tmp.getElementsByClassName("bilderrahmen")) {
      const query = queryString.parse(
        el.getElementsByTagName("a")[0].getAttribute("href") ?? ""
      );
      urls.push(
        "https://wunda-geoportal-fotos.cismet.de/images/" + query.dateiname_bild
      );
      if (mainfotoname === query.dateiname_bild) {
        selectionWish = counter;
      }
      counter += 1;
    }
    return { urls, selectionWish };
  },
}: TriggerLightBoxForFeatureArgs) => {
  const photoUrl = urlManipulation(getPhotoUrl(currentFeature));
  const photoSeriesUrl = urlManipulation(getPhotoSeriesUrl(currentFeature));
  const photoSeriesPhotoUrls = getPhotoSeriesArray(currentFeature);

  if (
    photoSeriesPhotoUrls !== undefined &&
    photoSeriesPhotoUrls.length !== undefined &&
    photoSeriesPhotoUrls.length > 0
  ) {
    lightBoxDispatchContext.setAll({
      title: currentFeature.text,
      photourls: photoSeriesPhotoUrls,
      caption: captionFactory(currentFeature.text, currentFeature),
      index: 0,
    });
  } else if (
    photoSeriesUrl === undefined ||
    photoSeriesUrl === null ||
    photoSeriesUrl.indexOf("&noparse") !== -1
  ) {
    let linkUrl;
    if (photoSeriesUrl) {
      linkUrl = photoSeriesUrl;
    } else {
      linkUrl = fallbackLinkUrl;
    }
    lightBoxDispatchContext.setAll({
      title: currentFeature.text,
      photourls: [photoUrl],
      caption: captionFactory(linkUrl, currentFeature),
      index: 0,
    });
  } else {
    fetch(photoSeriesUrl, {
      method: "get",
    })
      .then(function (response) {
        return response.text();
      })
      .then(function (data) {
        const { urls, selectionWish } = harvester(data);
        lightBoxDispatchContext.setAll({
          title: currentFeature.text,
          photourls: urls,
          caption: captionFactory(photoSeriesUrl, currentFeature),
          index: selectionWish,
        });
      })
      .catch(function (err) {
        console.log(err);
      });
  }
};

export const getLinkOrText = (input?: string | null): ReactNode => {
  if (input !== undefined && input !== null) {
    if (input.startsWith("https://") || input.startsWith("http://")) {
      return (
        <a href={input} target="_more">
          siehe externe Webseite
        </a>
      );
    } else {
      return <span>{input}</span>;
    }
  }
};

export const fotoKraemerUrlManipulation = (
  input?: string
): string | undefined => {
  if (input !== undefined || input === "") {
    const ret = (input as string).replace(
      /https*:\/\/.*fotokraemer-wuppertal\.de/,
      "https://wunda-geoportal-fotos.cismet.de/"
    );
    // console.log('converted url from ', input);
    // console.log('converted url to ', ret);
    return ret;
  } else {
    return undefined;
  }
};

export const fotoKraemerCaptionFactory = (
  linkUrl: string,
  currentFeature?: any
): ReactNode => (
  <a href={linkUrl} target="_fotos">
    <FontAwesomeIcon icon={faCopyright} /> Peter Kr&auml;mer - Fotografie
  </a>
);
