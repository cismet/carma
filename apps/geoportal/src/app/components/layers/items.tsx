import {
  faCircle,
  faGlobe,
  faLayerGroup,
  faSquare,
} from "@fortawesome/free-solid-svg-icons";
import { Layer } from "@carma-mapping/layers";

export const tabItems = (
  currentLayer: Layer,
  metadataText?: string,
  pdfUrl?: string,
  links?: { url: string; text: string }[]
) => {
  const wmsUrl = currentLayer?.other?.service?.url;
  const opendataUrl = currentLayer?.conf?.opendata;
  // service links first, then the custom links of the layer or group
  const allLinks: { url: string; text: string }[] = [
    ...(wmsUrl
      ? [
          {
            url: `${wmsUrl}?service=WMS&request=GetCapabilities&version=1.1.1`,
            text: "Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)",
          },
        ]
      : []),
    ...(opendataUrl
      ? [
          {
            url: opendataUrl as string,
            text: "Datenquelle im Open-Data-Portal Wuppertal",
          },
        ]
      : []),
    ...(links ?? []),
  ];

  const items = [
    {
      label: "Datenquelle",
      key: "1",
      children: (
        <>
          <p className="text-sm">{metadataText}</p>
          {pdfUrl && (
            <a className="text-sm" href={pdfUrl} target="_metadata">
              Vollständiger Metadatensatz (PDF)
            </a>
          )}
        </>
      ),
    },
  ];

  if (allLinks.length > 0) {
    items.push({
      label: "Links",
      key: "2",
      children: (
        <div className="flex flex-col gap-2">
          {allLinks.map((link, i) => (
            <a
              key={`link_${i}`}
              className="text-sm"
              href={link.url}
              target="_blank"
            >
              {link.text}
            </a>
          ))}
        </div>
      ),
    });
  }

  return items;
};

export const iconMap = {
  bäume: faCircle,
  gärten: faSquare,
  ortho: faGlobe,
  background: faLayerGroup,
};

export const iconColorMap = {
  bäume: "green",
  gärten: "purple",
  ortho: "black",
};
