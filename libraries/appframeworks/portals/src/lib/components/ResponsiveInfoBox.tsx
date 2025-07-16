import CollapsibleWell from "react-cismap/commons/CollapsibleWell";
import CollapsibleABWell from "react-cismap/commons/CollapsibleABWell";
import { useContext, useEffect, useState } from "react";
import { Control } from "@carma-mapping/map-controls-layout";
// @ts-ignore
import { ResponsiveTopicMapDispatchContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

export const MODES = { DEFAULT: "DEFAULT", AB: "AB" };

interface ResponsiveInfoBoxProps {
  panelClick: (event: React.MouseEvent) => void;
  pixelwidth: number;
  header: React.ReactNode;
  collapsedInfoBox?: boolean;
  setCollapsedInfoBox?: (value: boolean) => void;
  isCollapsible?: boolean;
  handleResponsiveDesign?: boolean;
  infoStyle?: React.CSSProperties;
  secondaryInfoBoxElements?: React.ReactNode[];
  alwaysVisibleDiv?: React.ReactNode;
  collapsibleDiv?: React.ReactNode;
  collapsibleStyle?: React.CSSProperties;
  fixedRow?: boolean;
  defaultContextValues?: any;
  divWhenCollapsed?: React.ReactNode;
  divWhenLarge?: React.ReactNode;
  mode?: string;
}

export const ResponsiveInfoBox = ({
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
  defaultContextValues = {},
  divWhenCollapsed,
  divWhenLarge,
  mode = MODES.DEFAULT,
}: ResponsiveInfoBoxProps) => {
  const [collapsed, setCollapsed] = useState(false);

  const { setInfoBoxPixelWidth } =
    useContext(ResponsiveTopicMapDispatchContext) || defaultContextValues;

  let infoBoxBottomMargin = 0;
  let infoBoxStyle = {
    opacity: "0.9",
    width:
      typeof window !== "undefined" &&
      window.innerWidth - 25 - pixelwidth - 300 <= 0
        ? window.innerWidth - 25
        : pixelwidth,
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

  useEffect(() => {
    setInfoBoxPixelWidth(pixelwidth);
  }, [pixelwidth]);

  return (
    <div>
      <Control position="bottomright" order={11}>
        <div
          data-test-id="info-box"
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
      </Control>
      {secondaryInfoBoxElements.map((element, index) => (
        <Control
          position="bottomright"
          order={10 - index}
          key={"secondaryElement_" + index}
        >
          <div
            style={{
              opacity: 0.9,
            }}
          >
            {element}
          </div>
        </Control>
      ))}
    </div>
  );
};

export default ResponsiveInfoBox;
