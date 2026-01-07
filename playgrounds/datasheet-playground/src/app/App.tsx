import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import Datasheet from "./Datasheet";

suppressReactCismapErrors(true);

export function App() {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <Datasheet
        mainComponent={
          <TopicMapComponent
            gazetteerSearchControl={true}
            gazetteerSearchComponent={EmptySearchComponent}
            hamburgerMenu={false}
            locatorControl={false}
            fullScreenControl={false}
            zoomControls={false}
            leafletMapProps={{ editable: true }}
          />
        }
        datasheetComponent={
          <div style={{ padding: 24, maxWidth: 600 }}>
            <h2 style={{ marginBottom: 16 }}>Datenblatt</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td
                    style={{
                      padding: "8px 0",
                      fontWeight: "bold",
                      width: "40%",
                    }}
                  >
                    Name
                  </td>
                  <td style={{ padding: "8px 0" }}>Rathaus Wuppertal</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 0", fontWeight: "bold" }}>
                    Adresse
                  </td>
                  <td style={{ padding: "8px 0" }}>
                    Johannes-Rau-Platz 1, 42275 Wuppertal
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 0", fontWeight: "bold" }}>
                    Baujahr
                  </td>
                  <td style={{ padding: "8px 0" }}>1966</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 0", fontWeight: "bold" }}>
                    Nutzung
                  </td>
                  <td style={{ padding: "8px 0" }}>Verwaltungsgebäude</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 0", fontWeight: "bold" }}>
                    Fläche
                  </td>
                  <td style={{ padding: "8px 0" }}>12.500 m²</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 0", fontWeight: "bold" }}>
                    Eigentümer
                  </td>
                  <td style={{ padding: "8px 0" }}>Stadt Wuppertal</td>
                </tr>
              </tbody>
            </table>
          </div>
        }
      />
    </div>
  );
}
