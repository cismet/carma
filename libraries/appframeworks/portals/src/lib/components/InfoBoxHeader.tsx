import Color from "color";
import { useEffect, useState } from "react";
import { parseHeader } from "../utils/utils";
import { FeatureInfoProperties } from "@carma/types";

interface InfoBoxProps {
  headerColor?: string;
  content: string;
  properties?: FeatureInfoProperties;
}

export const InfoBoxHeader = ({
  headerColor = "#928888",
  content,
  properties,
}: InfoBoxProps) => {
  const [headerText, setHeaderText] = useState("");
  let headerBackgroundColor = Color(headerColor);
  let textColor = "black";
  if (headerBackgroundColor.isDark()) {
    textColor = "white";
  }

  useEffect(() => {
    const updateHeaderAndColor = async () => {
      if (content) {
        const header = await parseHeader(content, properties);
        setHeaderText(header || content);
      }
    };

    updateHeaderAndColor();
  }, [content]);

  return (
    <table style={{ width: "100%" }}>
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "left",
              verticalAlign: "top",
              background: headerColor,
              color: textColor,
              opacity: "0.9",
              paddingLeft: "3px",
              paddingTop: "0px",
              paddingBottom: "0px",
            }}
          >
            {headerText}
          </td>
        </tr>
      </tbody>
    </table>
  );
};
