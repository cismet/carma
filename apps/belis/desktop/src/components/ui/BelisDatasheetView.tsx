/**
 * BelisDatasheetView - datasheet content for a selected Belis feature.
 *
 * Header: formatted via getVCard() from @carma-appframeworks/belis.
 * Body: placeholder showing rawFeature.properties as JSON (the full
 * feature will eventually be fetched from the server).
 */

import { getVCard } from "@carma-appframeworks/belis";
import { FeaturesFormsWrapper } from "./featuresForm";
import { useSelector } from "react-redux";
import { getFeatureLoading } from "../../store/slices/featureCollection";
import { Spin } from "antd";

interface BelisDatasheetViewProps {
  feature: any | null;
  rawFeature: any | null;
  fetchedData?: any | null;
  featureType?: string;
}

const BelisDatasheetView = ({
  feature,
  rawFeature,
  fetchedData,
  featureType,
}: BelisDatasheetViewProps) => {
  const featureLoading = useSelector(getFeatureLoading);

  if (!feature && !rawFeature) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#999",
          fontSize: 14,
        }}
      >
        Kein Objekt ausgewahlt
      </div>
    );
  }

  // Try to get vcard info from the processed feature
  let vcard: { infobox?: Record<string, string> } | null = null;
  if (feature) {
    try {
      vcard = getVCard(feature);
    } catch {
      // feature may not have the expected shape
    }
  }

  const infobox = vcard?.infobox;
  const props = rawFeature?.properties ?? feature?.properties ?? {};

  return (
    <Spin spinning={featureLoading}>
      <div style={{ height: "100%", padding: "10px 4px 8px 16px" }}>
        {/* Fetched feature data - render form or JSON fallback */}
        {fetchedData && (
          <FeaturesFormsWrapper
            featureType={featureType}
            data={fetchedData}
            rawFeature={rawFeature}
          />
        )}
      </div>
    </Spin>
  );
};

export default BelisDatasheetView;
