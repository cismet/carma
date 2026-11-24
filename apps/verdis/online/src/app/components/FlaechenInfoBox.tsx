import {
  faEdit,
  faInfoCircle,
  faSearchLocation,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import type { ReactNode } from "react";
import PhoneSheet from "./PhoneSheet";
import PhoneInfoBox from "./PhoneInfoBox";
import type { InfoBoxAction } from "./InfoBoxActions";
import { getProcessedFlaechenCR } from "../../utils/kassenzeichenHelper";
import { getColorFromFlaechenArt } from "../../utils/kassenzeichenMappingTools";

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

  return (
    <>
      <PhoneInfoBox
        feature={flaeche}
        header={flaechenart}
        headerColor={getColorFromFlaechenArt(
          flaeche.flaecheninfo.flaechenart.art
        )}
        title={`${flaechenart} ${flaeche.flaechenbezeichnung}`}
        titleColor={flaechenartColor}
        details={
          <>
            <span style={{ color: groesseColor }}>
              {flaeche.anteil
                ? `${flaeche.anteil} m² von ${groesse} m²`
                : `${groesse} m²`}
            </span>
            {flaeche.flaecheninfo.beschreibung &&
              `, ${flaeche.flaecheninfo.beschreibung.beschreibung}`}
            {", "}
            <span style={{ color: anschlussgradColor }}>{anschlussgrad}</span>
          </>
        }
        index={index}
        count={flaechen.length}
        itemName="Fläche"
        onGo={(i) => onSelect(flaechen[i])}
        actions={actions}
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
