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

  const getIdFromUrl = (url: string) => {
    const urlObj = new URL(url);

    return urlObj.searchParams.get("id");
  };

  useEffect(() => {
    if (metadataUrl) {
      setPdfUrl(
        `https://geoportal-nrw-content-type-pdf-proxy.cismet.de/geoportal-smartfinder-iso-1.2/resources/content/document/${getIdFromUrl(
          metadataUrl
        )}?filename=Metadatensatz.${currentLayer.title.replaceAll(
          " ",
          "_"
        )}.Wuppertal.pdf`
      );
      fetch(metadataUrl)
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
    <>
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
        items={tabItems(legend, currentLayer, metadataText, pdfUrl)}
        activeKey={activeTabKey}
        onChange={(key) => dispatch(setUIActiveTabKey(key))}
      />
    </>
  );
};

export default LayerInfo;
