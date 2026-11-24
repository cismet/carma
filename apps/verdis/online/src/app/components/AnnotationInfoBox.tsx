import InfoBox from "react-cismap/topicmaps/InfoBox";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDrawPolygon,
  faEdit,
  faSearchLocation,
} from "@fortawesome/free-solid-svg-icons";
import { getArea25832 } from "../../utils/kassenzeichenMappingTools";
import { colorChanged } from "../../utils/kassenzeichenHelper";
import type { GeometryFeature } from "../../store/slices/kassenzeichen";
import InfoBoxActions from "./InfoBoxActions";

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
    ) : null;

  const content = (
    <span style={{ display: "block", marginTop: -14 }}>
      <span style={{ display: "block" }}>{geometryInfo ?? "\u00a0"}</span>
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
      // react-cismap only goes full width below its own breakpoint; these boxes
      // are only shown on narrow layouts, so keep them full width there too
      infoStyle={{ width: "calc(100vw - 25px)" }}
      header={<span>Anmerkung</span>}
      headerColor={colorChanged}
      title={<span>{`Anmerkung ${name ?? ""}`}</span>}
      secondaryInfoBoxElements={[
        <InfoBoxActions
          key="actions"
          actions={[
            {
              key: "zoom",
              icon: faSearchLocation,
              title: "Auf Anmerkung zoomen",
              onClick: () => onSelect(annotation),
            },
            {
              key: "edit",
              icon: faEdit,
              title: "Anmerkung bearbeiten",
              onClick: () => onEdit(annotation),
            },
          ]}
        />,
      ]}
      subtitle={content}
      hideNavigator={true}
    />
  );
};

export default AnnotationInfoBox;
