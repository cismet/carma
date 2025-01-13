import { Input } from "antd";
import { addHtmlFromData } from "../helper/addHtmlFromData";
import { useState } from "react";
import CustomCard from "./CustomCard";
import { getAdditionalSheets, getLandparcelById } from "../helper/getToken";
const { Search } = Input;

interface AlkisSearchProps {
  jwt?: string | null;
}

const AlkisSearch = ({ jwt }: AlkisSearchProps) => {
  const [resHtml, setResHtml] = useState<JSX.Element | null>(null);
  const onSearch = async (value: string) => {
    // getAdditionalSheets("053001-033391 ");

    if (jwt) {
      // const landparcelHtml = await addHtmlFromData(jwt);
      // setResHtml(landparcelHtml);
      getLandparcelById("053001-137-00020/0001", jwt);
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
            <CustomCard title="Flurstüc 204 - Flur 38 - Gemarkung 053001">
              {resHtml}
            </CustomCard>
          }
        </div>
      )}
    </div>
  );
};

export default AlkisSearch;
