import HeadBlock from "../heads/HeadBlock";
import { useSelector } from "react-redux";
import { getEditActive } from "../../../store/slices/editing";
const InfoBlock = ({
  title,
  children,
  controlBar,
  titleAction,
  extraActions,
}) => {
  const isEdit = useSelector(getEditActive);
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "6px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <HeadBlock title={title} titleAction={titleAction}>
        {isEdit && controlBar}
        {extraActions}
      </HeadBlock>
      {children}
    </div>
  );
};

export default InfoBlock;
