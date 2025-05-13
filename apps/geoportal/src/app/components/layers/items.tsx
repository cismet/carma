import {
  faCircle,
  faGlobe,
  faLayerGroup,
  faSquare,
} from "@fortawesome/free-solid-svg-icons";
import { Layer } from "@carma-commons/types";

export const tabItems = (
  currentLayer: Layer,
  metadataText?: string,
  pdfUrl?: string
) => {
  return [
    {
      label: "Datenquelle",
      key: "1",
      children: (
        <>
          <p>{metadataText}</p>
          {pdfUrl && (
            <a href={pdfUrl} target="_metadata">
              Vollständiger Metadatensatz (PDF)
            </a>
          )}
        </>
      ),
    },
    {
      label: "Links",
      key: "2",
      children: (
        <div className="flex flex-col gap-2">
          {currentLayer?.other?.service?.url && (
            <a
              href={`${currentLayer.other.service.url}?service=WMS&request=GetCapabilities&version=1.1.1`}
              target="_blank"
            >
              Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)
            </a>
          )}
          {currentLayer?.conf?.opendata && (
            <a href={currentLayer.conf.opendata as string} target="_blank">
              Datenquelle im Open-Data-Portal Wuppertal
            </a>
          )}
        </div>
      ),
    },
  ];
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
