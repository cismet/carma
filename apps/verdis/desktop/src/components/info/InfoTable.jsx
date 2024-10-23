import { useDispatch, useSelector } from "react-redux";
import CustomCard from "../ui/Card";
import {
  getKassenzeichen,
  searchForAlkisLandparcel,
} from "../../store/slices/search";
import { LandParcelColors } from "../../tools/mappingTools";
import {
  getGeneralGeometryCollection,
  setGeneralGeometrySelected,
} from "../../store/slices/mapping";

const mockExtractor = (kassenzeichen) => {
  return [];
};

const Row = ({ title, id }) => {
  const color = LandParcelColors[id % LandParcelColors.length];
  const dispatch = useDispatch();
  const geometries = useSelector(getGeneralGeometryCollection);
  const currentGeometry = geometries.find(
    (geometry) => geometry.properties.id === id
  );

  return (
    <>
      <div
        className={`flex items-center w-full gap-3 px-2 py-1 text-base cursor-pointer hover:bg-zinc-100 ${
          currentGeometry?.selected ? "bg-primary/20" : ""
        }`}
        onClick={() => {
          dispatch(setGeneralGeometrySelected({ id: id }));
          dispatch(searchForAlkisLandparcel(title));
        }}
      >
        <div
          className="w-2 h-2"
          style={{ backgroundColor: color, opacity: 0.6 }}
        ></div>
        <span>{title}</span>
      </div>
      <hr className="h-px bg-zinc-200 border-0 my-0" />
    </>
  );
};

const Geometrics = ({
  width = 300,
  height = 200,
  style,
  title = "Geometrien",
  dataIn,
  extractor = mockExtractor,
}) => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const data = extractor(dataIn ? dataIn : kassenzeichen);
  return (
    <CustomCard style={{ ...style, width, height }} title={title}>
      {data?.map((row, i) => (
        <Row key={`geometrics_${i}`} id={row.id} title={row.title} />
      ))}
    </CustomCard>
  );
};

export default Geometrics;
