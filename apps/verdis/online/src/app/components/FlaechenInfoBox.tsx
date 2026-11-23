import InfoBox from "react-cismap/topicmaps/InfoBox";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "react-bootstrap";
import { useState } from "react";
import type { ReactNode } from "react";
import StatusNotification from "./StatusNotification";
import { getProcessedFlaechenCR } from "../../utils/kassenzeichenHelper";

/* eslint-disable @typescript-eslint/no-explicit-any -- Flaeche and CR objects are untyped */
interface FlaechenInfoBoxProps {
  flaechen: any[];
  selectedId: string | number;
  editMode: boolean;
  getCR: (flaeche: any) => any;
  onSelect: (flaeche: any) => void;
  onEdit: (flaeche: any, cr: any) => void;
  hint?: ReactNode;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const linkButtonClass = "btn btn-link p-0";
const linkButtonStyle = { color: "black", textDecoration: "none" };
const iconButtonStyle = {
  ...linkButtonStyle,
  color: "#333",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  verticalAlign: "middle",
};

const FlaechenInfoBox = ({
  flaechen,
  selectedId,
  editMode,
  getCR,
  onSelect,
  onEdit,
  hint,
}: FlaechenInfoBoxProps) => {
  const [hintOpen, setHintOpen] = useState(false);
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

  const hintButton = hint ? (
    <button
      key="hint"
      type="button"
      className={linkButtonClass}
      title="Hinweise zur Fläche"
      aria-label="Hinweise zur Fläche"
      style={iconButtonStyle}
      onClick={() => setHintOpen(true)}
    >
      <FontAwesomeIcon
        icon={faInfoCircle}
        style={{ fontSize: 18, marginTop: 1 }}
      />
    </button>
  ) : null;

  const editButton = (
    <button
      key="edit"
      type="button"
      className={linkButtonClass}
      title="Fläche bearbeiten"
      aria-label="Fläche bearbeiten"
      style={iconButtonStyle}
      onClick={() => onEdit(flaeche, cr ?? {})}
    >
      <FontAwesomeIcon icon={faEdit} style={{ fontSize: 18 }} />
    </button>
  );

  // InfoBox's own navigator only works with a FeatureCollectionContext, so it gets its own
  const content = (
    <span style={{ display: "block", marginTop: -14 }}>
      <span style={{ display: "block" }}>
        <span style={{ color: groesseColor }}>
          {flaeche.anteil
            ? `${flaeche.anteil} m² von ${groesse} m²`
            : `${groesse} m²`}
        </span>
        {flaeche.flaecheninfo.beschreibung &&
          `, ${flaeche.flaecheninfo.beschreibung.beschreibung}`}
        {", "}
        <span style={{ color: anschlussgradColor }}>{anschlussgrad}</span>
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
            style={linkButtonStyle}
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
            style={linkButtonStyle}
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
    <>
      <InfoBox
        currentFeature={flaeche}
        pixelwidth={350}
        // react-cismap only goes full width below its own breakpoint; these boxes
        // are only shown on narrow layouts, so keep them full width there too
        infoStyle={{ width: "calc(100vw - 25px)" }}
        header={<span>{flaechenart}</span>}
        headerColor="#F0AD4E"
        title={
          <span style={{ color: flaechenartColor }}>
            {`${flaechenart} ${flaeche.flaechenbezeichnung}`}
          </span>
        }
        links={[hintButton, editButton]}
        subtitle={content}
        hideNavigator={true}
      />
      {hint && (
        <Modal
          show={hintOpen}
          onHide={() => setHintOpen(false)}
          centered
          contentClassName="bg-transparent border-0"
        >
          <StatusNotification
            variant="warning"
            onClose={() => setHintOpen(false)}
            style={{
              marginBottom: 0,
              opacity: 0.9,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            {hint}
          </StatusNotification>
        </Modal>
      )}
    </>
  );
};

export default FlaechenInfoBox;
