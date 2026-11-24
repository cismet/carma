import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDrawPolygon,
  faEdit,
  faSearchLocation,
} from "@fortawesome/free-solid-svg-icons";
import { getArea25832 } from "../../utils/kassenzeichenMappingTools";
import { colorChanged } from "../../utils/kassenzeichenHelper";
import type { GeometryFeature } from "../../store/slices/kassenzeichen";
import PhoneInfoBox from "./PhoneInfoBox";

interface AnnotationInfoBoxProps {
  annotations: GeometryFeature[];
  selectedId: string | number;
  onSelect: (annotation: GeometryFeature) => void;
  onEdit: (annotation: GeometryFeature) => void;
}

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

  return (
    <PhoneInfoBox
      feature={annotation}
      header="Anmerkung"
      headerColor={colorChanged}
      title={`Anmerkung ${name ?? ""}`}
      details={geometryInfo ?? "\u00a0"}
      index={index}
      count={annotations.length}
      itemName="Anmerkung"
      onGo={(i) => onSelect(annotations[i])}
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
    />
  );
};

export default AnnotationInfoBox;
