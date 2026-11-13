import InfoBox from "react-cismap/topicmaps/InfoBox";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { getProcessedFlaechenCR } from "../../utils/kassenzeichenHelper";

/* eslint-disable @typescript-eslint/no-explicit-any -- Flaeche and CR objects are untyped */
interface FlaechenInfoBoxProps {
  flaechen: any[];
  selectedId: string | number;
  editMode: boolean;
  getCR: (flaeche: any) => any;
  onSelect: (flaeche: any) => void;
  onEdit: (flaeche: any, cr: any) => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const linkButtonClass = "btn btn-link p-0";

const FlaechenInfoBox = ({
  flaechen,
  selectedId,
  editMode,
  getCR,
  onSelect,
  onEdit,
}: FlaechenInfoBoxProps) => {
  const index = flaechen.findIndex((f) => f.id === selectedId);
  if (index === -1) return null;
  const flaeche = flaechen[index];
  const cr = getCR(flaeche);

  let groesse = flaeche.flaecheninfo.groesse_korrektur;
  let anschlussgrad = flaeche.flaecheninfo.anschlussgrad.grad_abkuerzung;
  let flaechenart = flaeche.flaecheninfo.flaechenart.art;
  let groesseColor = "black";
  let anschlussgradColor = "black";
  let flaechenartColor = "black";
  if (editMode) {
    const crInfo = getProcessedFlaechenCR(flaeche, cr ?? {});
    groesse = crInfo.groesse;
    anschlussgrad = crInfo.anschlussgrad.grad_abkuerzung;
    flaechenart = crInfo.art.art;
    groesseColor = crInfo.colors.groesse;
    anschlussgradColor = crInfo.colors.anschlussgrad;
    flaechenartColor = crInfo.colors.flaechenart;
  }

  const go = (step: number) => {
    onSelect(flaechen[(index + step + flaechen.length) % flaechen.length]);
  };

  const editButton = editMode ? (
    <button
      key="edit"
      type="button"
      className={linkButtonClass}
      title="Fläche bearbeiten"
      aria-label="Fläche bearbeiten"
      style={{ fontSize: 18 }}
      onClick={() => onEdit(flaeche, cr ?? {})}
    >
      <FontAwesomeIcon icon={faEdit} />
    </button>
  ) : undefined;

  // InfoBox's own navigator only works with a FeatureCollectionContext, so it gets its own
  const content = (
    <span style={{ display: "block", marginTop: -14 }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: groesseColor }}>
          {flaeche.anteil
            ? `${flaeche.anteil} m² von ${groesse} m²`
            : `${groesse} m²`}
        </span>
        <span style={{ textAlign: "right" }}>
          {flaeche.flaecheninfo.beschreibung?.beschreibung}
          {flaeche.flaecheninfo.beschreibung && <br />}
          <span style={{ color: anschlussgradColor }}>{anschlussgrad}</span>
        </span>
      </span>
      {flaechen.length > 1 && (
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
            title="vorherige Fläche"
            onClick={() => go(-1)}
          >
            &lt;&lt;
          </button>
          <span>
            {index + 1} / {flaechen.length}
          </span>
          <button
            type="button"
            className={linkButtonClass}
            title="nächste Fläche"
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
      currentFeature={flaeche}
      pixelwidth={350}
      header={<span>{flaechenart}</span>}
      headerColor="#F0AD4E"
      title={
        <span style={{ color: flaechenartColor }}>
          {`${flaechenart} ${flaeche.flaechenbezeichnung}`}
        </span>
      }
      links={editButton}
      subtitle={content}
      hideNavigator={true}
    />
  );
};

export default FlaechenInfoBox;
