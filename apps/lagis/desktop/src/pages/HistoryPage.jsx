import HistoryInfo from "../components/history/HistoryInfo";
import View from "../components/history/View";
import OptionHistory from "../components/history/OptionHistory";
import { useSelector } from "react-redux";
import {
  getHistory,
  getLandparcel,
  getHistorieHalten,
  getHistorieHaltenRootText,
} from "../store/slices/lagis";
import { generateGraphObj } from "../core/tools/history";
import { useState, useRef, useEffect } from "react";
import { informationenBlockExtractor } from "../core/extractors/historyBlockExtractor";
import GraphProvider from "../components/commons/GraphProvider";
const HistoryPage = ({ width = "100%", height = "1000", inStory = false }) => {
  const [divHeight, setDivHeight] = useState(0);
  const [divWidth, setDivWidth] = useState(0);
  const divRef = useRef(null);
  const history = useSelector(getHistory);
  const fstck = useSelector(getLandparcel);
  const historyHalten = useSelector(getHistorieHalten);
  const historieHaltenRootText = useSelector(getHistorieHaltenRootText);
  const [historieHaltenCheckbox, setHistorieHalten] = useState(
    historyHalten ? true : false
  );
  const [firstDarstellung, setFirstDarstellung] = useState("Vollständig");
  const [numberBegrenzteTiefe, setNumberBegrenzteTiefe] = useState(1);
  const [secondDarstellung, setSecondDarstellung] = useState("Flurstücke");
  const [ifNodesReady, setIfNodesReady] = useState(false);

  let storyStyle = {};
  if (inStory) {
    storyStyle = {
      borderStyle: "dotted",
      borderWidth: "1px solid ",
      background: "gray",
      padding: "4px",
    };
  }

  let fstckString;
  if (fstck) {
    fstckString = `${fstck.flurstueck_schluessel.gemarkung.bezeichnung} ${fstck.flurstueck_schluessel.flur} ${fstck.flurstueck_schluessel.flurstueck_zaehler}/${fstck.flurstueck_schluessel.flurstueck_nenner}`;
  }

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDivWidth(divRef?.current?.offsetWidth);
        setDivHeight(divRef?.current?.offsetHeight);
      }
    });

    resizeObserver.observe(divRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (history) {
      setIfNodesReady(true);
    } else {
      if (historyHalten) {
        setIfNodesReady(true);
      } else {
        setIfNodesReady(false);
      }
    }
  }, [history]);

  return (
    <div
      style={{
        ...storyStyle,
      }}
      className="h-full max-h[calc(100%-30px)]"
    >
      <div
        className="h-[calc(70%-16px)]"
        ref={divRef}
        style={{ marginBottom: "16px" }}
      >
        <GraphProvider
          key={
            `GraphProviderKey.` +
            JSON.stringify({
              firstDarstellung,
              secondDarstellung,
              numberBegrenzteTiefe,
              historyHalten,
              divWidth,
              divHeight,
            })
          }
          width={divWidth}
          height={divHeight}
          loading={ifNodesReady}
          dataIn={historyHalten === undefined ? history : historyHalten}
          historieHalten={historyHalten}
          historieHaltenCheckbox={historieHaltenCheckbox}
          historieHaltenRootText={historieHaltenRootText}
          firstDarstellung={firstDarstellung}
          secondDarstellung={secondDarstellung}
          numberBegrenzteTiefe={numberBegrenzteTiefe}
          rootObjectText={
            historyHalten === undefined ? fstckString : historieHaltenRootText
          }
          extractor={(histObj) => {
            if (histObj && fstckString) {
              return generateGraphObj(
                history,
                fstckString,
                firstDarstellung,
                secondDarstellung,
                numberBegrenzteTiefe,
                historieHaltenRootText,
                historieHaltenCheckbox,
                historyHalten
              );
            } else {
              return undefined;
            }
          }}
        />
      </div>

      <div className="flex gap-4 h-[calc(30%-4px)]">
        <HistoryInfo dataIn={fstck} extractor={informationenBlockExtractor} />
        <View
          setFirstDarstellung={setFirstDarstellung}
          setSecondDarstellung={setSecondDarstellung}
          setNumberBegrenzteTiefe={setNumberBegrenzteTiefe}
          firstDarstellung={firstDarstellung}
        />
        <OptionHistory
          setHistorieHalten={setHistorieHalten}
          historieHalten={historieHaltenCheckbox}
          rootObjectText={fstckString}
        />
      </div>
    </div>
  );
};

export default HistoryPage;
