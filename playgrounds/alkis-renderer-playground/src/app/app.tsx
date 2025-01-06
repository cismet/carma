import { Input } from "antd";
const { Search } = Input;

export function App() {
  const onSearch = (value: string) => {
    console.log("xxx Search text:", value.trim());
  };
  return (
    <div>
      <Search placeholder="input search text" onSearch={onSearch} enterButton />
    </div>
  );
}

export default App;
