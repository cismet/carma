import { Input } from "antd";
import { addHtmlFromData } from "../helper/addHtmlFromData";
import { useState } from "react";
import CustomCard from "./CustomCard";
import { getSheetHtml } from "../helper/getSheetHtmlFromData";
const { Search } = Input;

interface AlkisSearchProps {
  jwt?: string | null;
}

const AlkisSearch = ({ jwt }: AlkisSearchProps) => {
  const [resHtml, setResHtml] = useState<JSX.Element | null>(null);
  const [mode, setMode] = useState<string>("landparcel");
  const [sheetHtml, setSheetHtml] = useState<JSX.Element | null>(null);
  const [idTitle, setIdTitle] = useState<string | null>(null);

  const onLandparcelSearch = async (value: string) => {
    if (jwt) {
      setMode("landparcel");
      setIdTitle(value);
      const landparcelHtml = await addHtmlFromData(jwt, value);
      setResHtml(landparcelHtml);
    }
  };

  const onSheetSearch = async (value: string) => {
    if (jwt) {
      const sheetHtml = await getSheetHtml(jwt, value);
      setSheetHtml(sheetHtml);
      setIdTitle(value);
      setMode("sheet");
    }
  };

  const searchTitleStyle = {
    marginBottom: "0.7rem",
    fontSize: "14px",
    color: "rgba(0, 0, 0, 0.88)",
  };

  return (
    <div style={{ marginTop: "40px", marginBottom: "60px" }}>
      <div>
        <h4 style={searchTitleStyle}>Flurstücksuche</h4>
        <Search placeholder="" onSearch={onLandparcelSearch} enterButton />
      </div>

      <div>
        <h4 style={searchTitleStyle}>Buchungsblattsuche</h4>
        <Search placeholder="" onSearch={onSheetSearch} enterButton />
      </div>

      {idTitle && (
        <div
          className="flex gap-4 items-center my-5"
          style={{
            display: "flex",
            gap: "4rem",
            marginTop: "60px",
            marginBottom: "10px",
          }}
        >
          <div style={{ cursor: "pointer" }}>{idTitle}</div>
        </div>
      )}

      {resHtml && mode === "landparcel" && (
        <div style={{ marginTop: "40px" }}>{resHtml}</div>
      )}

      {mode === "sheet" && <div style={{ marginTop: "40px" }}>{sheetHtml}</div>}
    </div>
  );
};

export default AlkisSearch;
