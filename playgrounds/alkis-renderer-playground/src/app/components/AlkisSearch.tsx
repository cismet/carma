import { Input } from "antd";
import { addHtmlFromData } from "../helper/addHtmlFromData";
import { useState } from "react";
import CustomCard from "./CustomCard";
import AdditionalSheet from "./AdditionalSheet";
const { Search } = Input;

interface AlkisSearchProps {
  jwt?: string | null;
}

const AlkisSearch = ({ jwt }: AlkisSearchProps) => {
  const [resHtml, setResHtml] = useState<JSX.Element | null>(null);
  const [mode, setMode] = useState<string>("landparcel");
  const [sheets, setSheets] = useState<any>({
    id: "",
    owners: [],
    namesArr: [],
    legalDesc: "",
  });
  const [landparcel, setLandparcel] = useState<string | null>(null);

  const onSearch = async (value: string) => {
    if (jwt) {
      setLandparcel(value);
      const landparcelHtml = await addHtmlFromData(jwt, value, setSheets);
      setResHtml(landparcelHtml);
    }
  };
  return (
    <div style={{ marginTop: "40px", marginBottom: "60px" }}>
      <Search
        placeholder="type alkis id input"
        onSearch={onSearch}
        enterButton
      />

      {landparcel && (
        <div
          className="flex gap-4 items-center my-5"
          style={{ display: "flex", gap: "4rem", margin: "40px 0" }}
        >
          <div
            onClick={() => setMode("landparcel")}
            style={{ cursor: "pointer" }}
          >
            {landparcel}
          </div>
          <div onClick={() => setMode("sheet")} style={{ cursor: "pointer" }}>
            {sheets.id}
          </div>
        </div>
      )}

      {resHtml && mode === "landparcel" && (
        <div style={{ marginTop: "40px" }}>
          {
            <CustomCard title="Flurstück 20/1 - Flur 137 - Gemarkung 053001">
              {resHtml}
            </CustomCard>
          }
        </div>
      )}

      {mode === "sheet" && (
        <div style={{ marginTop: "40px" }}>
          {
            <CustomCard title="Flurstück 20/1 - Flur 137 - Gemarkung 053001">
              <AdditionalSheet
                owners={sheets.owners}
                legalDesc={sheets.legalDesc}
                namesArr={sheets.namesArr}
              />
            </CustomCard>
          }
        </div>
      )}
    </div>
  );
};

export default AlkisSearch;
