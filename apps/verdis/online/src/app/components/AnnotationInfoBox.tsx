import InfoBox from "react-cismap/topicmaps/InfoBox";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDrawPolygon,
  faEdit,
  faMapMarker,
} from "@fortawesome/free-solid-svg-icons";
import { getArea25832 } from "../../utils/kassenzeichenMappingTools";
import { colorChanged } from "../../utils/kassenzeichenHelper";
import type { GeometryFeature } from "../../store/slices/kassenzeichen";

interface AnnotationInfoBoxProps {
  annotations: GeometryFeature[];
  selectedId: string | number;
  onSelect: (annotation: GeometryFeature) => void;
  onEdit: (annotation: GeometryFeature) => void;
}

const linkButtonClass = "btn btn-link p-0";
const linkButtonStyle = { color: "black", textDecoration: "none" };

const AnnotationInfoBox = ({
  annotations,
  selectedId,
  onSelect,
  onEdit,
}: AnnotationInfoBoxProps) => {
  const index = annotations.findIndex((a) => a.id === selectedId);
  if (index === -1) return null;
  const annotation = annotations[index];
  const { name } = annotation.properties as { name?: string };

  const go = (step: number) => {
    onSelect(
      annotations[(index + step + annotations.length) % annotations.length]
    );
  };

  const geometryInfo =
    annotation.geometry.type === "Polygon" ? (
      <span>
        <FontAwesomeIcon style={{ color: "#999" }} icon={faDrawPolygon} /> ~{" "}
        {Math.round(
          getArea25832({
            ...annotation,
            crs: {
              type: "name",
              properties: { name: "urn:ogc:def:crs:EPSG::25832" },
            },
          }) ?? 0
        )}{" "}
        m²
      </span>
    ) : (
      <FontAwesomeIcon style={{ color: "#999" }} icon={faMapMarker} />
    );

  const editButton = (
    <button
      key="edit"
      type="button"
      className={linkButtonClass}
      title="Anmerkung bearbeiten"
      aria-label="Anmerkung bearbeiten"
      style={{ ...linkButtonStyle, width: 26, textAlign: "center" }}
      onClick={() => onEdit(annotation)}
    >
      <FontAwesomeIcon icon={faEdit} style={{ fontSize: 18 }} />
    </button>
  );

  const content = (
    <span style={{ display: "block", marginTop: -14 }}>
      <span style={{ display: "block" }}>{geometryInfo}</span>
      {annotations.length > 1 && (
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            marginBottom: 3,
          }}
        >
          <button
            type="button"
            className={linkButtonClass}
            style={linkButtonStyle}
            title="vorherige Anmerkung"
            onClick={() => go(-1)}
          >
            &lt;&lt;
          </button>
          <span>
            {index + 1} / {annotations.length}
          </span>
          <button
            type="button"
            className={linkButtonClass}
            style={linkButtonStyle}
            title="nächste Anmerkung"
            onClick={() => go(1)}
          >
            &gt;&gt;
          </button>
        </span>
      )}
    </span>
  );

  return (
    <InfoBox
      currentFeature={annotation}
      pixelwidth={350}
      header={<span>Anmerkung</span>}
      headerColor={colorChanged}
      title={<span>{`Anmerkung ${name ?? ""}`}</span>}
      links={editButton}
      subtitle={content}
      hideNavigator={true}
    />
  );
};

export default AnnotationInfoBox;
