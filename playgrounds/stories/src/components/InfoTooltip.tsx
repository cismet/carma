import { Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

const { Link } = Typography;

interface InfoTooltipProps {
  title: string;
  href: string;
  linkText?: string;
}

export const InfoTooltip = ({
  title,
  href,
  linkText = "Documentation",
}: InfoTooltipProps) => {
  return (
    <Tooltip
      title={
        <>
          <strong>{title}</strong>
          <br />
          <Link href={href} target="_blank" style={{ color: "#1890ff" }}>
            {linkText}
          </Link>
        </>
      }
      trigger={["hover", "click"]}
    >
      <InfoCircleOutlined style={{ fontSize: "12px", cursor: "pointer" }} />
    </Tooltip>
  );
};
