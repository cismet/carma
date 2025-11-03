import { useContext, useEffect, useState } from "react";
import { ResponsiveInfoBox, MODES } from "./ResponsiveInfoBox";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import Color from "color";
import parseHtml from "html-react-parser";
import Button from "react-bootstrap/Button";
import Icon from "react-cismap/commons/Icon";
import IconLink from "react-cismap/commons/IconLink";
import { Dropdown, Menu } from "antd";
import { isHtmlString } from "@carma-commons/utils";

interface InfoBoxProps {
  currentFeature?: any;
  featureCollection?: any;
  selectedIndex?: any;
  next?: any;
  previous?: any;
  fitAll?: any;
  panelClick?: any;
  pixelwidth: any;
  header: string | JSX.Element;
  headerColor: string;
  links?: any;
  title?: any;
  subtitle?: any;
  additionalInfo?: any;
  zoomToAllLabel?: any;
  currentlyShownCountLabel?: any;
  collapsedInfoBox?: any;
  setCollapsedInfoBox?: any;
  noCurrentFeatureTitle?: any;
  noCurrentFeatureContent?: any;
  isCollapsible?: any;
  collapsible?: boolean;
  hideNavigator?: any;
  handleResponsiveDesign?: any;
  infoStyle?: any;
  fixedRow?: any;
  secondaryInfoBoxElements?: any;
  colorizer?: any;
  defaultContextValues?: any;
  mapWidth?: number | null;
  infoBoxBottomResMargin?: number;
  bigMobileIconsInsteadOfCollapsing?: boolean;
}

type LightboxDispatch = {
  setPhotoUrls: (urls: string[]) => void;
  setIndex: (i: number) => void;
  setTitle: (t: string) => void;
  setCaptions: (t: string[]) => void;
  setVisible: (v: boolean) => void;
};

