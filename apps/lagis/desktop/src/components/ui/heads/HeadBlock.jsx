import { MenuOutlined } from "@ant-design/icons";
const HeadBlock = ({ title, children, titleAction, editable = false }) => {
  return (
    <div
      className="flex flex-wrap justify-between items-center px-3"
      style={{
        border: `1px solid ${editable ? "#B7EB8F" : "transparent"}`,
        borderBottomColor: editable ? "#B7EB8F" : "#C4C4C4",
        backgroundColor: editable ? "#F6FFED" : "#FFFFFF",
        borderRadius: "6px 6px 0 0",
      }}
    >
      <MenuOutlined style={{ fontSize: "14px" }} />
      <h3
        className="mr-auto my-3 text-left ml-3 mr-3 text-base"
        style={{ color: "#474747" }}
      >
        {title}
      </h3>
      {titleAction && titleAction}
      <div className="my-1"> {children}</div>
    </div>
  );
};

export default HeadBlock;
