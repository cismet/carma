import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import LicenseLBK from "react-cismap/topicmaps/wuppertal/LicenseLuftbildkarte";
import LicenseStadtplanTagNacht from "react-cismap/topicmaps/wuppertal/LicenseStadtplanTagNacht";

/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="datengrundlage"
      sectionTitle="Datengrundlagen"
      sectionBsStyle="warning"
      sectionContent={
        <div>
          <p>
            Die Ergebnisse der Simulation basieren maßgeblich auf den
            Modellgrundlagen und -annahmen. Die hieraus{" "}
            <a
              className="renderAsLink"
              onClick={() => setAppMenuActiveMenuSection("aussagekraft")}
            >
              resultierende Aussagekraft
            </a>{" "}
            der Simulationen wird gesondert beschrieben.
          </p>

          <p>
            Das simulierte Starkregenereignis wurde anhand einer
            2D-Oberflächenabflussmodellierung mit der Software FoodArea für die
            hydrologischen Einzugsgebiete der Stadt Saarlouis generiert.
            Wesentliche Grundlage ist das Digitale Geländemodell mit einer
            Auflösung von 1 x 1 Meter (DGM1). Dieses DGM1 wird mittels
            flächenhafter Höhenmessungen des Geländes, die das Saarland
            turnusmäßig per Laserscanning aus einem Flugzeug heraus durchführt
            (Zeitpunkt der Aufnahme 2016), ermittelt. Für die Simulation wurde
            das DGM1 mittels Digitalem Oberflächenmodel (DOM1; flächenhaften
            Höhenmessungen aller Objekte auf dem Gelände) und dem
            Liegenschaftskataster (ALK; 04/2019) um die Gebäude und sonstige
            Abflusshindernisse bzw. Geländeerhöhungen (u.a.{" "}
            Grundstücksbegrenzungsmauern, teilweise Bewuchs) ergänzt.
          </p>

          <p>
            Das optimierte Digitale Geländemodell wurde anschließend um wichtige
            Abflussinformationen entlang der einzelnen Gewässerabschnitte (u.a.{" "}
            Verrohrungen, Einlaufbauwerke, Brückenbauwerke) ergänzt, um eine
            hydrologisch korrekte Abflussberechnung zu gewährleisten. In diesem
            Zusammenhang wurden weitere maßgebliche
            siedlungswasserwirtschaftliche Bauwerke (Hochwasser- und
            Regenrückhaltebecken) mit ihrer Wirkung im Oberflächenmodell
            abgebildet. Zusätzlich wurden die Gebäude auf Aktualität geprüft und
            abgerissene oder geplante Gebäude gegebenenfalls angepasst. Sehr
            neue Gebäude, die nach dem Modellaufbau fertiggestellt wurden (z. B.{" "}
            Neubaugebiete) sind daher noch nicht im Datenbestand erfasst. Hier
            lassen sich dennoch wichtige Hinweise aus dem angrenzenden Gelände
            zur möglichen Überflutung ableiten (s. auch Schaltfläche: Fehler im
            Geländemodell melden). Zusätzlich zum Digitalen Geländemodell sind
            Informationen zur Bodenart und zur Flächennutzung in die Simulation
            eingeflossen. Hieraus lassen sich Rückschlusse bzgl. der
            Flächenversiegelung, der Versickerungsfähigkeit der Böden und der
            Rauigkeit der Oberflächenbeschaffenheit ziehen.
          </p>
          <p>
            Die Bemessungsgrenze des Kanalnetzes wird bei dem hier simulierten
            Ereignis überschritten. Der größte Anteil des Niederschlagwassers
            fließt oberirdisch ab, wobei im urbanen Raum sowohl die
            Leistungsfähigkeit als auch der Überstau des Kanalnetzes einen
            Einfluss auf die Überflutungssituation haben kann. Das
            Abflussverhalten des Kanalnetzes wurde im Rahmen dieser Betrachtung
            nicht berücksichtigt. Relevante Retentionsräume sowie
            Gewässerverrohrungen und Durchlässe wurden aufgrund ihrer Bedeutung
            für die Ableitungs- und Speicherwirkung von Oberflächenwasser als
            Elemente in das Modell aufgenommen. Je nach Regen und
            Randbedingungen in der Realität (z. B. Verklausungen, Baustellen,{" "}
            Sofortmaßnahmen etc.) können in Teilgebieten die Wassertiefen auf
            dem Gelände höher oder geringer ausfallen.{" "}
          </p>
          <p>
            Die benötigten Datensätze sind durch das Landesamt für Vermessung,
            Geoinformation und Landentwicklung des Saarlandes (LVGL) zur
            Verfügung gestellt worden.
          </p>

          <p>
            Zur Betrachtung der Ergebnisse stehen drei verschiedene
            Hintergrundkarten zur Verfügung, die auf den folgenden
            Geodatendiensten und Geodaten basieren:
          </p>
          <ul>
            <li>
              <strong>Basiskarte (grau)</strong>: Kartendienst (vektorbasiert)
              des BKG. <strong>basemap.de Web Vektor grau</strong>. Der
              Kartendienst basemap.de Web Vektor ist ein von Bund und Ländern
              gemeinsam entwickelter Kartendienst für Web und Mobil. Die
              deutschlandweite Karte wird monatlich aktualisiert, ständig
              weiterentwickelt und bietet die Qualität und Homogenität amtlicher
              Geodaten. Als Webkarte ermöglicht der Dienst freies Zoomen von der
              Deutschlandübersicht bis zu flächendeckenden 3D-Gebäudemodellen
              und amtlichen Hausnummern in modernem Design. (
              <a
                target="_legal"
                href="https://sgx.geodatenzentrum.de/web_public/gdz/lizenz/deu/basemapde_web_dienste_lizenz.pdf"
              >
                Lizenz basemap.de Web-Dienste
              </a>
              )
            </li>
            <li>
              <strong>Basiskarte (bunt)</strong>: Kartendienst (vektorbasiert)
              des BKG. <strong>basemap.de Web Vektor Relief</strong>. Der
              Kartendienst basemap.de Web Vektor ist ein von Bund und Ländern
              gemeinsam entwickelter Kartendienst für Web und Mobil. Die
              deutschlandweite Karte wird monatlich aktualisiert, ständig
              weiterentwickelt und bietet die Qualität und Homogenität amtlicher
              Geodaten. Als Webkarte ermöglicht der Dienst freies Zoomen von der
              Deutschlandübersicht bis zu flächendeckenden 3D-Gebäudemodellen
              und amtlichen Hausnummern in modernem Design. (
              <a
                target="_legal"
                href="https://sgx.geodatenzentrum.de/web_public/gdz/lizenz/deu/basemapde_web_dienste_lizenz.pdf"
              >
                Lizenz basemap.de Web-Dienste
              </a>
              )
            </li>
            <li>
              <strong>Luftbildkarte</strong>: (1) Kartendienst (WMS) des LVGL
              Saarland. Datengrundlage:{" "}
              <strong>Digitale Orthophotos (DOP) des Saarlandes</strong>{" "}
              WMS-Dienst für farbige, digitale, georeferenzierte, lagegenaue,
              entzerrte Luftbilder des Saarlandes. Lizenznummer DOP 33/16. (
              <a
                target="_legal"
                href="https://geoportal.saarland.de/mapbender/php/mod_showMetadata.php?languageCode=en&resource=layer&layout=tabs&id=46746"
              >
                weitere Informationen
              </a>
              ). (2) Basiskarte (bunt) (siehe oben)
            </li>
          </ul>
        </div>
      }
    />
  );
};
export default Component;
