import React, { useState } from "react";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";

// Matches rawDataPreStyle in the BelIS desktop app, so raw blocks look the
// same across the two applications.
const preStyle = {
  fontSize: 11,
  lineHeight: 1.5,
  background: "#f5f5f5",
  padding: 12,
  borderRadius: 4,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  margin: 0,
};

/** A <pre> with a copy button, for showing raw GraphQL and JSON. */
const RawBlock = ({ children, maxHeight = 260 }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={handleCopy}
        title="In die Zwischenablage kopieren"
        className="absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded border border-gray-300 bg-white cursor-pointer"
        style={{ color: copied ? "#1a7f37" : "#636c76" }}
      >
        {copied ? <CheckOutlined /> : <CopyOutlined />}
      </button>
      <pre style={{ ...preStyle, maxHeight }}>{children}</pre>
    </div>
  );
};

export default RawBlock;
