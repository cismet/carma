import InfoBox from "react-cismap/topicmaps/InfoBox";
import type { ReactNode } from "react";
import InfoBoxActions from "./InfoBoxActions";
import type { InfoBoxAction } from "./InfoBoxActions";

interface PhoneInfoBoxProps {
  feature: unknown;
  header: ReactNode;
  headerColor: string;
  title: ReactNode;
  titleColor?: string;
  details: ReactNode;
  index: number;
  count: number;
  // used in the pager tooltips, e.g. "vorherige Fläche"
  itemName: string;
  onGo: (index: number) => void;
  actions: InfoBoxAction[];
}

const pagerButtonClass = "btn btn-link p-0";
const pagerButtonStyle = { color: "#007bff", textDecoration: "none" };

const PhoneInfoBox = ({
  feature,
  header,
  headerColor,
  title,
  titleColor,
  details,
  index,
  count,
  itemName,
  onGo,
  actions,
}: PhoneInfoBoxProps) => {
  const go = (step: number) => {
    onGo((index + step + count) % count);
  };

  // InfoBox's own navigator only works with a FeatureCollectionContext, so it gets its own
  const content = (
    <span
      style={{
        display: "block",
        marginTop: -17,
        marginBottom: "-1rem",
        paddingLeft: 3,
      }}
    >
      <span style={{ display: "block", fontSize: 15 }}>{details}</span>
      {count > 1 && (
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className={pagerButtonClass}
            style={pagerButtonStyle}
            title={`vorherige ${itemName}`}
            onClick={() => go(-1)}
          >
            &lt;&lt;
          </button>
          <span>
            {index + 1} / {count}
          </span>
          <button
            type="button"
            className={pagerButtonClass}
            style={pagerButtonStyle}
            title={`nächste ${itemName}`}
            onClick={() => go(1)}
          >
            &gt;&gt;
          </button>
        </span>
      )}
    </span>
  );

  return (
    <InfoBox
      currentFeature={feature}
      pixelwidth={350}
      infoStyle={{ width: "calc(100vw - 25px)" }}
      header={<span>{header}</span>}
      headerColor={headerColor}
      title={
        <span
          style={{
            display: "block",
            marginRight: -12,
            color: titleColor,
            fontSize: 19,
          }}
        >
          {title}
        </span>
      }
      secondaryInfoBoxElements={[
        <InfoBoxActions key="actions" actions={actions} />,
      ]}
      subtitle={content}
      hideNavigator={true}
    />
  );
};

export default PhoneInfoBox;