export const InfoBox = ({
  currentFeature,
  featureCollection,
  selectedIndex,
  next,
  previous,
  fitAll,
  panelClick,
  pixelwidth,
  header,
  headerColor,
  links,
  title,
  subtitle,
  additionalInfo,
  zoomToAllLabel,
  currentlyShownCountLabel,
  collapsedInfoBox,
  setCollapsedInfoBox,
  noCurrentFeatureTitle,
  noCurrentFeatureContent,
  isCollapsible = true,
  collapsible = true,
  hideNavigator = false,
  handleResponsiveDesign = true,
  infoStyle = {},
  fixedRow = true,
  secondaryInfoBoxElements = [],
  mapWidth = null,
  infoBoxBottomResMargin = 0,
  colorizer = (props) => ((props || {}).properties || {}).color, //
  defaultContextValues = {},
  bigMobileIconsInsteadOfCollapsing = false,
}: InfoBoxProps) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const featureCollectionContext =
    useContext<typeof FeatureCollectionContext>(FeatureCollectionContext) ||
    defaultContextValues;
  const { fitBoundsForCollection } =
    useContext<typeof FeatureCollectionDispatchContext>(
      FeatureCollectionDispatchContext
    ) || defaultContextValues;
  const {
    shownFeatures = [],
    selectedFeature,
    items = [],
  } = featureCollectionContext || defaultContextValues;
  const featureCollectionDispatchContext =
    useContext<typeof FeatureCollectionDispatchContext>(
      FeatureCollectionDispatchContext
    ) || defaultContextValues;
  const { responsiveState, searchBoxPixelWidth, gap, windowSize } =
    useContext<typeof ResponsiveTopicMapContext>(ResponsiveTopicMapContext) ||
    defaultContextValues;
  const { additionalStylingInfo } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );
  const lightBoxDispatchContext = useContext(
    LightBoxDispatchContext
  ) as LightboxDispatch;

  useEffect(() => {
    const fotoCaptions =
      currentFeature?.properties?.info?.fotoCaptions ||
      currentFeature?.properties?.fotoCaptions;

    if (
      currentFeature &&
      fotoCaptions &&
      fotoCaptions.length > 0 &&
      lightBoxDispatchContext?.setCaptions
    ) {
      lightBoxDispatchContext.setCaptions(fotoCaptions);
    }
  }, [currentFeature]);

  // Determine the actual collapsed state
  const isCollapsed =
    collapsedInfoBox !== undefined ? collapsedInfoBox : internalCollapsed;
  const setIsCollapsed =
    setCollapsedInfoBox !== undefined
      ? setCollapsedInfoBox
      : setInternalCollapsed;

  const gotoPrevious = featureCollectionDispatchContext.prev;
  const gotoNext = featureCollectionDispatchContext.next;

  let _fitAll;
  if (fitAll === undefined) {
    _fitAll = fitBoundsForCollection;
  } else {
    _fitAll = fitAll;
  }
  let _next, _previous, infoBoxBottomMargin;
  if (handleResponsiveDesign === true) {
    if (responsiveState === "small") {
      infoBoxBottomMargin = 5;
    } else {
      infoBoxBottomMargin = 0;
    }
  }
  let _currentFeature = currentFeature;
  if (!_currentFeature) {
    if (featureCollectionContext != undefined) {
      _currentFeature = selectedFeature;
      if (next === undefined) {
        _next = () => {
          gotoNext();
        };
      } else {
        _next = next;
      }
      if (previous === undefined) {
        _previous = () => {
          gotoPrevious();
        };
      } else {
        _previous = previous;
      }
    } else {
      _currentFeature = featureCollection[selectedIndex];
    }
  }

  let featureRenderingOption = additionalStylingInfo?.featureRenderingOption;
  let headerBackgroundColor = Color(headerColor || colorizer(_currentFeature));

  let textColor = "black";
  if (headerBackgroundColor.isDark()) {
    textColor = "white";
  }
  let llVis = (
    <table style={{ width: "100%" }}>
      <tbody>
        <tr>
          {typeof header === "string" && isHtmlString(header) ? (
            parseHtml(header)
          ) : (
            <td
              style={{
                textAlign: "left",
                verticalAlign: "top",
                background: headerBackgroundColor,
                color: textColor,
                opacity: "0.9",
                paddingLeft: "3px",
                paddingTop: "0px",
                paddingBottom: "0px",
              }}
            >
              {header}
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );

  let alwaysVisibleDiv, collapsibleDiv;
  let actionLinkInfos: any[] = [];

  // Convert links to actionLinkInfos format if bigMobileIconsInsteadOfCollapsing is enabled
  if (bigMobileIconsInsteadOfCollapsing && links && Array.isArray(links)) {
    actionLinkInfos = links
      .map((link: any) => {
        if (!link) return null;
        return {
          iconname: link.props?.iconname,
          iconspan: link.props?.children,
          tooltip: link.props?.tooltip,
          onClick: link.props?.onClick,
          href: link.props?.href,
          target: link.props?.target,
          subs: link.props?.subs,
        };
      })
      .filter(Boolean);
  }

  if (_currentFeature) {
    alwaysVisibleDiv = (
      <table border={0} style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: "left",
                padding: "5px",
                maxWidth: "160px",
                overflowWrap: "break-word",
              }}
            >
              {title && title.startsWith && title.startsWith("<html>") ? (
                <div>{parseHtml(title.match(/<html>(.*?)<\/html>/)[1])}</div>
              ) : (
                <h5>
                  <b>{title}</b>
                </h5>
              )}
            </td>
            <td style={{ textAlign: "right", paddingRight: 7 }}>
              {bigMobileIconsInsteadOfCollapsing && isCollapsed
                ? // Show small icons when collapsed
                  actionLinkInfos.map((li: any, index: number) => {
                    if (li.subs) {
                      const items = li.subs.map(
                        (sub: any, subIndex: number) => {
                          return {
                            key: subIndex,
                            label: (
                              <h4 onClick={sub.onClick}>
                                <span
                                  style={{
                                    marginRight: 10,
                                    opacity: 0.5,
                                  }}
                                >
                                  {sub.iconname && <Icon name={sub.iconname} />}
                                  {sub.iconspan && sub.iconspan}
                                </span>
                                <span style={{ margin: 3 }}>{sub.title}</span>
                              </h4>
                            ),
                          };
                        }
                      );

                      const menu = (
                        <Menu style={{ opacity: 0.8 }} items={items} />
                      );
                      return (
                        <Dropdown
                          key={`dropdown.${index}`}
                          overlay={menu}
                          placement="topRight"
                          trigger={["click"]}
                        >
                          <span style={{ paddingLeft: index > 0 ? 3 : 0 }}>
                            <IconLink
                              key={`iconlink${index}`}
                              tooltip={li.tooltip}
                              onClick={li.onClick}
                              iconname={li.iconname || li.iconspan}
                            />
                          </span>
                        </Dropdown>
                      );
                    } else {
                      return (
                        <span
                          key={`span.${index}`}
                          style={{ paddingLeft: index > 0 ? 3 : 0 }}
                        >
                          {li.iconname && (
                            <IconLink
                              key={`iconlink${index}`}
                              tooltip={li.tooltip}
                              onClick={li.onClick}
                              href={li.href}
                              target={li.target}
                              iconname={li.iconname || li.iconspan}
                            />
                          )}
                          {li.iconspan && (
                            <a
                              style={{
                                fontSize: "1.5rem",
                                paddingRight: "2px",
                                paddingTop: "3px",
                                color: "grey",
                                width: "26px",
                                textAlign: "center",
                                cursor: "pointer",
                              }}
                              onClick={li.onClick}
                              href={li.href}
                              target={li.target}
                            >
                              {li.iconspan}
                            </a>
                          )}
                        </span>
                      );
                    }
                  })
                : // Show normal links when not using bigMobileIconsInsteadOfCollapsing or when not collapsed
                  !bigMobileIconsInsteadOfCollapsing && [links]}
            </td>
          </tr>
        </tbody>
      </table>
    );
    collapsibleDiv = (
      <div style={{ marginRight: 9 }}>
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ textAlign: "left", verticalAlign: "top" }}>
                <table style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td style={{ textAlign: "left" }}>
                        <h6>
                          {additionalInfo &&
                            additionalInfo.startsWith &&
                            additionalInfo.startsWith("<html>") && (
                              <div>
                                {parseHtml(
                                  additionalInfo.match(/<html>(.*?)<\/html>/)[1]
                                )}
                              </div>
                            )}
                          {additionalInfo &&
                            (!additionalInfo.startsWith ||
                              !additionalInfo.startsWith("<html>")) &&
                            additionalInfo.split("\n").map((item, key) => {
                              return (
                                <span key={key}>
                                  {item}
                                  <br />
                                </span>
                              );
                            })}
                        </h6>
                        {subtitle &&
                          subtitle.startsWith &&
                          subtitle.startsWith("<html>") && (
                            <div>
                              {" "}
                              {parseHtml(
                                subtitle.match(/<html>(.*?)<\/html>/)[1]
                              )}
                            </div>
                          )}
                        {subtitle &&
                          (!subtitle.startsWith ||
                            !subtitle.startsWith("<html>")) && (
                            <p style={{ whiteSpace: "pre-line" }}>{subtitle}</p>
                          )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
        {hideNavigator === false && (
          <div>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td />
                  <td style={{ textAlign: "center", verticalAlign: "center" }}>
                    <a
                      className="renderAsProperLink"
                      onClick={() => {
                        _fitAll();
                      }}
                    >
                      {zoomToAllLabel}
                    </a>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            <table style={{ width: "100%", marginBottom: 9 }}>
              <tbody>
                <tr>
                  <td
                    title="vorheriger Treffer"
                    style={{ textAlign: "left", verticalAlign: "center" }}
                  >
                    <a className="renderAsProperLink" onClick={_previous}>
                      &lt;&lt;
                    </a>
                  </td>
                  <td style={{ textAlign: "center", verticalAlign: "center" }}>
                    {currentlyShownCountLabel}
                  </td>

                  <td
                    title="nächster Treffer"
                    style={{ textAlign: "right", verticalAlign: "center" }}
                  >
                    <a className="renderAsProperLink" onClick={_next}>
                      &gt;&gt;
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  } else {
    alwaysVisibleDiv = noCurrentFeatureTitle;
    collapsibleDiv = (
      <div style={{ paddingRight: 2 }}>{noCurrentFeatureContent}</div>
    );
  }

  // Calculate the actual width that matches ResponsiveInfoBox's calculation
  const mapAppWidth = mapWidth
    ? mapWidth
    : typeof window !== "undefined"
    ? window.innerWidth
    : pixelwidth;
  const actualWidth =
    typeof window !== "undefined" && mapAppWidth - 25 - pixelwidth - 300 <= 0
      ? mapAppWidth - 25
      : pixelwidth;

  // Prepare secondary elements with large action buttons when bigMobileIconsInsteadOfCollapsing is enabled
  let finalSecondaryElements = [...secondaryInfoBoxElements];

  if (
    bigMobileIconsInsteadOfCollapsing &&
    !isCollapsed &&
    actionLinkInfos.length > 0
  ) {
    // Add large action buttons above the infobox when not collapsed
    const largeButtonsElement = (
      <div
        key="large-action-buttons"
        style={{
          width: actualWidth,
          display: "flex",
          gap: "5px",
          paddingBottom: 5,
        }}
      >
        {actionLinkInfos.map((li: any, index: number) => {
          if (li.subs) {
            const items = li.subs.map((sub: any, subIndex: number) => {
              return {
                key: subIndex,
                label: (
                  <h4 onClick={sub.onClick}>
                    <span
                      style={{
                        marginRight: 10,
                        opacity: 0.5,
                      }}
                    >
                      {sub.iconname && <Icon name={sub.iconname} />}
                      {sub.iconspan && sub.iconspan}
                    </span>
                    <span style={{ margin: 3 }}>{sub.title}</span>
                  </h4>
                ),
              };
            });

            const menu = <Menu style={{ opacity: 0.8 }} items={items} />;

            return (
              <Dropdown
                key={`dropdown.${index}`}
                overlay={menu}
                placement="topRight"
                trigger={["click"]}
              >
                <Button
                  style={{
                    opacity: 0.7,
                    margin: 0,
                    flex: 1,
                  }}
                  key={`actionbutton.${index}`}
                  size="lg"
                  variant="light"
                  title={li.tooltip}
                >
                  <h2>
                    {li.iconname && <Icon name={li.iconname} />}
                    {li.iconspan && li.iconspan}
                  </h2>
                </Button>
              </Dropdown>
            );
          } else {
            // If there's an href, wrap the button in an anchor tag
            if (li.href) {
              return (
                <a
                  key={`actionlink.${index}`}
                  href={li.href}
                  target={li.target}
                  style={{ flex: 1, textDecoration: "none" }}
                >
                  <Button
                    style={{
                      opacity: 0.7,
                      margin: 0,
                      width: "100%",
                    }}
                    size="lg"
                    variant="light"
                    title={li.tooltip}
                  >
                    <h2>
                      {li.iconname && <Icon name={li.iconname} />}
                      {li.iconspan && li.iconspan}
                    </h2>
                  </Button>
                </a>
              );
            } else {
              return (
                <Button
                  style={{
                    opacity: 0.7,
                    margin: 0,
                    flex: 1,
                  }}
                  key={`actionbutton.${index}`}
                  size="lg"
                  variant="light"
                  onClick={li.onClick}
                  title={li.tooltip}
                >
                  <h2>
                    {li.iconname && <Icon name={li.iconname} />}
                    {li.iconspan && li.iconspan}
                  </h2>
                </Button>
              );
            }
          }
        })}
      </div>
    );

    // Prepend the large buttons to the secondary elements
    finalSecondaryElements = [largeButtonsElement, ...finalSecondaryElements];
  }

  return (
    <ResponsiveInfoBox
      panelClick={panelClick}
      pixelwidth={pixelwidth}
      header={llVis}
      collapsedInfoBox={isCollapsed}
      setCollapsedInfoBox={setIsCollapsed}
      isCollapsible={collapsible}
      handleResponsiveDesign={handleResponsiveDesign}
      infoStyle={infoStyle}
      secondaryInfoBoxElements={finalSecondaryElements}
      alwaysVisibleDiv={alwaysVisibleDiv}
      collapsibleDiv={collapsibleDiv}
      fixedRow={fixedRow}
      mapWidth={mapWidth}
      infoBoxBottomMargin={infoBoxBottomResMargin}
      mode={
        bigMobileIconsInsteadOfCollapsing
          ? MODES.BIG_MOBILE_ICONS
          : MODES.DEFAULT
      }
    />
  );
};

export default InfoBox;
