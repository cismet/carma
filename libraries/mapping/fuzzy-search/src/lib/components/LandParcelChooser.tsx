import { Select } from "antd";

const LandParcelChooser = () => {
  return (
    <div
      style={{
        display: "flex",
        gap: 1,
      }}
    >
      <Select
        showSearch
        placeholder="Gemarkung"
        style={{ width: 160 }}
        options={[]}
      />
      <Select
        showSearch
        placeholder="Flur"
        style={{ width: 80 }}
        options={[]}
      />
      <Select
        showSearch
        placeholder="Flurstück"
        style={{ width: 120 }}
        options={[]}
      />
    </div>
  );
};

export default LandParcelChooser;
