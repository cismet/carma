import CollapsibleWell from "react-cismap/commons/CollapsibleWell";
import CollapsibleABWell from "react-cismap/commons/CollapsibleABWell";
import { useState } from "react";

export const MODES = { DEFAULT: "DEFAULT", AB: "AB" };

interface ResponsiveInfoBoxProps {
  panelClick: (event: React.MouseEvent) => void;
  pixelwidth: number;
  header: React.ReactNode;
  collapsedInfoBox: boolean;
  setCollapsedInfoBox: (value: boolean) => void;
  isCollapsible?: boolean;
  handleResponsiveDesign?: boolean;
  infoStyle?: React.CSSProperties;
  secondaryInfoBoxElements?: React.ReactNode[];
  alwaysVisibleDiv?: React.ReactNode;
  collapsibleDiv?: React.ReactNode;
  collapsibleStyle?: React.CSSProperties;
  fixedRow?: boolean;
  divWhenCollapsed?: React.ReactNode;
  divWhenLarge?: React.ReactNode;
  mode?: string;
}

const ResponsiveInfoBox = ({
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
  divWhenCollapsed,
  divWhenLarge,
  mode = MODES.DEFAULT,
}: ResponsiveInfoBoxProps) => {
  const [collapsed, setCollapsed] = useState(false);

  let infoBoxBottomMargin = 0;
  let infoBoxStyle = {
    opacity: "0.9",
    width: pixelwidth,
    ...infoStyle,
  };

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
      {/* <Control
        key={"InfoBoxElements." + responsiveState}
        id={"InfoBoxElements." + responsiveState}
      > */}
      <div
        style={{
          ...infoBoxStyle,
          marginBottom: infoBoxBottomMargin,
          fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
          fontSize: "0.75rem",
        }}
      >
        {header}
        {mode === MODES.DEFAULT && (
          <CollapsibleWell
            collapsed={collapsed}
            setCollapsed={setCollapsed}
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
        )}
        {mode === MODES.AB && (
          <CollapsibleABWell
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            style={{
              pointerEvents: "auto",
              padding: 0,
              paddingLeft: 9,
              ...collapsibleStyle,
            }}
            debugBorder={0}
            tableStyle={{ margin: 0 }}
            fixedRow={fixedRow}
            divWhenCollapsed={divWhenCollapsed}
            divWhenLarge={divWhenLarge}
            collapseButtonAreaStyle={collapseButtonAreaStyle}
            onClick={panelClick}
            pixelwidth={pixelwidth}
            isCollapsible={isCollapsible}
          />
        )}
      </div>
      {/* </Control> */}
      {secondaryInfoBoxElements.map((element, index) => (
        // <Control
        // >
        <div style={{ opacity: 0.9 }}>{element}</div>
        // </Control>
      ))}
    </div>
  );
};

export default ResponsiveInfoBox;
