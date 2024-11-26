import { Tabs } from "antd";
import { parseDescription } from "../../helper/helper";
import { tabItems } from "./items";
import { useDispatch, useSelector } from "react-redux";
import { getUIActiveTabKey, setUIActiveTabKey } from "../../store/slices/ui";
import { getLayers, getSelectedLayerIndex } from "../../store/slices/mapping";
import { useEffect, useState } from "react";
import "./text.css";

interface LayerInfoProps {
  description: string;
  legend: any;
}

const parser = new DOMParser();

const LayerInfo = ({ description, legend }: LayerInfoProps) => {
  const dispatch = useDispatch();

  const [metadataText, setMetadataText] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const activeTabKey = useSelector(getUIActiveTabKey);
  const layers = useSelector(getLayers);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);

  const currentLayer = layers[selectedLayerIndex];
  const parsedDescription = parseDescription(description);
  const metadataUrl =
    currentLayer?.other?.props?.MetadataURL?.[0]?.OnlineResource;
  // @ts-ignore
  const layerType = currentLayer?.props?.style ? "Vektorlayer" : "Rasterlayer";

  const getIdFromUrl = (url: string) => {
    const urlObj = new URL(url);

    return urlObj.searchParams.get("id");
  };

  useEffect(() => {
    if (metadataUrl) {
      const urlWithoutWhitespace = metadataUrl.replaceAll(" ", "");
      setPdfUrl(
        `https://geoportal-nrw-content-type-pdf-proxy.cismet.de/geoportal-smartfinder-iso-1.2/resources/content/document/${getIdFromUrl(
          urlWithoutWhitespace
        )}?filename=Metadatensatz.${currentLayer.title.replaceAll(
          " ",
          "_"
        )}.Wuppertal.pdf`
      );
      fetch(urlWithoutWhitespace)
        .then((response) => {
          return response.text();
        })
        .then((text) => {
          const result = parser.parseFromString(text, "text/xml");
          const abstract = result.getElementsByTagName("gmd:abstract")[0];
          setMetadataText(abstract.textContent);
        });
    } else {
      setMetadataText("keine Verknüpfung zum Metadatenkatalog vorhanden");
      setPdfUrl("");
    }
  }, [metadataUrl]);

  return (
    <div className="flex flex-col gap-1 overflow-y-hidden h-full">
      <div className="flex gap-2 w-full h-[94%]">
        <div className="h-full flex flex-col gap-2 w-2/3">
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
          <h5>Legende</h5>
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
      <hr className="h-px my-0 bg-gray-300 border-0 w-full absolute bottom-9 left-0" />
      <p className="my-0 pt-2.5 text-gray-400 text-base">{layerType}</p>
    </div>
  );
};

export default LayerInfo;
