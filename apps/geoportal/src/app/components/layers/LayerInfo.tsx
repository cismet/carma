import parse from "html-react-parser";
import { Tabs } from "antd";
import { tabItems } from "./items";
import { useDispatch, useSelector } from "react-redux";
import { getUIActiveTabKey, setUIActiveTabKey } from "../../store/slices/ui";
import { getSelectedLayer } from "../../store/slices/mapping";
import { useContext, useEffect, useState } from "react";
import "./text.css";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import LayerInfoWrapper from "./LayerInfoWrapper";
import { LegendDisplay, parseDescription } from "@carma-mapping/layers";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

interface LayerInfoProps {
  description: string;
  legend: any;
  zoomLevels?: {
    maxZoom: number;
    minZoom: number;
  };
  metaDataText?: string;
  links?: { url: string; text: string }[];
  footerText?: string;
}

const parser = new DOMParser();

const LayerInfo = ({
  description,
  legend,
  zoomLevels,
  metaDataText,
  links,
  footerText,
}: LayerInfoProps) => {
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const zoom = routedMapRef?.leafletMap?.leafletElement.getZoom();

  const [metadataText, setMetadataText] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const activeTabKey = useSelector(getUIActiveTabKey);
  const currentLayer = useSelector(getSelectedLayer);
  const parsedDescription = parseDescription(description);
  const metadataUrl = currentLayer?.props?.metaData?.[0]?.OnlineResource;
  const { isCesium } = useMapFrameworkSwitcherContext();
  // @ts-ignore
  const layerType = currentLayer?.props?.style
    ? "Vektorlayer (Mapbox-konformer Vector-Tiles-Service)"
    : "Rasterlayer (OGC WMS 1.1.1)";

  const getIdFromUrl = (url: string) => {
    const urlObj = new URL(url);

    return urlObj.searchParams.get("id");
  };

  useEffect(() => {
    // a static text (layer groups) needs no metadata-catalog fetch
    if (metaDataText) {
      setMetadataText(metaDataText);
      setPdfUrl("");
      return;
    }

    const fallbackText =
      currentLayer?.layerInfo?.metaDataText ??
      "keine Verknüpfung zum Metadatenkatalog vorhanden";

    if (metadataUrl) {
      const urlWithoutWhitespace = metadataUrl.replaceAll(" ", "");
      fetch(urlWithoutWhitespace)
        .then((response) => {
          return response.text();
        })
        .then((text) => {
          const result = parser.parseFromString(text, "text/xml");
          const abstract = result.getElementsByTagName("gmd:abstract")[0];
          setMetadataText(abstract.textContent);
          setPdfUrl(
            `https://geoportal-nrw-content-type-pdf-proxy.cismet.de/geoportal-smartfinder-iso-1.2/resources/content/document/${getIdFromUrl(
              urlWithoutWhitespace
            )}?filename=Metadatensatz.${currentLayer.title.replaceAll(
              " ",
              "_"
            )}.Wuppertal.pdf`
          );
        })
        .catch(() => {
          setMetadataText(fallbackText);
          setPdfUrl("");
        });
    } else {
      setMetadataText(fallbackText);
      setPdfUrl("");
    }
  }, [metadataUrl, currentLayer?.layerInfo?.metaDataText, metaDataText]);

  const legendImages = legend?.map((legendItem, i) => (
    <LegendDisplay
      key={`legend_${i}`}
      url={legendItem.OnlineResource}
      updateUrl
      className="aspect-auto h-auto object-contain overflow-clip"
    />
  ));

  const getFooterText = () => {
    if (footerText) {
      return footerText;
    }
    const layerCurrentlyVisible =
      zoom < zoomLevels?.maxZoom && zoom > zoomLevels?.minZoom;

    return (
      (isCesium ? "3D-Objekt" : layerType) +
      (!layerCurrentlyVisible ? " | keine Anzeige im aktuellen Maßstab" : "")
    );
  };

  return (
    <LayerInfoWrapper
      content={
        <>
          <div className="flex sm:flex-row flex-col gap-2 w-full h-full overflow-y-auto sm:overflow-hidden show-scrollbar">
            <div className="formContainer flex flex-col gap-2 w-full sm:w-[80%] hide-tabs shrink-0 sm:shrink sm:min-h-0 sm:overflow-hidden">
              {parsedDescription && parsedDescription.length > 0 && (
                <div className="flex-shrink-0 sm:overflow-y-auto sm:max-h-[60%]">
                  {parsedDescription.map((section, index) => {
                    if (
                      section.title === "Sichtbarkeit" &&
                      (section.description === "öffentlich." ||
                        section.description.slice(0, -1) === "öffentlich" ||
                        section.description === "")
                    ) {
                      return null;
                    }

                    return (
                      <div key={`section-${index}`}>
                        <h5 className="font-semibold">{section.title}</h5>
                        <p className="text-sm">{parse(section.description)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <hr className="h-px my-0 bg-gray-300 border-0 w-full flex-shrink-0" />

              <div className="sm:hidden">
                <h5 className="pl-1.5">Legende</h5>
                {legendImages}
              </div>
              <hr className="h-px my-0 bg-gray-300 border-0 w-full sm:hidden" />

              <div className="sm:flex-1 sm:min-h-0 sm:overflow-y-auto">
                <Tabs
                  animated={false}
                  items={tabItems(currentLayer, metadataText, pdfUrl, links)}
                  activeKey={activeTabKey}
                  onChange={(key) => dispatch(setUIActiveTabKey(key))}
                />
              </div>
            </div>
            <div className="hidden sm:block w-1/3 h-[calc(100%-26px)]">
              <h5 className="pl-1.5">Legende</h5>
              <div className="h-full overflow-auto">{legendImages}</div>
            </div>
          </div>
        </>
      }
      footerText={getFooterText()}
    />
  );
};

export default LayerInfo;
