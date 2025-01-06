import { Input } from "antd";
import { addHtmlFromData } from "../app/helper/addHtmlFromData";
import { useState } from "react";
const { Search } = Input;

interface AlkisSearchProps {
  jwt?: string | null;
}

const AlkisSearch = ({ jwt }: AlkisSearchProps) => {
  const [resHtml, setResHtml] = useState<JSX.Element | null>(null);
  const onSearch = (value: string) => {
    const landparcelHtml = addHtmlFromData();
    setResHtml(landparcelHtml);
    console.log("xxx jwt", landparcelHtml);
  };
  return (
    <div style={{ marginTop: "40px", marginBottom: "60px" }}>
      <Search
        placeholder="type alkis id input"
        onSearch={onSearch}
        enterButton
      />

      {resHtml && <div style={{ marginTop: "40px" }}>{resHtml}</div>}
    </div>
  );
};

export default AlkisSearch;
