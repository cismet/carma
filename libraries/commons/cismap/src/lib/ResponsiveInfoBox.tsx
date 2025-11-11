import CollapsibleWell from "react-cismap/commons/CollapsibleWell";
import CollapsibleABWell from "react-cismap/commons/CollapsibleABWell";
import { useContext, useEffect, useState } from "react";
import { Control } from "@carma-mapping/map-controls-layout";
// @ts-ignore
import { ResponsiveTopicMapDispatchContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

export const MODES = {
  DEFAULT: "DEFAULT",
  AB: "AB",
  BIG_MOBILE_ICONS: "BIG_MOBILE_ICONS",
};

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
  mapWidth?: number | null;
  infoBoxBottomMargin?: number;
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
  mapWidth,
  infoBoxBottomMargin = 0,
}: ResponsiveInfoBoxProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const mapAppWidth = mapWidth ? mapWidth : window.innerWidth;

  const { setInfoBoxPixelWidth } =
    useContext(ResponsiveTopicMapDispatchContext) || defaultContextValues;

  // For BIG_MOBILE_ICONS mode, use the external collapsed state or internal state
  const actualCollapsed =
    collapsedInfoBox !== undefined ? collapsedInfoBox : collapsed;
  const actualSetCollapsed =
    setCollapsedInfoBox !== undefined ? setCollapsedInfoBox : setCollapsed;

  let infoBoxStyle = {
    opacity: "0.9",
    width:
      typeof window !== "undefined" && mapAppWidth - 25 - pixelwidth - 300 <= 0
        ? mapAppWidth - 25
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
            pointerEvents: "auto",
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
          {mode === MODES.BIG_MOBILE_ICONS && (
            <CollapsibleWell
              collapsed={actualCollapsed}
              setCollapsed={actualSetCollapsed}
              style={{
                pointerEvents: "auto",
                padding: 0,
                paddingLeft: 9,
                ...collapsibleStyle,
              }}
              debugBorder={0}
              tableStyle={{ margin: 0 }}
              fixedRow={fixedRow}
              alwaysVisibleDiv={
                <div>
                  {alwaysVisibleDiv}
                  {collapsibleDiv}
                </div>
              }
              collapsibleDiv={<div style={{ display: "none" }} />}
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
              pointerEvents: "auto",
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
