import { FilePdfOutlined, LoadingOutlined } from "@ant-design/icons";
import { Input, Spin } from "antd";
import { loadPdfProduct } from "../../helper/apiMethods";
import CustomCard from "../ui/Card";
import { useEffect, useState } from "react";

const PdfDocumentLoader = ({ allPdfPermission, loadingCode, jwt }) => {
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const getDayBeforeYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 2);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const [inputValue, setInputValue] = useState(getDayBeforeYesterday());

  const handleChange = (e) => {
    setInputValue(e.target.value);
  };
  const handleLoadPdfProduct = async (
    event,
    loadingAttribute,
    permission,
    type
  ) => {
    event.preventDefault();
    if (permission && !isPdfLoading) {
      try {
        setIsPdfLoading(true);
        const response = await loadPdfProduct(
          loadingCode.replace(" ", "%20"),
          loadingAttribute,
          type,
          jwt,
          inputValue.trim()
        );
        const downloadUrl = response.res.url;
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
        setIsPdfLoading(false);
      } catch (error) {
        console.error("Error loading PDF product:", error);
        setIsPdfLoading(false);
      }
    }
  };

  return (
    <CustomCard
      style={{ marginBottom: "1rem" }}
      title={
        !isPdfLoading ? (
          "PDF-Produkte"
        ) : (
          <Spin
            indicator={<LoadingOutlined spin />}
            size="small"
            className="ml-2"
          />
        )
      }
    >
      <div>
        {allPdfPermission.map((p, idx) => {
          if (p.name === "Bestandsnachweis stichtagsbezogen (NRW)") {
            return (
              <div
                key={idx}
                className={`my-2 flex items-center gap-2 ${
                  isPdfLoading || !p.permission ? "text-gray-300" : ""
                }`}
              >
                <FilePdfOutlined />
                <a
                  onClick={(e) =>
                    handleLoadPdfProduct(
                      e,
                      p.loadingAttribute,
                      p.permission,
                      "Stichtagsbezogen"
                    )
                  }
                  href="#"
                  className="cursor-pointer"
                >
                  {p.name}
                </a>
                <Input
                  value={inputValue}
                  onChange={handleChange}
                  placeholder="Datum: Tag.Monat.Jahr"
                  className="w-72 ml-3"
                />
              </div>
            );
          }
          return (
            <div
              key={idx}
              className={`my-2 flex items-center gap-2 ${
                isPdfLoading || !p.permission ? "text-gray-300" : ""
              }`}
            >
              <FilePdfOutlined />
              <a
                onClick={(e) =>
                  handleLoadPdfProduct(
                    e,
                    p.loadingAttribute,
                    p.permission,
                    p.name
                  )
                }
                href="#"
                className="cursor-pointer"
              >
                {p.name}
              </a>
            </div>
          );
        })}
      </div>
    </CustomCard>
  );
};

export default PdfDocumentLoader;
