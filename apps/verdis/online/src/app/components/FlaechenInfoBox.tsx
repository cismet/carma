import { Children, isValidElement, useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import InfoBox from "react-cismap/topicmaps/InfoBox";
import {
  getInfoTextForAnschlussgrad,
  getInfoTextForFlaechenart,
  getMergedFlaeche,
} from "../../utils/kassenzeichenHelper";

interface FlaechenInfoBoxProps {
  flaeche: { bez?: string };
  flaechenCR?: unknown;
}

// The Kurzinfo texts are <div><strong>Title:</strong><br />text</div>.
// Their title goes into the header, so it is cut from the text here.
const splitKurzinfo = (
  info: ReactElement
): { title?: string; body: ReactNode } => {
  const render = info.type as (props: unknown) => ReactNode;
  const root = typeof render === "function" ? render(info.props) : info;
  if (!isValidElement<{ children?: ReactNode }>(root)) return { body: info };
  const [first, second, ...rest] = Children.toArray(root.props.children);
  if (
    !isValidElement<{ children?: ReactNode }>(first) ||
    first.type !== "strong"
  ) {
    return { body: info };
  }
  const title = String(first.props.children).replace(/:\s*$/, "");
  const body =
    isValidElement(second) && second.type === "br" ? rest : [second, ...rest];
  return { title, body };
};

// must be rendered inside the map: InfoBox places itself as a leaflet control
const FlaechenInfoBox = ({ flaeche, flaechenCR }: FlaechenInfoBoxProps) => {
  const [page, setPage] = useState(0);
  const merged = getMergedFlaeche(flaeche, flaechenCR);
  const flaechenart: string =
    merged.flaechenart ?? merged.flaecheninfo?.flaechenart?.art ?? "";
  const pages = [
    getInfoTextForFlaechenart(merged),
    getInfoTextForAnschlussgrad(merged),
  ].map(splitKurzinfo);

  useEffect(() => {
    setPage(0);
  }, [flaeche.bez]);

  const go = (step: number) => {
    setPage((p) => (p + step + pages.length) % pages.length);
  };

  // InfoBox's own navigator only works with a FeatureCollectionContext, so it gets its own
  const content = (
    // pulls the text up into the empty margins InfoBox leaves above it
    <span style={{ display: "block", marginTop: -14 }}>
      {pages[page].body}
      {pages.length > 1 && (
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            marginBottom: 3,
          }}
        >
          <button
            type="button"
            className="btn btn-link p-0"
            title="vorheriger Hinweis"
            onClick={() => go(-1)}
          >
            &lt;&lt;
          </button>
          <span>
            {page + 1} / {pages.length}
          </span>
          <button
            type="button"
            className="btn btn-link p-0"
            title="nächster Hinweis"
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
      currentFeature={flaeche}
      pixelwidth={350}
      header={<span>{pages[page].title ?? flaechenart}</span>}
      headerColor="#F0AD4E"
      title={`Fläche ${flaeche.bez ?? ""}`}
      subtitle={content}
      hideNavigator={true}
    />
  );
};

export default FlaechenInfoBox;
