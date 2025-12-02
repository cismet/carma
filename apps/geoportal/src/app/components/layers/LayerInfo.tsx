import { Tabs } from "antd";
import { tabItems } from "./items";
import { useDispatch, useSelector } from "react-redux";
import { getUIActiveTabKey, setUIActiveTabKey } from "../../store/slices/ui";
import { getLayers, getSelectedLayerIndex } from "../../store/slices/mapping";
import { useContext, useEffect, useState } from "react";
import "./text.css";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import LayerInfoWrapper from "./LayerInfoWrapper";
import { parseDescription } from "@carma-mapping/layers";
import { updateUrl } from "@carma-commons/utils";

interface LayerInfoProps {
  description: string;
  legend: any;
  zoomLevels: {
    maxZoom: number;
    minZoom: number;
  };
}

const parser = new DOMParser();

const LayerInfo = ({ description, legend, zoomLevels }: LayerInfoProps) => {
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const zoom = routedMapRef?.leafletMap?.leafletElement.getZoom();

  const [metadataText, setMetadataText] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const activeTabKey = useSelector(getUIActiveTabKey);
  const layers = useSelector(getLayers);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);

  const currentLayer = layers[selectedLayerIndex];
  const parsedDescription = parseDescription(description);
  const metadataUrl = currentLayer?.props?.metaData?.[0]?.OnlineResource;
  // @ts-ignore
  const layerType = currentLayer?.props?.style
    ? "Vektorlayer (Mapbox-konformer Vector-Tiles-Service)"
    : "Rasterlayer (OGC WMS 1.1.1)";

  const getIdFromUrl = (url: string) => {
    const urlObj = new URL(url);

    return urlObj.searchParams.get("id");
  };

  useEffect(() => {
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
          setMetadataText("keine Verknüpfung zum Metadatenkatalog vorhanden");
          setPdfUrl("");
        });
    } else {
      setMetadataText("keine Verknüpfung zum Metadatenkatalog vorhanden");
      setPdfUrl("");
    }
  }, [metadataUrl]);

  const getFooterText = () => {
    const layerCurrentlyVisible =
      zoom < zoomLevels.maxZoom && zoom > zoomLevels.minZoom;

    return (
      layerType +
      (!layerCurrentlyVisible ? " | keine Anzeige im aktuellen Maßstab" : "")
    );
  };

  return (
    <LayerInfoWrapper
      content={
        <>
          <div className="flex sm:flex-row flex-col gap-2 w-full h-full overflow-hidden">
            <div className="formContainer flex flex-col gap-2 w-full sm:w-[80%] hide-tabs min-h-0 overflow-hidden">
              {parsedDescription && parsedDescription.length > 0 && (
                <div className="flex-shrink-0 overflow-y-auto max-h-[60%]">
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
                        <p className="text-sm">{section.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <hr className="h-px my-0 bg-gray-300 border-0 w-full flex-shrink-0" />

              <div className="flex-1 min-h-0 overflow-y-auto">
                <Tabs
                  animated={false}
                  items={tabItems(currentLayer, metadataText, pdfUrl)}
                  activeKey={activeTabKey}
                  onChange={(key) => dispatch(setUIActiveTabKey(key))}
                />
              </div>
              <hr className="h-px my-0 bg-gray-300 border-0 w-full sm:hidden" />
            </div>
            <div className="w-1/3 h-[calc(100%-26px)]">
              <h5 className="pl-1.5">Legende</h5>
              <div className="h-full sm:overflow-auto">
                {legend?.map((legend, i) => (
                  <img
                    key={`legend_${i}`}
                    src={updateUrl(legend.OnlineResource)}
                    alt="Legende"
                    className="aspect-auto h-auto object-contain overflow-clip"
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      }
      footerText={getFooterText()}
    />
  );
};

export default LayerInfo;
