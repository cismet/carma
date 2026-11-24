import InfoBox from "react-cismap/topicmaps/InfoBox";
import {
  faEdit,
  faInfoCircle,
  faSearchLocation,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import type { ReactNode } from "react";
import PhoneSheet from "./PhoneSheet";
import InfoBoxActions from "./InfoBoxActions";
import type { InfoBoxAction } from "./InfoBoxActions";
import { getProcessedFlaechenCR } from "../../utils/kassenzeichenHelper";

/* eslint-disable @typescript-eslint/no-explicit-any -- Flaeche and CR objects are untyped */
interface FlaechenInfoBoxProps {
  flaechen: any[];
  selectedId: string | number;
  editMode: boolean;
  getCR: (flaeche: any) => any;
  onSelect: (flaeche: any) => void;
  onEdit: (flaeche: any, cr: any) => void;
  hints?: ReactNode[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const linkButtonClass = "btn btn-link p-0";
const linkButtonStyle = { color: "black", textDecoration: "none" };

const FlaechenInfoBox = ({
  flaechen,
  selectedId,
  editMode,
  getCR,
  onSelect,
  onEdit,
  hints,
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

  const actions: InfoBoxAction[] = [
    {
      key: "zoom",
      icon: faSearchLocation,
      title: "Auf Fläche zoomen",
      onClick: () => onSelect(flaeche),
    },
  ];
  if (hints?.length) {
    actions.push({
      key: "hint",
      icon: faInfoCircle,
      title: "Hinweise zur Fläche",
      onClick: () => setHintOpen(true),
    });
  }
  actions.push({
    key: "edit",
    icon: faEdit,
    title: "Fläche bearbeiten",
    onClick: () => onEdit(flaeche, cr ?? {}),
    disabled: !editMode,
  });

  // InfoBox's own navigator only works with a FeatureCollectionContext, so it gets its own
  const content = (
    <span
      style={{
        display: "block",
        marginTop: -20,
        marginBottom: "-1rem",
        paddingLeft: 3,
      }}
    >
      <span style={{ display: "block", fontSize: 15 }}>
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
            alignItems: "center",
            marginTop: 6,
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
          <span style={{ color: flaechenartColor, fontSize: 19 }}>
            {`${flaechenart} ${flaeche.flaechenbezeichnung}`}
          </span>
        }
        secondaryInfoBoxElements={[
          <InfoBoxActions key="actions" actions={actions} />,
        ]}
        subtitle={content}
        hideNavigator={true}
      />
      {hints?.length ? (
        <PhoneSheet
          show={hintOpen}
          onHide={() => setHintOpen(false)}
          title={`${flaechenart} ${flaeche.flaechenbezeichnung}`}
        >
          {hints.map((text, i) => (
            <div key={i} className="phone-sheet-card">
              {text}
            </div>
          ))}
        </PhoneSheet>
      ) : null}
    </>
  );
};

export default FlaechenInfoBox;
