import IconLink from "react-cismap/commons/IconLink";
import { CarmaIconLink } from "./CarmaIconLink";
import { faRotate } from "@fortawesome/free-solid-svg-icons";

interface ActionLinksConfig {
  entityClassName?: string;
  displayZoomToFeature?: boolean;
  zoomToFeature?: (feature: any) => void;
  displaySecondaryInfoAction?: boolean;
  setVisibleStateOfSecondaryInfo?: (visible: boolean) => void;
  onRouteAction?: (routeParams: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  }) => void;
  displayOrbit?: boolean;
  isOrbiting?: boolean;
  onOrbitToggle?: () => void;
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
    onRouteAction,
    displayOrbit = false,
    isOrbiting = false,
    onOrbitToggle,
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
  if (displayOrbit === true) {
    links.push(
      <span key={`orbit-wrapper`} className={isOrbiting ? "orbit-active" : ""}>
        <CarmaIconLink
          key={`orbit`}
          tooltip={isOrbiting ? "Rundflug stoppen" : "Rundflug starten"}
          onClick={() => {
            onOrbitToggle?.();
          }}
          icon={faRotate}
        />
      </span>
    );
  }
  if (displaySecondaryInfoAction === true) {
    links.push(
      <IconLink
        key={`CarmaIconLink.secondaryInfo`}
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
        key={`CarmaIconLink.tel`}
        tooltip="Anrufen"
        href={"tel:" + (infoxboxControlObject?.tel || feature?.properties?.tel)}
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
        key={`CarmaIconLink.email`}
        tooltip="E-Mail schreiben"
        href={
          "mailto:" +
          (infoxboxControlObject?.email || feature?.properties?.email)
        }
        iconname="envelope-square"
      />
    );
  }
  if (infoxboxControlObject?.url || feature?.properties?.url !== undefined) {
    links.push(
      <IconLink
        key={`CarmaIconLink.web`}
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
            key={`CarmaIconLink.generic-${JSON.stringify(genericLink)}`}
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
            key={`CarmaIconLink.generic-${JSON.stringify(genericLink)}`}
            tooltip={genericLink.tooltip}
            onClick={genericLink.action}
            iconname={genericLink.iconname || "globe"}
            icon={genericLink.icon || undefined}
          />
        );
      } else if (
        genericLink.routeAction &&
        genericLink.getRouteParams &&
        onRouteAction
      ) {
        links.push(
          <IconLink
            key={`CarmaIconLink.route-${genericLink.iconname}`}
            tooltip={genericLink.tooltip || "Route berechnen"}
            onClick={() => {
              const routeParams = genericLink.getRouteParams();
              if (routeParams) {
                onRouteAction(routeParams);
              }
            }}
            iconname={genericLink.iconname || "car"}
            icon={genericLink.icon || undefined}
          />
        );
      }
    }
  }
  return links;
};
