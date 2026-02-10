export interface FeatureDataViewProps {
  /** Processed feature from MapSelectionContext */
  feature: any | null;
  /** Raw MapGeoJSON feature from the map engine */
  rawFeature: any | null;
}

const containerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "auto",
  padding: 16,
  fontFamily: "monospace",
  fontSize: 13,
  lineHeight: 1.5,
  background: "#fafafa",
};

const placeholderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "#999",
  fontSize: 14,
  fontFamily: "sans-serif",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
};

const headingStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "sans-serif",
  marginBottom: 8,
  color: "#333",
  borderBottom: "1px solid #ddd",
  paddingBottom: 4,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 4,
  padding: 12,
};

const geometryBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "#e8f0fe",
  color: "#1a73e8",
  borderRadius: 4,
  padding: "2px 8px",
  fontSize: 12,
  fontFamily: "sans-serif",
  fontWeight: 500,
};

export const FeatureDataView = ({
  feature,
  rawFeature,
}: FeatureDataViewProps) => {
  if (!feature && !rawFeature) {
    return (
      <div style={placeholderStyle}>
        <span>Kein Objekt ausgewahlt</span>
      </div>
    );
  }

  const geometryType = rawFeature?.geometry?.type;

  return (
    <div style={containerStyle}>
      {geometryType && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Geometrie</div>
          <span style={geometryBadgeStyle}>{geometryType}</span>
        </div>
      )}

      {feature && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Feature (verarbeitet)</div>
          <pre style={preStyle}>{JSON.stringify(feature, null, 2)}</pre>
        </div>
      )}

      {rawFeature && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Raw Feature</div>
          <pre style={preStyle}>
            {JSON.stringify(rawFeature.properties, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
