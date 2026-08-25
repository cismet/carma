import {
  faCircle,
  faGlobe,
  faLayerGroup,
  faSquare,
  faSun,
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
  const hasLinks = Boolean(links?.length || wmsUrl || opendataUrl);

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

  if (hasLinks) {
    items.push({
      label: "Links",
      key: "2",
      children: links?.length ? (
        <div className="flex flex-col gap-2">
          {links.map((link, i) => (
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
      ) : (
        <div className="flex flex-col gap-2">
          {wmsUrl && (
            <a
              className="text-sm"
              href={`${wmsUrl}?service=WMS&request=GetCapabilities&version=1.1.1`}
              target="_blank"
            >
              Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)
            </a>
          )}
          {opendataUrl && (
            <a className="text-sm" href={opendataUrl as string} target="_blank">
              Datenquelle im Open-Data-Portal Wuppertal
            </a>
          )}
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
  "shadow-simulation": faSun,
};

export const iconColorMap = {
  bäume: "green",
  gärten: "purple",
  ortho: "black",
  "shadow-simulation": "#d97706",
};
