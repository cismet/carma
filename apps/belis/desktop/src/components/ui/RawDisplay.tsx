import type React from "react";
import { useState } from "react";
import { rawDataPreStyle } from "../../helper/uiHelper";

interface RawDisplayProps {
  children: string;
  maxHeight?: number;
}

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
    <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
  </svg>
);

const copyButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  border: "1px solid #d0d7de",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
  padding: 0,
  color: "#636c76",
  opacity: 0.8,
};

const RawDisplay = ({ children, maxHeight }: RawDisplayProps) => {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={handleCopy}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...copyButtonStyle,
          background: hovered ? "#f3f4f6" : "#fff",
          color: copied ? "#1a7f37" : "#636c76",
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <pre
        style={{
          ...rawDataPreStyle,
          ...(maxHeight != null ? { maxHeight } : {}),
        }}
      >
        {children}
      </pre>
    </div>
  );
};

export default RawDisplay;
