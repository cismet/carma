import { AutoComplete, Button, Input, Radio } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Map from './components/Map';
import { getAllLayers } from './helper/layers';
import {
  getGMLOutput,
  getJSONOutput,
  getLayerMode,
  getLayers,
  getOldVariant,
  getVectorOutput,
  setLayerMode,
  setLayers,
  setVectorStyle,
} from './store/slices/mapping';
import { findLayerByTitle } from './helper/featureInfo';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRepeat } from '@fortawesome/free-solid-svg-icons';
import type { Layer } from 'wms-capabilities';

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
  const layerMode = useSelector(getLayerMode);
  const vectorOutput = useSelector(getVectorOutput);
  const dispatch = useDispatch();
  const [selectedLayer, setSelectedLayer] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<{
    properties: {
      [key: string]: string;
    };
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [value, setValue] = useState('');
  const [codeVariant, setCodeVariant] = useState('object');
  const [tmpVectorStyle, setTmpVectorStyle] = useState('');
  const [outputTags, setOutputTags] = useState('');
  const [height, setHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const objectToTags = () => {
    try {
      const conf = code.split('\n').filter((line) => line.trim() !== '');
      const updatedConf = conf.map((tag) => {
        if (tag.startsWith('//')) {
          return undefined;
        }
        return (
          '<Keyword>carmaconf://infoBoxMapping:' + tag.trim() + '</Keyword>'
        );
      });
      setOutputTags(updatedConf.filter((tag) => tag !== undefined).join('\n'));
    } catch (e: unknown) {
      if (typeof e === 'string') {
        setErrorMessage(e.toUpperCase());
      } else if (e instanceof Error) {
        setErrorMessage(e.message);
      }
    }
  };

  const functionToTags = () => {
    try {
      const conf = code.replace(/\s+/g, ' ').trim();
      setOutputTags(
        '<Keyword>carmaconf://infoBoxMapping:' + conf + '</Keyword>',
      );
    } catch (e: unknown) {
      if (typeof e === 'string') {
        setErrorMessage(e.toUpperCase());
      } else if (e instanceof Error) {
        setErrorMessage(e.message);
      }
    }
  };

  const generateTags = () => {
    if (codeVariant === 'object') {
      objectToTags();
    } else {
      functionToTags();
    }
  };

  const objectToFeature = () => {
    const output = layerMode === 'default' ? jsonOutput : vectorOutput;
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

      const tmpInfo = eval(functionString)(output);

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
    const output = layerMode === 'default' ? jsonOutput : vectorOutput;
    try {
      let codeFunction = eval('(' + code + ')');
      const tmpInfo = codeFunction(output);

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

  const renderItem = (layer: Layer) => {
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

  useEffect(() => {
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const url = event.dataTransfer?.getData('URL');

      if (url) {
        dispatch(setVectorStyle(url));
        dispatch(setLayerMode('vector'));
        setTmpVectorStyle(url);
      }
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);

    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setHeight(containerRef.current.clientHeight - 90);
      }
    };

    if (containerRef.current) {
      handleResize();
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [containerRef]);

  return (
    <div
      className="flex flex-col items-center h-screen w-full gap-2 p-2"
      style={{ maxHeight: window.innerHeight, maxWidth: window.innerWidth }}
    >
      <div className="w-full rounded-md h-20 flex items-center gap-2">
        {layerMode === 'default' ? (
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
              const layers = value.layers.map((layer: Layer) => {
                return renderItem(layer);
              });
              return { label: renderTitle(value.title), options: layers };
            })}
            style={{ width: '50%' }}
            placeholder={
              layers.length > 0 ? 'Layer auswählen' : 'Layer werden geladen'
            }
          />
        ) : (
          <div className="w-1/2 h-full flex items-center gap-2">
            <Input
              placeholder="Vectorstyle url (https://tiles.cismet.de/poi/awg.style.json)"
              value={tmpVectorStyle}
              onChange={(e) => setTmpVectorStyle(e.target.value)}
            />
            <Button
              onClick={() => {
                dispatch(setVectorStyle(tmpVectorStyle));
              }}
            >
              Layer laden
            </Button>
          </div>
        )}
        <Button>
          <FontAwesomeIcon
            icon={faRepeat}
            onClick={() => {
              dispatch(
                setLayerMode(layerMode === 'default' ? 'vector' : 'default'),
              );
            }}
          />
        </Button>
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
                {jsonOutput && layerMode === 'default' && (
                  <pre>{JSON.stringify(jsonOutput, null, '\t')}</pre>
                )}
                {vectorOutput && layerMode === 'vector' && (
                  <pre>{JSON.stringify(vectorOutput, null, '\t')}</pre>
                )}
              </div>
            </div>
          </div>

          <div
            ref={containerRef}
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
            <div className="flex gap-2 items-center">
              <CodeMirror
                value={code}
                height={height ? `${height}px` : '300px'}
                extensions={[javascript({ jsx: true })]}
                onChange={(value) => setCode(value)}
                style={{ width: outputTags ? '50%' : '100%' }}
              />
              {outputTags && (
                <CodeMirror
                  value={outputTags}
                  height={height ? `${height}px` : '300px'}
                  extensions={[javascript({ jsx: true })]}
                  style={{ width: '50%%', maxWidth: '50%' }}
                />
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Button onClick={applyCode}>Anwenden</Button>
              <Button onClick={generateTags}>Keywords generieren</Button>
            </div>
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
