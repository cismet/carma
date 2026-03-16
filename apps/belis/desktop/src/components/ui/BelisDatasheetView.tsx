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
import NoFeatureSelected from "./NoFeatureSelected";

interface BelisDatasheetViewProps {
  feature: any | null;
  rawFeature: any | null;
  fetchedData?: any | null;
  featureType?: string;
  readOnly?: boolean;
  featureOnMap?: boolean;
  onSelectNextDraft?: (removedFeatureId: string) => void;
}

const BelisDatasheetView = ({
  feature,
  rawFeature,
  fetchedData,
  featureType,
  readOnly = true,
  featureOnMap = false,
  onSelectNextDraft,
}: BelisDatasheetViewProps) => {
  const featureLoading = useSelector(getFeatureLoading);

  if (!featureOnMap || (!feature && !rawFeature && !fetchedData)) {
    return <NoFeatureSelected />;
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
    <div className="h-full">
      <div className="h-full p-2 pl-4">
        {/* Fetched feature data - render form or JSON fallback */}
        {fetchedData && (
          <FeaturesFormsWrapper
            featureType={featureType}
            data={fetchedData}
            rawFeature={rawFeature}
            readOnly={readOnly}
            loading={featureLoading}
            onSelectNextDraft={onSelectNextDraft}
          />
        )}
      </div>
    </div>
  );
};

export default BelisDatasheetView;
