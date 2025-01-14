import { Input } from "antd";
import { addHtmlFromData } from "../helper/addHtmlFromData";
import { useState } from "react";
import CustomCard from "./CustomCard";
const { Search } = Input;

interface AlkisSearchProps {
  jwt?: string | null;
}

const AlkisSearch = ({ jwt }: AlkisSearchProps) => {
  const [resHtml, setResHtml] = useState<JSX.Element | null>(null);
  const onSearch = async (value: string) => {
    if (jwt) {
      const landparcelHtml = await addHtmlFromData(jwt, value);
      setResHtml(landparcelHtml);
      // getLandparcelById("053001-137-00020/0001");
    }
    console.log("xxx jwt", jwt);
  };
  return (
    <div style={{ marginTop: "40px", marginBottom: "60px" }}>
      <Search
        placeholder="type alkis id input"
        onSearch={onSearch}
        enterButton
      />

      {resHtml && (
        <div style={{ marginTop: "40px" }}>
          {
            <CustomCard title="Flurstück 20/1 - Flur 137 - Gemarkung 053001">
              {resHtml}
            </CustomCard>
          }
        </div>
      )}
    </div>
  );
};

export default AlkisSearch;
