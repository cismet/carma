import React, { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import SecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import SecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import { SecondaryInfoFooter } from "@carma-collab/wuppertal/klimaorte";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const InfoPanel = () => {
  const { selectedFeature, items } = useContext(FeatureCollectionContext);

  const item = selectedFeature?.properties;

  let foto;
  if (item.bild !== undefined) {
    foto =
      "https://www.wuppertal.de/geoportal/standort_klima/fotos/" + item.bild;
  }

  const weitereAngebote = items.filter(
    (testItem) =>
      testItem.typ === "ort" &&
      testItem?.standort.id === item.standort?.id &&
      testItem.id !== item.id,
  );
  //data structure for "weitere Angebote"
  // gruppenwechsel for thema

  const addOffers = {};
  for (const ang of weitereAngebote) {
    if (addOffers[ang.thema.name] === undefined) {
      addOffers[ang.thema.name] = [];
    }
    addOffers[ang.thema.name].push(ang.kategorien);
  }

  const subSections = [
    <SecondaryInfoPanelSection
      key="standort"
      bsStyle="info"
      header={"Standort: " + item?.standort?.name}
    >
      <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
        {item?.standort && (
          <b>
            {item?.standort?.strasse} {item?.standort?.hausnummer}
            <br />
            {item?.standort?.plz} {item?.standort?.stadt}
            <br />
          </b>
        )}

        {item?.standort?.beschreibung && (
          <div>
            {item?.standort?.beschreibung}
            <br />
          </div>
        )}
        {item?.standort?.bemerkung && (
          <div>
            {item?.standort?.bemerkung} <br />
          </div>
        )}

        {item?.standort?.kommentar && (
          <div>
            <br></br> <i>{item?.standort?.kommentar} </i>
          </div>
        )}

        {item?.standort?.erreichbarkeit && (
          <div>
            <br></br> Erreichbarkeit über {item?.standort?.erreichbarkeit}
          </div>
        )}
      </div>
    </SecondaryInfoPanelSection>,
  ];
  let first = true;
  if (weitereAngebote.length > 0) {
    subSections.push(
      <SecondaryInfoPanelSection
        key="weitereAngebote"
        header="Weitere Angebote an diesem Standort:"
        bsStyle="success"
      >
        <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
          <table border={0} style={{ xwidth: "100%" }}>
            <tbody>
              {Object.keys(addOffers).map((key, index) => {
                let separator = null;
                if (first !== true) {
                  separator = (
                    <tr key={"sep.tr." + index} colspan={2}>
                      <td
                        style={{
                          paddingLeft: 5,
                          paddingright: 5,
                          borderBottom: "1px solid #dddddd",
                        }}
                      ></td>
                      <td
                        style={{
                          paddingLeft: 5,
                          paddingright: 5,
                          borderBottom: "1px solid #dddddd",
                        }}
                      ></td>
                    </tr>
                  );
                }

                first = false;
                return (
                  <React.Fragment key={"span" + index}>
                    {separator}
                    <tr style={{ paddingBottom: 10 }} key={"addAng" + index}>
                      <td
                        style={{ verticalAlign: "top", padding: 5 }}
                        key={"addAng.L." + index}
                      >
                        {key}:
                      </td>
                      <td
                        style={{ verticalAlign: "top", padding: 5 }}
                        key={"addAng.R." + index}
                      >
                        {addOffers[key].map((val, index) => {
                          return (
                            <div key={"kategorien." + index}>
                              {val.join(", ")}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* <pre>{JSON.stringify(addOffers, null, 2)}</pre> */}
      </SecondaryInfoPanelSection>,
    );
  }

  let minHeight4MainSextion = undefined;
  if (foto !== undefined) {
    minHeight4MainSextion = 250;
  }
  return (
    <SecondaryInfo
      titleIconName="info-circle"
      title={"Datenblatt: " + item.info.title}
      mainSection={
        <div style={{ width: "100%", minHeight: minHeight4MainSextion }}>
          {foto !== undefined && (
            <img
              alt="Bild"
              style={{
                paddingLeft: 10,
                paddingRight: 10,
                float: "right",
                paddingBottom: "5px",
              }}
              src={foto}
              width="250"
            />
          )}
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {item.beschreibung && (
              <b>
                {item.beschreibung}
                <br />
              </b>
            )}
            {item.bemerkung && (
              <div>
                {item.bemerkung} <br />
              </div>
            )}
            {item.kommentar && (
              <div>
                <br></br>
                <i>{item.kommentar} </i>
              </div>
            )}
          </div>
        </div>
      }
      subSections={subSections}
      footer={
        <SecondaryInfoFooter version={getApplicationVersion(versionData)} />
      }
    />
  );
};
export default InfoPanel;
