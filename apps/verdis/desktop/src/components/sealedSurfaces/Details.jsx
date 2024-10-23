import { Input, Select } from 'antd';
import CustomCard from '../ui/Card';
import { useDispatch, useSelector } from 'react-redux';
import {
  getCrossReferencesPerArea,
  getFlaechenId,
  getKassenzeichen,
  setIsLoading,
} from '../../store/slices/search';
import TextArea from 'antd/es/input/TextArea';
import { formatDate } from '../../tools/helper';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const DetailsRow = ({ title, value, width, customInput }) => {
  return (
    <div className={'flex justify-between gap-2'}>
      <div className="text-sm font-medium w-1/2">{title}:</div>
      <div className={`${width > 365 ? 'w-full' : 'w-1/2'}`}>
        {customInput ? customInput : <Input value={value} size="small" />}
      </div>
    </div>
  );
};

const mockExtractor = (input) => {
  return [];
};

const Details = ({
  dataIn,
  extractor = mockExtractor,
  width = 300,
  height = 200,
  style,
}) => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const crossReferencesPerArea = useSelector(getCrossReferencesPerArea);
  const selectedId = useSelector(getFlaechenId);
  const flaechen = extractor(kassenzeichen, crossReferencesPerArea);
  const [flaeche, setFlaeche] = useState({});
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (flaechen) {
      setFlaeche(flaechen.find((value) => value.id === selectedId));
    }
  }, [selectedId]);

  return (
    <CustomCard style={{ ...style, width, height }} title="Allgemein">
      <div className="flex flex-col gap-2 h-full">
        <DetailsRow title="Flächenbezeichnung" value={flaeche?.name} />
        <DetailsRow title="Größe (Grafik)" value={flaeche?.groesseGrafik} />
        <DetailsRow
          title="Größe (Korrektur)"
          value={flaeche?.groesseKorrektor}
        />
        <DetailsRow
          title="Flächenart"
          customInput={
            <Select
              value={flaeche?.flaechenArt}
              className="w-full"
              size="small"
            />
          }
        />
        <DetailsRow
          title="Anschlussgrad"
          customInput={
            <Select
              value={flaeche?.anschlussgradKomplett}
              className="w-full"
              size="small"
            />
          }
        />
        <DetailsRow
          title="Beschreibung"
          customInput={
            <Select
              value={flaeche?.beschreibung}
              className="w-full"
              size="small"
            />
          }
        />
        <DetailsRow title="Anteil" value={flaeche?.anteil} />
        <DetailsRow
          title="Änderungsdatum"
          value={formatDate(flaeche?.datumErfassung)}
        />
        <DetailsRow
          title="Veranlagungsdatum"
          value={flaeche?.datumVeranlagung}
        />
        <DetailsRow
          title="Bemerkung"
          size="small"
          customInput={
            <TextArea className="w-full" value={flaeche?.bemerkung} />
          }
        />
        <DetailsRow
          title="Querverweise"
          size="small"
          customInput={
            <div className="w-full border border-solid border-[#d9d9d9] rounded-[4px] h-28 overflow-y-auto flex flex-col gap-1 items-center justify-center text-sm">
              {flaeche?.crossReferences?.length > 0 &&
                flaeche?.crossReferences.map((row, i) => {
                  return (
                    <div
                      key={`crossReferences_${i}`}
                      className="flex w-full justify-center items-center py-1 hover:bg-zinc-100 cursor-pointer"
                      onClick={() => {
                        dispatch(setIsLoading(true));
                        navigate(
                          `/versiegelteFlaechen?kassenzeichen=${row.kassenzeichennummer8}&bez=${flaeche?.name}`
                        );
                      }}
                      typeof="button"
                    >
                      <span className="text-black underline">
                        {row.kassenzeichennummer8}:{flaeche?.name}
                      </span>
                    </div>
                  );
                })}
            </div>
          }
        />
      </div>
    </CustomCard>
  );
};

export default Details;
