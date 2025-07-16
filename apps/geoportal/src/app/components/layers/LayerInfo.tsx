import { Tabs } from "antd";
import { parseDescription } from "../../helper/helper";
import { tabItems } from "./items";
import { useDispatch, useSelector } from "react-redux";
import { getUIActiveTabKey, setUIActiveTabKey } from "../../store/slices/ui";
import { getLayers, getSelectedLayerIndex } from "../../store/slices/mapping";
import { useContext, useEffect, useState } from "react";
import "./text.css";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

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

  return (
    <div className="flex flex-col gap-1 h-[calc(100%-28px)]">
      <div className="flex gap-2 w-full h-full overflow-y-hidden">
        <div className="h-full flex flex-col gap-2 w-[80%] hide-tabs">
          {parsedDescription && (
            <div>
              <h5 className="font-semibold">Inhalt</h5>
              <p className="text-sm">{parsedDescription.inhalt}</p>
              {parsedDescription.sichtbarkeit.slice(0, -1) !== "öffentlich" && (
                <>
                  <h5 className="font-semibold">Sichtbarkeit</h5>
                  <p className="text-sm">
                    {parsedDescription.sichtbarkeit.slice(0, -1)}
                  </p>
                </>
              )}
              <h5 className="font-semibold">Nutzung</h5>
              <p className="text-sm">{parsedDescription.nutzung}</p>
            </div>
          )}
          <hr className="h-px my-0 bg-gray-300 border-0 w-full" />

          <Tabs
            animated={false}
            items={tabItems(currentLayer, metadataText, pdfUrl)}
            activeKey={activeTabKey}
            onChange={(key) => dispatch(setUIActiveTabKey(key))}
          />
        </div>
        <div className="w-1/3 h-[calc(100%-26px)]">
          <h5 className="pl-1.5">Legende</h5>
          <div className="h-full overflow-auto">
            {legend?.map((legend, i) => (
              <img
                key={`legend_${i}`}
                src={legend.OnlineResource}
                alt="Legende"
                className="aspect-auto h-auto object-contain overflow-clip"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="h-[30px] flex flex-col mt-1">
        <hr className="h-px my-0 bg-gray-300 border-0 w-full absolute bottom-9 left-0" />
        <p className="my-0 text-gray-400 text-base truncate">
          {layerType}{" "}
          {(zoom >= zoomLevels.maxZoom || zoom <= zoomLevels.minZoom) &&
            "| keine Anzeige im aktuellen Maßstab"}
        </p>
      </div>
    </div>
  );
};

export default LayerInfo;
