import { Input } from "antd";
const { Search } = Input;

interface AlkisSearchProps {
  jwt?: string | null;
}

const AlkisSearch = ({ jwt }: AlkisSearchProps) => {
  const onSearch = (value: string) => {
    console.log("xxx jwt", jwt, value);
  };
  return (
    <div style={{ marginTop: "40px" }}>
      <Search
        placeholder="type alkis id input"
        onSearch={onSearch}
        enterButton
      />
    </div>
  );
};

export default AlkisSearch;
