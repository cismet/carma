import { useState } from "react";

interface DatasheetProps {
  mainComponent: React.ReactNode;
  datasheetComponent: React.ReactNode;
}

const Datasheet = ({ mainComponent, datasheetComponent }: DatasheetProps) => {
  const [isDatasheetView, setIsDatasheetView] = useState(false);

  const toggleDatasheetView = () => {
    setIsDatasheetView(!isDatasheetView);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {isDatasheetView && (
        <div style={{ width: "100%", height: "100%" }}>
          {datasheetComponent}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: isDatasheetView ? 16 : 0,
          right: isDatasheetView ? 16 : 0,
          width: isDatasheetView ? 300 : "100%",
          height: isDatasheetView ? 200 : "100%",
          boxShadow: isDatasheetView ? "0 4px 12px rgba(0,0,0,0.3)" : undefined,
          borderRadius: isDatasheetView ? 8 : undefined,
          overflow: "hidden",
          transition: "all 0.3s ease-in-out",
          zIndex: isDatasheetView ? 10 : undefined,
        }}
      >
        {mainComponent}
        <button
          onClick={toggleDatasheetView}
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            padding: "6px 12px",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 4,
            cursor: "pointer",
            zIndex: 1000,
          }}
        >
          {isDatasheetView ? "Schließen" : "Datenblatt"}
        </button>
      </div>
    </div>
  );
};

export default Datasheet;
