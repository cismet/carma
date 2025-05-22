import Section from "react-cismap/topicmaps/menu/Section";
import { MappingConstants, getLayersByName } from "react-cismap";
import PreviewMap from "react-cismap/topicmaps/menu/PreviewMap";
import Form from "react-bootstrap/Form";
// import { Map } from "react-leaflet";
// import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import SettingsPanelWithPreviewSection from "./SettingsPanelWithPreviewSection";
import { useDispatch } from "react-redux";
import { setSelectedBackgroundIndex } from "../../../store/slices/mapping";

interface Menu30KartenhintergruendeProps {
  selectedBackgroundIndex: number;
  backgrounds: Array<{
    title: string;
    layerkey: string;
  }>;
  width?: number;
  urlSearch: string;
  showOpened?: boolean;
}

const Menu30Kartenhintergruende = ({
  selectedBackgroundIndex,
  backgrounds = [],
  width = 20,
  urlSearch,
  showOpened = false,
}: Menu30KartenhintergruendeProps) => {
  const dispatch = useDispatch();
  let namedMapStyle =
    new URLSearchParams(urlSearch).get("mapStyle") || "default";
  let zoom = 13;
  //   let layers = backgrounds[selectedBackgroundIndex]?.layerkey;
  let layers = backgrounds[selectedBackgroundIndex]?.layerkey;

  const mapPreview = (
    <PreviewMap
      crs={MappingConstants.crs25832}
      style={{
        height: 300,
      }}
      center={{
        lat: 51.26357182763206,
        lng: 7.176242149341344,
      }}
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      keyboard={false}
      zoom={zoom}
      minZoom={zoom}
      maxZoom={zoom}
    >
      {/* {getLayersByName(layers, namedMapStyle)} */}
      {getLayersByName(layers)}
    </PreviewMap>
  );
  const preview = (
    <div>
      <Form>
        <Form.Label>Vorschau:</Form.Label>
        {mapPreview}
      </Form>
    </div>
  );

  return (
    <Section
      key="kartenhintergruende"
      sectionKey="kartenhintergruende"
      {...(showOpened ? { activeSectionKey: "kartenhintergruende" } : {})}
      sectionTitle="Hintergrundkarten"
      sectionBsStyle="info"
      sectionContent={
        <div>
          <p>
            Weiter unten finden Sie ein Kontrollfeld, mit dem Sie aus drei
            verschiedenen Hintergrundkarten auswählen können: einer
            topographischen Karte in Graustufen ("Top. Karte"), einer
            Luftbildkarte und einem Stadtplan.
          </p>
          <p>
            Die topographische Karte verschafft Ihnen den besten Überblick über
            die Geländesituation, da sie bedeutende Böschungen und Geländeformen
            darstellt. Der Stadtplan ist die am einfachsten lesbare
            Hintergrundkarte. Er eignet sich für die schnelle Orientierung in
            der Karte, da hier die Hausnummern aller Gebäude gut lesbar
            dargestellt werden. Die Luftbildkarte ist die anschaulichste
            Kartengrundlage, nützlich vor allem für Detailbetrachtungen. Sie ist
            aber nicht identisch mit den Luftbildern, die für die Ermittlung der
            versiegelten Flächen verwendet werden.
          </p>
          <p>
            Die Hintergrundkarte kann auch direkt im Kartenfenster gewechselt
            werden. Mit einem Klick auf die Hintergrund-Schaltfläche (links oben
            unterhalb der Schaltflächen + und - für die Zoomstufen) kommen Sie
            zur nächsten voreingestellten Karte, ohne das Anwendungsmenü öffnen
            zu müssen.
          </p>
          <SettingsPanelWithPreviewSection
            width={width}
            preview={preview}
            settingsSections={[
              <Form key="kartenselector">
                {" "}
                <Form.Label>Hintergrundkarten</Form.Label> <br />{" "}
                {backgrounds.map((bg, idx) => {
                  return (
                    <Form.Check
                      key={idx}
                      type="radio"
                      id={`cboMapStyleChooser_${idx}`}
                      name="mapBackground"
                      inline
                      label={bg.title}
                      checked={selectedBackgroundIndex === idx}
                      onChange={() => {
                        dispatch(
                          setSelectedBackgroundIndex({
                            selectedBackgroundIndex: idx,
                          })
                        );
                      }}
                    />
                  );
                })}{" "}
              </Form>,
            ]}
          />{" "}
        </div>
      }
    />
  );
};
export default Menu30Kartenhintergruende;
