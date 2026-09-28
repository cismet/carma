import type { AdvancedFilterState } from "@carma-mapping/components";

interface TitleBoxProps {
  filterState: AdvancedFilterState;
  lebenslagen: string[];
}

function buildTitleText(
  filterState: AdvancedFilterState,
  lebenslagen: string[]
): string | null {
  if (
    !filterState ||
    filterState.positiv.length === 0 ||
    filterState.positiv.length >= lebenslagen.length
  ) {
    return null;
  }

  let desc = "";

  if (filterState.positiv.length <= 4) {
    desc += filterState.positiv.join(", ");
  } else {
    desc += filterState.positiv.length + " Themen";
  }

  if (filterState.negativ.length > 0) {
    if (filterState.negativ.length <= 3) {
      desc += " ohne " + filterState.negativ.join(", ");
    } else {
      desc += " (" + filterState.negativ.length + " Themen ausgeschlossen)";
    }
  }

  return desc;
}

const TitleBox = ({ filterState, lebenslagen }: TitleBoxProps) => {
  const desc = buildTitleText(filterState, lebenslagen);

  if (!desc) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 54,
        right: 62,
        height: 30,
        zIndex: 555,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        color: "black",
        opacity: 0.9,
        paddingLeft: 10,
        paddingRight: 10,
        pointerEvents: "none",
      }}
    >
      <b>Mein Themenstadtplan:</b>&nbsp;{desc}
    </div>
  );
};

export default TitleBox;
