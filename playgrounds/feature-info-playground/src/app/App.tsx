import { AutoComplete, Button, Radio } from 'antd';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Map from './components/Map';
import { getAllLayers } from './helper/layers';
import {
  getGMLOutput,
  getJSONOutput,
  getLayers,
  getOldVariant,
  setLayers,
} from './store/slices/mapping';
import { findLayerByTitle } from './helper/featureInfo';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';

export function App() {
  const [code, setCode] = useState(`// Objekt Variante
title:'Adresse ('+p.adresse+')'
subtitle: p.ort
header:p.name
url:p.homepage
tel:p.telefon

// Funktion Variante
function createInfoBoxInfo(p) {
  const info = {
    title: p.adresse,
    subtitle: p.ort,
    header: p.name,
    url: p.homepage,
    tel: p.telefon,
  };
  return info;
}`);
  const layers = useSelector(getLayers);
  const gmlOutput = useSelector(getGMLOutput);
  const jsonOutput = useSelector(getJSONOutput);
  const oldVariant = useSelector(getOldVariant);
  const dispatch = useDispatch();
  const [selectedLayer, setSelectedLayer] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<{} | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [value, setValue] = useState('');
  const [codeVariant, setCodeVariant] = useState('object');

  const objectToFeature = () => {
    try {
      const conf = code.split('\n').filter((line) => line.trim() !== '');
      let functionString = `(function(p) {
                    const info = {`;

      conf.forEach((rule) => {
        functionString += `${rule.trim()},\n`;
      });

      functionString += `
                                          };
                                          return info;
                    })`;

      const tmpInfo = eval(functionString)(jsonOutput);

      const properties = {
        ...tmpInfo,
      };

      setSelectedFeature({
        properties,
      });
      setErrorMessage('');
    } catch (e: unknown) {
      if (typeof e === 'string') {
        setErrorMessage(e.toUpperCase());
      } else if (e instanceof Error) {
        setErrorMessage(e.message);
      }
    }
  };

  const functionToFeature = () => {
    try {
      let codeFunction = eval('(' + code + ')');
      const tmpInfo = codeFunction(jsonOutput);

      const properties = {
        ...tmpInfo,
      };

      setSelectedFeature({
        properties,
      });
      setErrorMessage('');
    } catch (e: unknown) {
      if (typeof e === 'string') {
        setErrorMessage(e.toUpperCase());
      } else if (e instanceof Error) {
        setErrorMessage(e.message);
      }
    }
  };

  const applyCode = () => {
    if (codeVariant === 'object') {
      objectToFeature();
    } else {
      functionToFeature();
    }
  };

  useEffect(() => {
    const requestLayers = async () => {
      const result = await getAllLayers();
      dispatch(setLayers(result));
    };

    requestLayers();
  }, []);

  const renderTitle = (title: string) => (
    <span className="text-lg font-semibold text-black">{title}</span>
  );

  const renderItem = (layer: any) => {
    return {
      value: layer.Title,
      label: (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          {layer.Title}
        </div>
      ),
    };
  };

  return (
    <div
      className="flex flex-col items-center h-screen w-full gap-2 p-2"
      style={{ maxHeight: window.innerHeight, maxWidth: window.innerWidth }}
    >
      <div className="w-full rounded-md h-20 flex items-center gap-2">
        <AutoComplete
          value={value}
          onChange={(e) => {
            setValue(e);
          }}
          onSelect={(value) => {
            const layer = findLayerByTitle(layers, value);
            const item = {
              name: layer.Name,
              url: layer.url,
            };
            setSelectedLayer(item);
          }}
          options={layers.map((value) => {
            const layers = value.layers.map((layer) => {
              return renderItem(layer);
            });
            return { label: renderTitle(value.title), options: layers };
          })}
          style={{ width: '50%' }}
          placeholder={
            layers.length > 0 ? 'Layer auswählen' : 'Layer werden geladen'
          }
        />
      </div>
      <div
        className="flex w-full items-center justify-center gap-2 h-full"
        style={{ maxHeight: window.innerHeight - 100 }}
      >
        <div className="h-full rounded-md w-1/3">
          <Map layer={selectedLayer} selectedFeature={selectedFeature} />
        </div>
        <div className="flex flex-col gap-2 items-center justify-center w-2/3 h-full">
          <div className="max-w-full w-full h-1/3 flex gap-2">
            <div className="border-solid p-2 overflow-auto rounded-md border-black border-[1px] w-full h-full">
              GML:
              <div>{gmlOutput && <pre>{gmlOutput}</pre>}</div>
            </div>
            <div className="border-solid p-2 rounded-md overflow-auto border-black border-[1px] w-full h-full">
              JSON:
              <div>
                {jsonOutput && (
                  <pre>{JSON.stringify(jsonOutput, null, '\t')}</pre>
                )}
              </div>
            </div>
          </div>

          <div
            className={`rounded-md border-solid ${
              errorMessage ? 'border-red-500' : 'border-black'
            } border-[1px] p-2 w-full h-1/3 flex flex-col gap-2`}
          >
            <Radio.Group
              onChange={(e) => setCodeVariant(e.target.value)}
              value={codeVariant}
            >
              <Radio value="object">Objekt</Radio>
              <Radio value="function">Funktion</Radio>
            </Radio.Group>
            <CodeMirror
              value={code}
              height="300px"
              extensions={[javascript({ jsx: true })]}
              onChange={(value) => setCode(value)}
            />
            <Button onClick={applyCode}>Anwenden</Button>
          </div>

          <div className="rounded-md w-full h-1/3 flex gap-2">
            <div className="border-solid p-2 overflow-auto rounded-md border-black border-[1px] w-full h-full">
              Altes Design:
              {oldVariant && (
                <div dangerouslySetInnerHTML={{ __html: oldVariant }} />
              )}
            </div>
            <div className="border-solid p-2 rounded-md overflow-auto border-black border-[1px] w-full h-full">
              Error Code:
              {errorMessage && <div>{errorMessage}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
