import type { ReactNode } from "react";
import { triggerLightBoxForFeature } from "./lightboxHelpers";
import type { LightBoxDispatchValue } from "./LightBoxContextProvider";

// Ported from react-cismap src/lib/topicmaps/InfoBoxFotoPreview.js (unchanged
// behaviour).

/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface InfoBoxFotoPreviewProps {
  currentFeature?: any;
  getPhotoUrl?: (feature: any) => string | undefined;
  getPhotoSeriesUrl?: (feature: any) => string | undefined;
  getPhotoSeriesArray?: (feature: any) => string[] | undefined;
  urlManipulation?: (input: any) => any;
  captionFactory?: (linkUrl: string, feature?: any) => ReactNode;
  width?: number;
  openLightBox?: () => void;
  lightBoxDispatchContext?: LightBoxDispatchValue;
}

// Since this component is simple and static, there's no parent container for it.
const InfoBoxFotoPreview = ({
  currentFeature,
  getPhotoUrl = (feature) => feature?.properties?.foto,
  getPhotoSeriesUrl = (feature) => feature?.properties?.fotostrecke,
  getPhotoSeriesArray = (feature) => feature?.properties?.fotos,
  urlManipulation = (input) => input,
  captionFactory,
  width = 150,
  openLightBox,
  lightBoxDispatchContext,
}: InfoBoxFotoPreviewProps) => {
  if (
    currentFeature === undefined ||
    urlManipulation(getPhotoUrl(currentFeature)) === undefined ||
    getPhotoUrl(currentFeature) === ""
  ) {
    return <div />;
  } else {
    return (
      <table style={{ width: "100%", opacity: 0.9 }}>
        <tbody>
          <tr>
            <td style={{ textAlign: "right", verticalAlign: "top" }}>
              <a
                onClick={() => {
                  if (openLightBox) {
                    openLightBox();
                  } else if (lightBoxDispatchContext) {
                    triggerLightBoxForFeature({
                      currentFeature,
                      lightBoxDispatchContext,
                      captionFactory,
                      getPhotoUrl,
                      getPhotoSeriesUrl,
                      getPhotoSeriesArray,
                      urlManipulation,
                    });
                  }
                }}
                target="_fotos"
              >
                <img
                  alt="Bild"
                  style={{ paddingBottom: "5px" }}
                  src={urlManipulation(getPhotoUrl(currentFeature))}
                  width={width}
                />
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
};

export default InfoBoxFotoPreview;
