import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  faEye,
  faEyeSlash,
  faLayerGroup,
  faX,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Layer } from '@cismet/layer-lib';
import { useEffect, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { useDispatch, useSelector } from 'react-redux';
import { cn } from '../../helper/helper';
import {
  changeVisibility,
  getLayers,
  getSelectedLayerIndex,
  getShowLeftScrollButton,
  removeLayer,
  setSelectedLayerIndex,
  setShowLeftScrollButton,
  setShowRightScrollButton,
} from '../../store/slices/mapping';
import { getShowLayerHideButtons } from '../../store/slices/ui';
import { iconColorMap, iconMap } from './items';
import './tabs.css';
import { useSearchParams } from 'react-router-dom';
// import { faCircle } from '@fortawesome/free-regular-svg-icons';

interface LayerButtonProps {
  title: string;
  id: string;
  index: number;
  icon?: string;
  layer: Layer;
  background?: boolean;
}

const LayerButton = ({
  title,
  id,
  index,
  icon,
  layer,
  background,
}: LayerButtonProps) => {
  const { ref, inView } = useInView({
    threshold: 0.99,
  });
  const dispatch = useDispatch();
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const showLayerHideButtons = useSelector(getShowLayerHideButtons);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const showSettings = index === selectedLayerIndex;
  const layersLength = useSelector(getLayers).length;
  const urlPrefix = window.location.origin + window.location.pathname;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });
  const buttonRef = useRef<HTMLDivElement>(null);
  let [searchParams, setSearchParams] = useSearchParams();
  const showAlternateIcons = searchParams.get('altIcon') !== null;
  const iconName = showAlternateIcons
    ? layer.other?.alternativeIcon
    : layer.other?.icon;

  const style = { transform: CSS.Translate.toString(transform) };

  useEffect(() => {
    if (!inView && index === 0) {
      dispatch(setShowLeftScrollButton(true));
    }
    if (!inView && index === layersLength - 1) {
      dispatch(setShowRightScrollButton(true));
    }
    if (inView && index === 0) {
      dispatch(setShowLeftScrollButton(false));
    }
    if (inView && index === layersLength - 1) {
      dispatch(setShowRightScrollButton(false));
    }
    if (!inView && selectedLayerIndex === index) {
      document.getElementById(`layer-${id}`).scrollIntoView();
    }
  }, [inView, selectedLayerIndex]);

  return (
    <div
      ref={(el) => {
        buttonRef.current = el;
        ref(el);
      }}
      className={cn(
        '',
        // index === -1 && 'ml-auto',
        // index === layersLength - 1 && 'mr-auto',
        showLeftScrollButton && index === -1 && 'pr-4'
      )}
      id={`layer-${id}`}
    >
      <div
        ref={setNodeRef}
        onClick={(e) => {
          e.stopPropagation();
          dispatch(setSelectedLayerIndex(showSettings ? -2 : index));
        }}
        style={style}
        {...listeners}
        {...attributes}
        className={cn(
          'w-fit min-w-max flex items-center gap-2 px-3 rounded-[10px] h-8 z-[99999999] button-shadow',
          selectedLayerIndex === -2
            ? layer.visible
              ? 'bg-white'
              : 'bg-neutral-200/70'
            : showSettings
            ? 'bg-white'
            : 'bg-neutral-200'
        )}
      >
        {iconName ? (
          <div style={{ height: 14, width: 14 }}>
            <img
              src={urlPrefix + `icons/${iconName}.svg`}
              alt="icon"
              className="h-full"
            />
          </div>
        ) : icon === 'ortho' ? (
          <div style={{ height: 14, width: 14 }}>
            <img
              src={urlPrefix + 'images/ortho.png'}
              alt="Ortho"
              className="h-full"
            />
          </div>
        ) : (
          <FontAwesomeIcon
            icon={icon ? iconMap[icon] : faLayerGroup}
            className="text-base"
            style={{ color: iconColorMap[icon] }}
            id="icon"
          />
        )}
        <span className="text-base sm:hidden">{layersLength} Layer</span>
        {!background && (
          <>
            <span className="text-base">{title}</span>
            <button
              className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                if (showLayerHideButtons) {
                  if (layer.visible) {
                    dispatch(changeVisibility({ id, visible: false }));
                  } else {
                    dispatch(changeVisibility({ id, visible: true }));
                  }
                } else {
                  dispatch(removeLayer(id));
                }
              }}
            >
              <FontAwesomeIcon
                icon={
                  showLayerHideButtons
                    ? layer.visible
                      ? faEye
                      : faEyeSlash
                    : faX
                }
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LayerButton;
