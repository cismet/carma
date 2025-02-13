import { FilePdfOutlined, LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { loadPdfProduct } from "../../helper/apiMethods";
import CustomCard from "../ui/Card";
import { useEffect } from "react";

const PdfDocumentLoader = ({
  allPdfPermission,
  isPdfLoading,
  setIsPdfLoading,
  loadingCode,
  jwt,
}) => {
  const handleLoadPdfProduct = async (
    event,
    loadingAttribute,
    permission,
    type
  ) => {
    event.preventDefault();
    if (permission) {
      try {
        setIsPdfLoading(true);
        const response = await loadPdfProduct(
          loadingCode.replace(" ", "%20"),
          loadingAttribute,
          type,
          jwt
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

  useEffect(() => {
    console.log("xxx pdf comp isPdfLoading", isPdfLoading);
  }, [isPdfLoading]);

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
          return (
            <div
              key={idx}
              className={`my-2 flex items-center gap-2 ${
                p.permission ? "" : "text-gray-300"
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
