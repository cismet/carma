import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import LicenseLBK from "react-cismap/topicmaps/wuppertal/LicenseLuftbildkarte";
import LicenseStadtplanTagNacht from "react-cismap/topicmaps/wuppertal/LicenseStadtplanTagNacht";
import aislogo from "./assets/Signet_AIS_RZ.png";
/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="allgemeineHinweise"
      sectionTitle="Allgemeine Hinweise"
      sectionBsStyle="warning"
      sectionContent={
        <div>
          <img
            alt="aislogo"
            src={aislogo}
            style={{ width: 300, margin: 20 }}
            align="right"
          />
          <p>
            Die Starkregengefahrenkarte im AIS Starkregenvorsorge Xanten stellt
            in zwei umschaltbaren Kartenansichten maximale Wassertiefen bzw.
            maximale Fließgeschwindigkeiten im gesamten Stadtgebiet dar, die im
            Verlauf von zwei simulierten Starkregenszenarien berechnet wurden.
            Bei den Ergebnissen handelt es sich um eine modelltechnische
            Untersuchung des Stadtgebiets mit dem Ziel die Realität möglichst
            gut abzubilden. Bei der Betrachtung und Interpretation der
            Ergebnisse sind die Modellgrundlagen und -annahmen zu
            berücksichtigen. Hinweise zur Aussagekraft der Ergebnisse werden
            nachfolgend beschrieben.
          </p>

          <p>
            Das Ergebnis der Simulation ist von der Dauer und Intensität des
            Regens abhängig, der für die Simulation angenommen wird. Wir bieten
            Ihnen hierzu zwei unterschiedliche{" "}
            <a
              className="renderAsLink"
              onClick={() => setAppMenuActiveMenuSection("szenarien")}
            >
              simulierte Szenarien
            </a>{" "}
            an, darunter ein außergewöhnlicher Starkregen (SRI 7) und ein
            extremer Starkregen (SRI 11) als "Modellregen".{" "}
          </p>

          <p>
            Der Farbverlauf für die <strong>Wassertiefen</strong> nutzt die
            Eckwerte 10 cm (hellblau), 30 cm (blau), 50 cm (dunkelblau) und 100
            cm (violett). Wassertiefen unter 5 cm werden nicht mehr farbig
            ausgeprägt (transparente Darstellung). Zur Visualisierung der{" "}
            <strong>Fließgeschwindigkeiten</strong>, angegeben in Meter pro
            Sekunde (m/s), werden die Eckwerte 0,3 m/s (gelb), 0,5 m/s (orange),
            1,3 m/s (hellrot) und 3,0 m/s (dunkelrot) verwendet. Der untere
            Grenzwert für die farbige Anzeige einer Fließgeschwindigkeit liegt
            bei 0,2 m/s.
          </p>

          <p>
            Die Simulationsberechnungen wurden durch das Ingenieurbüro Dr.
            Pecher AG (Erkrath/Gelsenkirchen) im Auftrag der Stadt Xanten
            durchgeführt.
          </p>

          <p>
            Das Auskunfts- und Informationssystem (AIS) Starkregenvorsorge ist
            im Rahmen des DBU-Projektes KLAS in Bremen entwickelt und seitdem
            ergänzt worden.
          </p>

          <p>
            Die Bemessungsgrenze des Kanalnetzes wird bei den hier simulierten
            Ereignissen überschritten. Der größte Anteil des Niederschlagwassers
            fließt oberirdisch ab, wobei im urbanen Raum sowohl die
            Leistungsfähigkeit des Kanalnetzes als auch der Überstau des
            Kanalnetzes einen Einfluss auf die Überflutungssituation haben kann.
            Das Abflussverhalten des Kanalnetzes wurde durch eine kombinierte
            Betrachtung berücksichtigt. Die Eigenschaften der Geländeoberfläche
            variieren je nach Flächennutzung. Die verschiedenen
            Oberflächeneigenschaften wurden im Modell über unterschiedliche
            Geländerauheiten und zeitlich variable Versickerungsansätze
            abgebildet. Relevante Retentionsräume sowie Gewässerverrohrungen und
            Durchlässe wurden aufgrund ihrer Bedeutung für die Ableitungs- und
            Speicherwirkung von Oberflächenwasser als Elemente in das Modell
            aufgenommen. Je nach Regen und Randbedingungen in der Realität
            können in Teilgebieten die Wassertiefen auf dem Gelände höher oder
            geringer ausfallen. Um diese Variationen zu verstehen und besser
            einschätzen zu können, sind die unterschiedlichen Szenarien
            dargestellt. Weitere Informationen sind in dem Reiter "Aussagekraft
            der Simulationen" zu finden.
          </p>
        </div>
      }
    />
  );
};
export default Component;
