import IconLink from "react-cismap/commons/IconLink";

interface ActionLinksConfig {
  entityClassName?: string;
  displayZoomToFeature?: boolean;
  zoomToFeature?: (feature: any) => void;
  displaySecondaryInfoAction?: boolean;
  setVisibleStateOfSecondaryInfo?: (visible: boolean) => void;
}

export const getActionLinksForFeature = (
  feature: any,
  {
    entityClassName = "Fachobjekt",
    displayZoomToFeature = false,
    zoomToFeature = () => {
      console.warn(
        "no action cause zoomToFeature was not set in config object"
      );
    },
    displaySecondaryInfoAction = false,
    setVisibleStateOfSecondaryInfo = () => {
      console.warn(
        "no action cause setVisibleStateOfSecondaryInfo was not set in config object"
      );
    },
  }: ActionLinksConfig = {}
): JSX.Element[] => {
  const infoxboxControlObject = feature.properties.info;

  const links: JSX.Element[] = [];
  if (displayZoomToFeature === true) {
    links.push(
      <IconLink
        key={`zoom`}
        tooltip={"Auf " + entityClassName + " zoomen"}
        onClick={() => {
          zoomToFeature(feature);
        }}
        iconname={"search-location"}
      />
    );
  }
  if (displaySecondaryInfoAction === true) {
    links.push(
      <IconLink
        key={`IconLink.secondaryInfo`}
        tooltip="Datenblatt anzeigen"
        onClick={() => {
          setVisibleStateOfSecondaryInfo(true);
        }}
        iconname="info"
      />
    );
  }
  if (infoxboxControlObject?.tel || feature?.properties?.tel !== undefined) {
    links.push(
      <IconLink
        key={`IconLink.tel`}
        tooltip="Anrufen"
        href={"tel:" + infoxboxControlObject?.tel || feature?.properties?.tel}
        iconname="phone"
      />
    );
  }
  if (
    infoxboxControlObject?.email ||
    feature?.properties?.email !== undefined
  ) {
    links.push(
      <IconLink
        key={`IconLink.email`}
        tooltip="E-Mail schreiben"
        href={
          "mailto:" + infoxboxControlObject?.email || feature?.properties?.email
        }
        iconname="envelope-square"
      />
    );
  }
  if (infoxboxControlObject?.url || feature?.properties?.url !== undefined) {
    links.push(
      <IconLink
        key={`IconLink.web`}
        tooltip="Zur Homepage"
        href={infoxboxControlObject?.url || feature?.properties?.url}
        target="_blank"
        iconname="external-link-square"
      />
    );
  }
  if (
    infoxboxControlObject?.genericLinks ||
    feature?.properties?.genericLinks !== undefined
  ) {
    for (const genericLink of infoxboxControlObject?.genericLinks ||
      feature.properties.genericLinks) {
      if (genericLink.url) {
        links.push(
          <IconLink
            key={`IconLink.generic-${JSON.stringify(genericLink)}`}
            tooltip={genericLink.tooltip}
            href={genericLink.url}
            target={genericLink.target || "_blank"}
            iconname={genericLink.iconname || "globe"}
            icon={genericLink.icon || undefined}
          />
        );
      } else if (genericLink.action) {
        links.push(
          <IconLink
            key={`IconLink.generic-${JSON.stringify(genericLink)}`}
            tooltip={genericLink.tooltip}
            onClick={genericLink.action}
            iconname={genericLink.iconname || "globe"}
            icon={genericLink.icon || undefined}
          />
        );
      }
    }
  }
  return links;
};
