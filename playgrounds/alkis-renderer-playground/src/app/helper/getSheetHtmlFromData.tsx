import { Divider, Tabs } from "antd";
import { getAllAdditionalSheets, searchLandparcelByName } from "./getToken";
import AdditionalSheet from "../components/AdditionalSheet";
import CustomCard from "../components/CustomCard";

export const getSheetHtml = async (
  jwt: string,
  name: string = "053001-137-00020/0001"
) => {
  const wrapStyle = { display: "flex", width: "100%" };
  const colStyle = { width: "50%" };
  const titleStyle = { marginBottom: "14px" };
  const linkStyle = {
    color: "#1677ff",
    cursor: "pointer",
    fontWeight: "500",
  };
  return (
    <div>
      <CustomCard title="Buchungsblatt">
        <CustomCard style={{ marginBottom: "1rem" }} title="Buchungsblatt">
          <div>Block one</div>
        </CustomCard>
        <CustomCard style={{ marginBottom: "1rem" }} title="Eigentümer">
          <div>Block one</div>
        </CustomCard>
        <CustomCard title="Buchungsstellen und Flurstücke">
          <div>Block one</div>
        </CustomCard>
      </CustomCard>
    </div>
  );
};
