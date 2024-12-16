import { notification } from "antd";
import { useContext, useEffect, useRef, useState } from "react";
import ProjGeoJson from "react-cismap/ProjGeoJson";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import verwallungBuchenhofen from "./assets/verwallung_buchenhofen.jpg";
import "./notification.css";

export default function NotesDisplay() {
  const { routedMapRef } = useContext(TopicMapContext);
  const mapRef = routedMapRef?.leafletMap?.leafletElement;
  const currentZoom = mapRef?.getZoom();
  const [hinweisShown, setHinweisShown] = useState(false);
  const hinweisShownRef = useRef(hinweisShown);
  useEffect(() => {
    hinweisShownRef.current = hinweisShown;
  }, [hinweisShown]);
  return (
    currentZoom >= 15 && (
      <ProjGeoJson
        featureClickHandler={(e) => {
          // e.originalEvent.stopImmediatePropagation();
          if (hinweisShownRef.current === false) {
            console.log("e.target.feature.properties", e);

            notification.info({
              style: { width: 440, marginTop: 30, marginRight: -13 },
              duration: 15,
              message: (
                <span>
                  <b>{e.target.feature.properties.titel}</b> -{" "}
                  {e.target.feature.properties.kategorie}
                </span>
              ),
              description: e.target.feature.properties.beschreibung,

              placement: "topRight",
              onClose: () => {
                setHinweisShown(false);
              },
            });
            setHinweisShown(true);
          }
        }}
        hoverer={(feature) => {
          return (
            feature.properties.kategorie +
            "<br/>Klicken Sie für mehr Informationen"
          );
        }}
        key={hinweisData.length + "damm"}
        style={(feature) => {
          return {
            fillColor: "#AAFF00",
            fillOpacity: 0.7,
            weight: 0,
          };
        }}
        opacity={1}
        featureCollection={hinweisData}
      />
    )
  );
}

const hinweisData = [
  {
    type: "Feature",
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::25832",
      },
    },
    properties: {
      titel: "Klärwerk Buchenhofen",
      kategorie: "Verwallung",
      beschreibung: (
        <div>
          <div>
            Die Verwallung Buchenhofen ist ein insgesamt etwa 342 m langer
            zweigeteilter Deich, der im Zeitraum 1970 bis 1973 durch den
            Wupperverband errichtet wurde, um das Klärwerk Buchenhofen vor einem
            Hochwasser der Wupper zu schützen. Die Verwallung ist ein "nicht
            ausgebauter Deich", es fehlen also einige nach heutigem Stand der
            Technik erforderliche konstruktive Elemente zum Schutz des Deiches
            vor Beschädigung durch Hochwasser. Der Deich erhebt sich an seinen
            höchsten Stellen etwa 2,5 bis 3 m über den normalen, regulierten
            Wasserstand der Wupper.
          </div>
          <img width="100%" src={verwallungBuchenhofen} />
          <div>(c) Stadt Wuppertal, Befliegung vom 16.03.2022</div>
        </div>
      ),
      hwschutz_t: "d",
      anlagennam: "Verwallung",
      gewkz: null,
      zweck: null,
      lage: null,
      schutzsyst: null,
      freibord: 0.0,
      hq: null,
      stat_von: 0.0,
      stat_bis: 0.0,
      ag: 1,
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [368043.676437766698655, 5676525.963603848591447],
            [368041.171716528595425, 5676517.687178406864405],
            [368033.523264054383617, 5676501.636237950995564],
            [368029.861790541559458, 5676495.571767030283809],
            [368026.230118451057933, 5676492.490382947959006],
            [368017.661486109893303, 5676482.040845761075616],
            [367994.522286957013421, 5676456.141996456310153],
            [367961.815677566861268, 5676422.267261624336243],
            [367957.681950073456392, 5676418.677475395612419],
            [367953.456048162013758, 5676415.229987622238696],
            [367934.176534931524657, 5676404.578393472358584],
            [367922.151651694264729, 5676396.840588394552469],
            [367903.095008297415916, 5676382.548005810938776],
            [367889.818441525159869, 5676374.128784242086112],
            [367883.382448344898876, 5676371.418208005838096],
            [367880.077336958842352, 5676369.520937147550285],
            [367872.257520554878283, 5676362.960348828695714],
            [367843.747790474153589, 5676346.650158660486341],
            [367825.151698345318437, 5676332.89944071136415],
            [367797.702576033421792, 5676309.409271753393114],
            [367794.451623967266642, 5676313.208128248341382],
            [367822.03590165451169, 5676336.81395928747952],
            [367841.01060952647822, 5676350.844641340896487],
            [367869.386479444510769, 5676367.078251172788441],
            [367877.203463040990755, 5676373.636462853290141],
            [367881.159151655214373, 5676375.907191992737353],
            [367887.493158474506345, 5676378.574815758503973],
            [367900.251791702059563, 5676386.665594187565148],
            [367919.295148304838222, 5676400.94821160659194],
            [367931.6118650684366, 5676408.873806526884437],
            [367950.644151837273967, 5676419.388812377117574],
            [367954.461649926612154, 5676422.503124603070319],
            [367958.371322433988098, 5676425.898338377475739],
            [367990.85811304312665, 5676459.545403541997075],
            [368013.862313890655059, 5676485.293154237791896],
            [368022.650481548742391, 5676496.010417050682008],
            [368026.00380945764482, 5676498.855632970109582],
            [368029.115535946388263, 5676504.009562047198415],
            [368036.495483470498584, 5676519.497021593153477],
            [368038.859162232431117, 5676527.307396152988076],
            [368041.279845068231225, 5676536.779503624886274],
            [368046.12415493093431, 5676535.541496373713017],
            [368043.676437766698655, 5676525.963603848591447],
          ],
        ],
      ],
    },
  },
];
