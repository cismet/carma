import { useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import DocMap from './components/DocMap';
import { useParams } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';

export type layer = {
  [key: string]: {
    x: number;
    y: number;
    maxZoom: number;
  };
};

export type Doc = {
  url: string;
  layer: string;
  title?: string;
  docTitle?: string;
  group: string;
  file: string;
  meta: {
    [key: string]: {
      x: number;
      y: number;
      maxZoom: number;
    } & {
      contentLength: string;
      pages: number;
    };
  };
};

/* eslint-disable-next-line */
export interface DocumentViewerProps {
  docs: Doc[];
  mode: string;
}

export function DocumentViewer({ docs, mode }: DocumentViewerProps) {
  let { file } = useParams();
  const sideBarMinSize = 130;
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const [wholeWidthTrigger, setWholeWidthTrigger] = useState(undefined);
  const [wholeHeightTrigger, setWholeHeightTrigger] = useState(undefined);
  const [mapWidth, setMapWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [compactView, setCompactView] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  const mapHeight = 'calc(100vh - 49px)';

  const handleMouseDown = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    isResizingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isResizingRef.current) return;

    let newWidth = event.clientX;

    if (newWidth < sideBarMinSize) newWidth = sideBarMinSize;
    if (newWidth > 400) newWidth = 400;

    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${newWidth}px`;
      if (newWidth === 400) {
        setCompactView(false);
      } else {
        setCompactView(true);
      }
    }
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (mapWrapperRef.current) {
      setHeight(mapWrapperRef.current.clientHeight);
    }
  }, [mapWrapperRef]);

  return (
    <div style={{ background: '#343a40', height: '100vh' }}>
      <div
        style={{
          backgroundImage: 'linear-gradient(to bottom, #3c3c3c 0, #222 100%)',
        }}
      >
        <Navbar
          title={docs[0]?.title || docs[0].docTitle}
          // @ts-ignore
          maxIndex={docs[parseInt(file!) - 1]?.meta.pages}
          downloadUrl={docs[parseInt(file!) - 1]?.url}
          docs={docs}
          setHeightTrigger={setWholeHeightTrigger}
          setWidthTrigger={setWholeWidthTrigger}
          currentHeightTrigger={wholeHeightTrigger}
          currentWidthTrigger={wholeWidthTrigger}
        />
      </div>

      <div
        style={{
          height: mapHeight,
          background: 'grey',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          alignContent: 'center',
        }}
      >
        {docs.length > 1 && (
          <div
            id="sidebar"
            style={{
              background: 'rgb(153, 153, 153)',
              height: mapHeight,
              // width: sidebarWidth,
              padding: '5px 1px 5px 5px',
              overflow: 'scroll',
            }}
            ref={sidebarRef}
          >
            <Sidebar
              docs={docs}
              index={parseInt(file!)}
              // @ts-ignore
              maxIndex={docs[parseInt(file!) - 1]?.meta.pages}
              mode={mode}
              compactView={compactView}
            />
          </div>
        )}
        <div
          id="sidebar-slider"
          style={{
            background: '#999999',
            height: mapHeight,
            width: 10,
            cursor: 'col-resize',
          }}
          onMouseDown={handleMouseDown}
          // onTouchStart={startResizing}
          // onTouchEnd={stopResizing}
        ></div>
        <div
          id="docviewer"
          style={{
            height: mapHeight,
            width: '100%',
          }}
          ref={mapWrapperRef}
        >
          <DocMap
            docs={docs}
            index={parseInt(file!)}
            height={height}
            width={mapWidth}
            setWholeHeight={wholeHeightTrigger}
            setWholeWidth={wholeWidthTrigger}
          />
        </div>
      </div>
    </div>
  );
}

export default DocumentViewer;
