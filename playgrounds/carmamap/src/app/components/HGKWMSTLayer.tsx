import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";

type Props = {
  url?: string;
  hqKey: "HQ10" | "HQ100" | "HQ500";
  styles?: string;
};

export const HGKWMSTLayer = (props: Props) => {
  console.debug("HGK key", props.hqKey);

  const {
    url = "https://hochwasser-wuppertal.cismet.de/geoserver/wms",
    hqKey = "HQ500",
    styles = `wupp:depth`,
  } = props;

  const layers = `wupp:${hqKey}_3857`;

  return (
    <StyledWMSTileLayer
      key={`rainHazardMap.depthLayer${hqKey}`}
      url={url}
      layers={layers}
      version="1.1.1"
      transparent="true"
      format="image/png"
      tiled={true}
      styles={styles}
      maxZoom={22}
      opacity={0.8}
    />
  );
};
