import CollapsibleWell from "react-cismap/commons/CollapsibleWell";
import CollapsibleABWell from "react-cismap/commons/CollapsibleABWell";
import { useContext, useEffect, useState } from "react";
import {
  Control,
  DEFAULT_CONTROL_STYLE_OPTIONS,
} from "@carma-mapping/map-controls-layout";
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
  headerBackgroundColor?: string;
  headerStyle?: React.CSSProperties;
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
  controlOrder?: number;
  infoBoxDataAttributes?: Record<string, string>;
}

export const ResponsiveInfoBox = ({
  panelClick,
  pixelwidth,
  header,
  headerBackgroundColor,
  headerStyle,
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
  controlOrder = 11,
  infoBoxDataAttributes,
}: ResponsiveInfoBoxProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const mapAppWidth = mapWidth ? mapWidth : window.innerWidth;

  const { setInfoBoxPixelWidth } =
    useContext(ResponsiveTopicMapDispatchContext) || defaultContextValues;
  const {
    contentInsetLeft,
    defaultFontFamily,
    defaultFontSize,
    headerInsetOffset,
  } = DEFAULT_CONTROL_STYLE_OPTIONS.layout;
  const headerInsetLeft = `calc(${contentInsetLeft} + ${headerInsetOffset})`;
  const renderedHeader = headerBackgroundColor ? (
    <div
      style={{
        backgroundColor: headerBackgroundColor,
        boxSizing: "border-box",
        paddingLeft: headerInsetLeft,
        width: "100%",
        ...headerStyle,
      }}
    >
      {header}
    </div>
  ) : (
    header
  );

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
      <Control position="bottomright" order={controlOrder}>
        <div
          {...infoBoxDataAttributes}
          data-test-id="info-box"
          style={{
            ...infoBoxStyle,
            marginBottom: infoBoxBottomMargin,
            fontFamily: defaultFontFamily,
            fontSize: defaultFontSize,
            pointerEvents: "auto",
          }}
        >
          {renderedHeader}
          {mode === MODES.DEFAULT && (
            <CollapsibleWell
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              style={{
                pointerEvents: "auto",
                padding: 0,
                paddingLeft: contentInsetLeft,
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
                paddingLeft: contentInsetLeft,
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
                paddingLeft: contentInsetLeft,
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
          order={controlOrder - 1 - index}
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
