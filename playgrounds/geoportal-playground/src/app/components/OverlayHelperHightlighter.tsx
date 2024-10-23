import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { setMode } from '../store/slices/ui';
import type {
  OverlayHelperConfig,
  PositionOverlayHelper,
} from '../hooks/useOverlayHelper';

type OverlayHelperHightlighterProps = { configs: OverlayHelperConfig[] };

const OverlayHelperHightlighter = ({
  configs,
}: OverlayHelperHightlighterProps) => {
  const [hightlightRects, setHightlightRects] = useState([]);
  const dispatch = useDispatch();
  useEffect(() => {
    configs.forEach((currentItem) => {
      const { el, message, containerPos, contentPos } = currentItem;
      const rect = el.getBoundingClientRect();
      const pos = getContainerPosition(containerPos);
      const contPos = getElementPosition(contentPos);

      setHightlightRects((prev) => [
        ...prev,
        { rect, message, pos, contentPos, contPos },
      ]);
    });
  }, [configs]);

  const handleMessageClick = (e, message) => {
    e.stopPropagation();
    console.log('yyy click message', message);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        zIndex: 1000,
        width: '100vw',
        height: '100vh',
        background: 'black',
        opacity: 0.8,
      }}
      onClick={() => dispatch(setMode('default'))}
    >
      {hightlightRects.map((config, idx) => {
        const { rect, message, pos, contPos } = config;

        return (
          <div
            key={idx}
            onClick={(e) => handleMessageClick(e, message)}
            style={{
              position: 'absolute',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              color: 'white',
              // border: '1px solid yellow',
              ...pos,
            }}
          >
            <span
              style={{
                position: 'absolute',
                // border: '1px solid red',
                ...contPos,
              }}
            >
              {message}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default OverlayHelperHightlighter;

function getContainerPosition(alignment: PositionOverlayHelper) {
  let styleElement: { [key: string]: string } = {};
  switch (alignment) {
    case 'center':
      styleElement.transform = 'translate(0, 0)';
      break;
    case 'top':
      styleElement.transform = 'translate(0, -100%)';
      break;
    case 'left':
      styleElement.transform = 'translate(-100%, 0)';
      break;
    case 'right':
      styleElement.transform = 'translate(100%, 0)';
      break;
    case 'bottom':
      styleElement.transform = 'translate(0, 100%)';
      break;
    default:
      console.log('yyy element position');
  }

  return styleElement;
}

function getElementPosition(alignment: PositionOverlayHelper) {
  let styleElement: { [key: string]: string | number } = {};
  switch (alignment) {
    case 'center':
      styleElement.top = '50%';
      styleElement.left = '50%';
      styleElement.transform = 'translate(-50%, -50%)';
      break;
    case 'top':
      styleElement.top = '0';
      styleElement.transform = 'translate(50%, 0)';
      break;
    case 'left':
      styleElement.top = '50%';
      styleElement.transform = 'translate(0, -50%)';
      styleElement.left = 0;
      break;
    case 'right':
      styleElement.top = '50%';
      styleElement.transform = 'translate(0, -50%)';
      styleElement.right = 0;
      break;
    case 'bottom':
      styleElement.bottom = 0;
      styleElement.transform = 'translate(50%, 0)';
      break;
    default:
      console.log('yyy content position');
  }

  return styleElement;
}
