// Body of the print-error details modal (opened from showPrintErrorToast):
// a short explanation, the raw backend error in a neutral, scrollable code
// block, and a copy-to-clipboard action. A standalone component so it can own
// the "copied" feedback state.

import { useState } from "react";
import { Button, Typography } from "antd";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";

export interface PrintErrorDetailsProps {
  /** The raw error text returned by the print backend. */
  errorMessage: string;
}

export const PrintErrorDetails = ({ errorMessage }: PrintErrorDetailsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(errorMessage).then(() => {
      setCopied(true);
    });
  };

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Beim Erstellen des Druck-PDFs ist ein Fehler aufgetreten. Technische
        Meldung des Druckdienstes:
      </Typography.Paragraph>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 320,
          overflow: "auto",
          margin: 0,
          padding: 16,
          fontSize: 13,
          lineHeight: 1.6,
          background: "#f5f5f5",
          borderRadius: 8,
          color: "#262626",
        }}
      >
        {errorMessage}
      </pre>
      <div style={{ marginTop: 12, textAlign: "right" }}>
        <Button
          size="small"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
        >
          {copied ? "Kopiert" : "Fehlertext kopieren"}
        </Button>
      </div>
    </div>
  );
};

export default PrintErrorDetails;
