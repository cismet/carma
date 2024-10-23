import { faFileExport, faQuestion } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Input, Tooltip, message } from 'antd';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { appendSavedLayerConfig, getLayers } from '../store/slices/mapping';
import './popover.css';
import { nanoid } from '@reduxjs/toolkit';
import { faQuestionCircle } from '@fortawesome/free-regular-svg-icons';

const Save = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  const resetStates = () => {
    setTitle('');
    setDescription('');
    setThumbnail('');
  };

  return (
    <div className="p-2 flex flex-col gap-3 w-96">
      {contextHolder}
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faFileExport} className="text-xl" />
        <h4 className="mb-0">Speichern</h4>
      </div>
      <hr className="my-0" />
      <label className="-mb-2 font-medium" htmlFor="title">
        Name:
      </label>
      <Input
        id="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="-mb-2 font-medium" htmlFor="description">
        Beschreibung:
      </label>
      <Input.TextArea
        id="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex gap-1 -mb-2 font-medium items-center">
        <label className="mb-0 font-medium" htmlFor="thumbnail">
          Vorschaubild
        </label>
        <Tooltip
          placement="bottom"
          title="Das Vorschaubild wird automatisch generiert wenn keine URL angegeben wird."
          arrow={false}
          trigger={['hover', 'click']}
        >
          <FontAwesomeIcon icon={faQuestionCircle} className="text-sm" />
        </Tooltip>
      </div>
      <Input
        id="thumbnail"
        value={thumbnail}
        placeholder="Vorschau URL"
        onChange={(e) => setThumbnail(e.target.value)}
      />

      <Button
        onClick={() => {
          const config = {
            title,
            description,
            type: 'collection',
            layers,
            thumbnail,
            id: nanoid(),
          };
          try {
            dispatch(appendSavedLayerConfig(config));
            resetStates();
            messageApi.open({
              type: 'success',
              content: `Konfiguration "${title}" wurde erfolgreich gespeichert.`,
            });
          } catch (e) {
            messageApi.open({
              type: 'error',
              content: 'Es gab einen Fehler beim speichern der Konfiguration',
            });
          }
        }}
      >
        Konfiguration Speichern
      </Button>
    </div>
  );
};

export default Save;
