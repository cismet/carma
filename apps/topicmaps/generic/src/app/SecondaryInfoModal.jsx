import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import Markdown from "./Markdown";
import GenericSecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import GenericSecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";

const SecondaryInfoModal = ({
  feature,
  setSecondaryInfoVisible,
  visible,
  footer,
}) => {
  if (feature) {
    const close = () => {
      setSecondaryInfoVisible(false);
    };

    const properties = feature?.properties?.secondaryInfos;
    let foto;
    if (properties?.image !== undefined) {
      foto = properties.image;
    }

    let links = getActionLinksForFeature(feature, {
      displayZoomToFeature: false,
      displaySecondaryInfoAction: false,
    });

    return (
      <GenericSecondaryInfo
        onHide={() => {
          close();
        }}
        uiHeight={"100%"}
        imageUrl={foto}
        //   setVisibleState={setSecondaryInfoVisible}
        title={properties?.title}
        titleIconName={properties?.iconName}
        mainSection={<Markdown content={properties?.md} />}
        subSections={properties?.secondarySections.map((item, index) => (
          <GenericSecondaryInfoPanelSection
            header={item.title}
            bsStyle={item.type}
            content={
              <div>
                {item.links && (
                  <div
                    style={{
                      paddingLeft: 10,
                      paddingRight: 10,
                      float: "right",
                      paddingBottom: "5px",
                    }}
                  >
                    {links}
                  </div>
                )}
                <Markdown content={item.md} />
              </div>
            }
          />
        ))}
        footer={footer}
      />
    );
  }
};

export default SecondaryInfoModal;
