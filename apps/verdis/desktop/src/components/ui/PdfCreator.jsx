import { FilePdfOutlined } from "@ant-design/icons";
import { Button, Checkbox, Input, Modal, Radio, Select, Tooltip } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useEffect, useState } from "react";
import {
  getFEBByStac,
  getFebBlob,
  getIsLoading,
  getKassenzeichen,
  storeFebBlob,
} from "../../store/slices/search";
import { useDispatch, useSelector } from "react-redux";
import { isEmpty } from "lodash";

const ModalRow = ({ title, children }) => {
  return (
    <div className="flex w-full">
      <span className="w-1/3">{title}</span>
      {children}
    </div>
  );
};

const PdfCreator = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hints, setHints] = useState("");
  const [format, setFormat] = useState("optimal");
  const [scale, setScale] = useState("optimal");
  const [orientation, setOrientation] = useState("optimal");
  const [drainEffectiveness, setDrainEffectiveness] = useState(false);
  const [fileName, setFileName] = useState("feb");
  const [showError, setShowError] = useState(false);
  const dispatch = useDispatch();
  const febBlob = useSelector(getFebBlob);
  const isLoading = useSelector(getIsLoading);
  const kassenzeichen = useSelector(getKassenzeichen);

  useEffect(() => {
    if (febBlob) {
      let link = document.createElement("a");
      try {
        link.href = window.URL.createObjectURL(febBlob);
      } catch {
        setShowError(true);
      }

      if (link.href) {
        link.download = `${fileName}.pdf`;
        document.body.appendChild(link);
        link.click();
        setIsOpen(false);
      }
      document.body.removeChild(link);
      dispatch(storeFebBlob(null));
    }
  }, [febBlob]);

  return (
    <>
      <Tooltip title="Drucken" placement="bottom">
        <FilePdfOutlined
          className="text-2xl cursor-pointer"
          onClick={() => !isEmpty(kassenzeichen) && setIsOpen(true)}
        />
      </Tooltip>
      <Modal
        title="Flächenerfassungsbogen - Report Parameter"
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        MAP
        footer={[
          <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>,
          <Button
            onClick={() =>
              dispatch(
                getFEBByStac(
                  hints,
                  format,
                  scale,
                  orientation,
                  drainEffectiveness
                )
              )
            }
            type="primary"
            loading={isLoading}
          >
            Erstelle Report
          </Button>,
        ]}
      >
        <div className="flex flex-col w-full gap-4 py-2">
          <ModalRow title="Auftragsname">
            <Input
              className="w-full"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
          </ModalRow>
          <ModalRow title="Hinweise">
            <TextArea
              className="w-full"
              value={hints}
              onChange={(e) => setHints(e.target.value)}
            />
          </ModalRow>
          <ModalRow title="Maßstab">
            <Select
              className="w-full"
              defaultValue="optimal"
              value={scale}
              onChange={(value) => setScale(value)}
              options={[
                {
                  value: "optimal",
                  label: "optimal",
                },
                {
                  value: "200",
                  label: "1:200",
                },
                {
                  value: "300",
                  label: "1:300",
                },
                {
                  value: "400",
                  label: "1:400",
                },
                {
                  value: "500",
                  label: "1:500",
                },
                {
                  value: "750",
                  label: "1:750",
                },
                {
                  value: "1000",
                  label: "1:1000",
                },
              ]}
            />
          </ModalRow>
          <ModalRow title="Format">
            <Radio.Group
              className="w-full"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <Radio value={"optimal"}>optimal</Radio>
              <Radio value={"A4"}>A4</Radio>
              <Radio value={"A3"}>A3</Radio>
            </Radio.Group>
          </ModalRow>
          <ModalRow title="Orientierung">
            <Radio.Group
              className="w-full"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
            >
              <Radio value={"optimal"}>optimal</Radio>
              <Radio value={"P"}>Hochformat</Radio>
              <Radio value={"LS"}>Querformat</Radio>
            </Radio.Group>
          </ModalRow>
          <ModalRow>
            <Checkbox
              className="w-full"
              checked={drainEffectiveness}
              onChange={(e) => setDrainEffectiveness(e.target.checked)}
            >
              Abflusswirksamkeiten ausfüllen
            </Checkbox>
          </ModalRow>
          {showError && (
            <p className="text-red-400 text-lg">
              Fehler bei der Erzeugung des Reports
            </p>
          )}
        </div>
      </Modal>
    </>
  );
};

export default PdfCreator;
