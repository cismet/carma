import { FilePdfOutlined, LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { loadPdfProduct } from "../../helper/apiMethods";
import CustomCard from "../ui/Card";
import { useEffect, useState } from "react";

const PdfDocumentLoader = ({ allPdfPermission, loadingCode, jwt }) => {
  const [isPdfLoading, setIsPdfLoading] = useState(false);

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
          jwt
        );
        const downloadUrl = response.res.url;
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
        // window.location.href = downloadUrl;
        // const pdfBlob = await fetch(downloadUrl).then((res) => res.blob());

        // const blobUrl = URL.createObjectURL(pdfBlob);

        // const link = document.createElement("a");
        // link.href = blobUrl;
        // link.download = "document.pdf";

        // document.body.appendChild(link);
        // link.click();
        // document.body.removeChild(link);

        // URL.revokeObjectURL(blobUrl);
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
