import Icon from "react-cismap/commons/Icon";
import { CarmaIconLink } from "./CarmaIconLink";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";

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
  actionIconSizePx?: number;
}

type SizedIconLinkProps = {
  tooltip?: string | null;
  href?: string;
  target?: string;
  onClick?: () => void;
  iconname?: string;
  icon?: ReactNode;
  iconSizePx?: number;
};

const SizedIconLink = ({
  tooltip = null,
  href,
  target,
  onClick,
  iconname = "external-link-square",
  icon,
  iconSizePx,
}: SizedIconLinkProps) => {
  const iconSize = iconSizePx ? `${iconSizePx}px` : "26px";

  return (
    <a
      title={tooltip ?? undefined}
      href={href}
      onClick={onClick}
      target={target}
    >
      {icon || (
        <Icon
          style={{
            color: "grey",
            fontSize: iconSize,
            width: iconSize,
            textAlign: "center",
          }}
          name={iconname}
        />
      )}
    </a>
  );
};

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
    actionIconSizePx,
  }: ActionLinksConfig = {}
): JSX.Element[] => {
  const infoxboxControlObject = feature.properties.info;

  const links: JSX.Element[] = [];
  if (displayZoomToFeature === true) {
    links.push(
      <SizedIconLink
        key={`zoom`}
        tooltip={"Auf " + entityClassName + " zoomen"}
        onClick={() => {
          zoomToFeature(feature);
        }}
        iconname={"search-location"}
        iconSizePx={actionIconSizePx}
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
          style={
            actionIconSizePx ? { fontSize: `${actionIconSizePx}px` } : undefined
          }
        />
      </span>
    );
  }
  if (displaySecondaryInfoAction === true) {
    links.push(
      <SizedIconLink
        key={`CarmaIconLink.secondaryInfo`}
        tooltip="Datenblatt anzeigen"
        onClick={() => {
          setVisibleStateOfSecondaryInfo(true);
        }}
        iconname="info"
        iconSizePx={actionIconSizePx}
      />
    );
  }
  if (infoxboxControlObject?.tel || feature?.properties?.tel !== undefined) {
    links.push(
      <SizedIconLink
        key={`CarmaIconLink.tel`}
        tooltip="Anrufen"
        href={"tel:" + (infoxboxControlObject?.tel || feature?.properties?.tel)}
        iconname="phone"
        iconSizePx={actionIconSizePx}
      />
    );
  }
  if (
    infoxboxControlObject?.email ||
    feature?.properties?.email !== undefined
  ) {
    links.push(
      <SizedIconLink
        key={`CarmaIconLink.email`}
        tooltip="E-Mail schreiben"
        href={
          "mailto:" +
          (infoxboxControlObject?.email || feature?.properties?.email)
        }
        iconname="envelope-square"
        iconSizePx={actionIconSizePx}
      />
    );
  }
  if (infoxboxControlObject?.url || feature?.properties?.url !== undefined) {
    links.push(
      <SizedIconLink
        key={`CarmaIconLink.web`}
        tooltip="Zur Homepage"
        href={infoxboxControlObject?.url || feature?.properties?.url}
        target="_blank"
        iconname="external-link-square"
        iconSizePx={actionIconSizePx}
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
          <SizedIconLink
            key={`CarmaIconLink.generic-${JSON.stringify(genericLink)}`}
            tooltip={genericLink.tooltip}
            href={genericLink.url}
            target={genericLink.target || "_blank"}
            iconname={genericLink.iconname || "globe"}
            icon={genericLink.icon || undefined}
            iconSizePx={actionIconSizePx}
          />
        );
      } else if (genericLink.action) {
        links.push(
          <SizedIconLink
            key={`CarmaIconLink.generic-${JSON.stringify(genericLink)}`}
            tooltip={genericLink.tooltip}
            onClick={genericLink.action}
            iconname={genericLink.iconname || "globe"}
            icon={genericLink.icon || undefined}
            iconSizePx={actionIconSizePx}
          />
        );
      } else if (
        genericLink.routeAction &&
        genericLink.getRouteParams &&
        onRouteAction
      ) {
        links.push(
          <SizedIconLink
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
            iconSizePx={actionIconSizePx}
          />
        );
      }
    }
  }
  return links;
};
