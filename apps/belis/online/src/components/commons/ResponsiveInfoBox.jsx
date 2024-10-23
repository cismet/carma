import { useWindowSize } from "@react-hook/window-size";
import React, { useState } from "react";
import Control from "react-leaflet-control";

import CollapsibleWell from "./CollapsibleWell";

/* eslint-disable jsx-a11y/anchor-is-valid */

// Since this component is simple and static, there's no parent container for it.
const InfoBox = ({
  panelClick,
  pixelwidth,
  header,
  collapsedInfoBox,
  setCollapsedInfoBox,
  isCollapsible = true,
  handleResponsiveDesign = true,
  infoStyle = {},
  secondaryInfoBoxElements = [],
  alwaysVisibleDiv,
  collapsibleDiv,
  collapsibleStyle,
  fixedRow,
}) => {
  const [width] = useWindowSize();
  //todo brauche ich das?
  const gap = 0;
  const responsiveState = "normal";

  let infoBoxBottomMargin;
  if (handleResponsiveDesign === true) {
    if (responsiveState === "small") {
      infoBoxBottomMargin = 5;
    } else {
      infoBoxBottomMargin = 0;
    }
  }

  let infoBoxStyle = {
    opacity: "0.9",
    width: responsiveState === "normal" ? pixelwidth : width - gap,
    ...infoStyle,
  };

  const [localMinified, setLocalMinify] = useState(false);
  const minified = collapsedInfoBox || localMinified; //|| collapsedInfoBoxFromContext
  const minify = setCollapsedInfoBox || setLocalMinify; //|| setCollapsedInfoBoxFromContext

  let collapseButtonAreaStyle;
  if (fixedRow === false) {
    collapseButtonAreaStyle = {
      opacity: "0.9",
      width: 25,
    };
  } else {
    collapseButtonAreaStyle = {
      background: "#cccccc",
      opacity: "0.9",
      width: 25,
    };
  }

  return (
    <div>
      <Control
        key={"InfoBoxElements." + responsiveState}
        id={"InfoBoxElements." + responsiveState}
        position={responsiveState === "normal" ? "bottomright" : "bottomright"}
      >
        <div style={{ ...infoBoxStyle, marginBottom: infoBoxBottomMargin }}>
          {header}
          <CollapsibleWell
            collapsed={minified}
            setCollapsed={minify}
            style={{
              pointerEvents: "auto",
              padding: 0,
              paddingLeft: 9,
              ...collapsibleStyle,
            }}
            debugBorder={0}
            tableStyle={{ margin: 0 }}
            fixedRow={fixedRow}
            alwaysVisibleDiv={alwaysVisibleDiv}
            collapsibleDiv={collapsibleDiv}
            collapseButtonAreaStyle={collapseButtonAreaStyle}
            onClick={panelClick}
            pixelwidth={pixelwidth}
            isCollapsible={isCollapsible}
          />
        </div>
      </Control>
      {secondaryInfoBoxElements.map((element, index) => (
        <Control
          key={"secondaryInfoBoxElements." + index + "." + responsiveState}
          position={responsiveState === "normal" ? "bottomright" : "bottomright"}
        >
          <div style={{ opacity: 0.9 }}>{element}</div>
        </Control>
      ))}
    </div>
  );
};

export default InfoBox;
// InfoBox.propTypes = {
// 	featureCollection: PropTypes.array.isRequired,
// 	filteredPOIs: PropTypes.array.isRequired,
// 	selectedIndex: PropTypes.number.isRequired,
// 	next: PropTypes.func.isRequired,
// 	previous: PropTypes.func.isRequired,
// 	fitAll: PropTypes.func.isRequired,
// 	showModalMenu: PropTypes.func.isRequired,
// 	panelClick: PropTypes.func.isRequired
// };

// InfoBox.defaultProps = {
// 	featureCollection: [],
// 	filteredPOIs: [],
// 	selectedIndex: 0,
// 	fitAll: () => {},
// 	showModalMenu: () => {}
// };
