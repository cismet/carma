/**
 * BelisDatasheetView - datasheet content for a selected Belis feature.
 *
 * Header: formatted via getVCard() from @carma-appframeworks/belis.
 * Body: placeholder showing rawFeature.properties as JSON (the full
 * feature will eventually be fetched from the server).
 */

import { getVCard } from "@carma-appframeworks/belis";
import { FeaturesFormsWrapper } from "./featuresForm";

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
    <div style={{ height: "100%", padding: 16 }}>
      {/* Header */}
      {/* <div
        style={{
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "1px solid #ddd",
        }}
      >
        {infobox?.header && (
          <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
            {infobox.header}
          </div>
        )}
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {infobox?.title ?? rawFeature?.id ?? "Objekt"}
        </div>
        {infobox?.subtitle && (
          <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
            {infobox.subtitle}
          </div>
        )}
      </div> */}

      {/* Fetched feature data - render form or JSON fallback */}
      {fetchedData && (
        <FeaturesFormsWrapper
          featureType={featureType}
          data={fetchedData}
          rawFeature={rawFeature}
        />
      )}

      {/* Feature data placeholder (original - hidden when fetchedData available) */}
      {!fetchedData && (
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#888",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Feature-Daten (Vorschau)
          </div>
          <pre
            style={{
              fontSize: 11,
              lineHeight: 1.5,
              background: "#f5f5f5",
              padding: 12,
              borderRadius: 4,
              overflow: "auto",
              maxHeight: 600,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(props, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default BelisDatasheetView;
