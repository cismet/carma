import {
  GeoJsonDataSource as ResiumGeoJsonDataSource,
  useCesium,
} from 'resium';
import { useState, useEffect, useRef } from 'react';
import {
  Entity,
  Cesium3DTileFeature,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  GeoJsonDataSource as CesiumGeoJsonDataSource,
  GroundPrimitive,
  Cartesian3,
  Cartesian2,
} from 'cesium';
import ColorHash from 'color-hash';
import CompareCartesian3Table from './CompareCartesian3Table';
import { useClickAction, usePropertyKeysFromGeoJsonDataSource } from '../hooks';
import { useSelectionTransparency } from '../store';

interface GeoJsonSelectorProps {
  srcExtruded: string;
  srcClamped?: string;
  debug?: boolean;
  renderPoint?: boolean;
  idProperty?: string;
  single?: boolean;
}

type SelectionRef = {
  position: Cartesian2;
  pickPos: Cartesian3;
  feature: Cesium3DTileFeature | GroundPrimitive;
};

const DEFAULT_CLAMPED_FOOTPRINT_ALPHA = 0.5;
//const DEFAULT_TILESET_ALPHA = 0.7;
const HIGHLIGHT_COLOR = Color.YELLOW;
const HIGHLIGHT_COLOR_ALPHA = 0.7;

const DEFAULT_EXTRUDED_MATERIAL = new ColorMaterialProperty(
  Color.WHITE.withAlpha(1 / 256) // needs to result in non-zero texture value to be available for selection!
);

const colorHash = new ColorHash({
  saturation: [0.8],
  lightness: [0.25, 0.75],
});
const colorLookup: Record<string, Color> = {};

const GeoJsonSelector: React.FC<GeoJsonSelectorProps> = ({
  srcExtruded,
  srcClamped,
  debug = false,
  idProperty = 'UUID',
  single = false,
}) => {
  const { viewer } = useCesium();
  const selectionRef = useRef<SelectionRef | null>(null);

  srcClamped = srcClamped || srcExtruded;

  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const clampedFootprintAlpha = useSelectionTransparency();

  //const [tilesetAlpha, setTilesetAlpha] = useState(DEFAULT_TILESET_ALPHA);
  //const [clipPolygons, setClipPolygons] = useState(null);

  const [extrudedFootprints, setExtrudedFootprints] =
    useState<CesiumGeoJsonDataSource | null>(null);
  const [clampedFootprints, setClampedFootprints] =
    useState<CesiumGeoJsonDataSource | null>(null);
  const [selectedProperty, setSelectedProperty] = useState('GEB_FKT');

  const handleOnLoadExtrudedFootprints = (
    dataSource: CesiumGeoJsonDataSource
  ) => {
    dataSource.entities && setExtrudedFootprints(dataSource);
    // slection volumes should not be visible unless for debugging
    dataSource.entities.values.forEach((entity) => {
      if (entity.polygon !== undefined) {
        entity.polygon.extrudedHeight = new ConstantProperty(182);
        entity.polygon.height = new ConstantProperty(150);
        // dont render edges
        entity.polygon.outline = new ConstantProperty(debug ? true : false);
        // should be visible only for debugging
        entity.polygon.material = DEFAULT_EXTRUDED_MATERIAL;
      }
    });
  };

  const handleOnLoadClampedFootprints = (
    dataSource: CesiumGeoJsonDataSource
  ) => {
    dataSource && setClampedFootprints(dataSource);
    dataSource.entities.values.forEach((entity) => {
      if (entity.polygon !== undefined) {
        entity.show = false;
        entity.polygon.material = getColorMaterialProperty(
          entity,
          clampedFootprintAlpha
        );
      }
    });
  };

  const getColorMaterialProperty = (
    entity: Entity,
    alpha: number
  ): ColorMaterialProperty => {
    const str = entity.properties
      ? entity.properties[selectedProperty].toString()
      : 'default';
    const colorHexKey = colorHash.hex(str).substring(1); // remove # from the beginning

    // If the Color doesn't exist yet, create it
    if (!colorLookup[colorHexKey]) {
      const [r, g, b] = colorHash.rgb(str);
      colorLookup[colorHexKey] = new Color(r / 255, g / 255, b / 255, alpha);
      return new ColorMaterialProperty(colorLookup[colorHexKey]);
    }

    // Update the transparency of the color only
    colorLookup[colorHexKey].alpha = alpha;
    return new ColorMaterialProperty(colorLookup[colorHexKey]);
  };

  const clickData = useClickAction(viewer, idProperty, setSelectedEntity);
  const propertyKeys = usePropertyKeysFromGeoJsonDataSource(clampedFootprints);

  useEffect(() => {
    if (clampedFootprints) {
      clampedFootprints.entities.values.forEach((entity) => {
        if (entity.polygon !== undefined) {
          entity.polygon.material = getColorMaterialProperty(
            entity,
            clampedFootprintAlpha
          );
          //entity.polygon.classificationType = new ConstantProperty(ClassificationType.CESIUM_3D_TILE);
          //entity.shadows = ShadowMode.ENABLED;
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedFootprintAlpha, selectedProperty]);

  useEffect(() => {
    if (clampedFootprints) {
      if (selectedEntity === null) {
        clampedFootprints.entities.values.forEach((entity) => {
          if (entity.polygon !== undefined) {
            entity.show = false;
            //entity.polygon.material = getColorMaterialProperty( entity, clampedFootprintAlpha );
          }
        });
      } else
        clampedFootprints.entities.values.forEach((entity) => {
          // Get the property you want to base the color on
          // Determine the color based on the property
          // Update the material with the new transparency
          if (entity.polygon !== undefined) {
            if (
              entity?.properties &&
              entity.properties[idProperty].getValue() === selectedEntity
            ) {
              console.log('entity', entity.id);
              entity.show = true;
              entity.polygon.material = new ColorMaterialProperty(
                HIGHLIGHT_COLOR.withAlpha(HIGHLIGHT_COLOR_ALPHA)
              );
              entity.polygon.outline = new ConstantProperty(true);
              entity.polygon.outlineColor = new ColorMaterialProperty(
                Color.RED
              );
              entity.polygon.outlineWidth = new ConstantProperty(20.0);
            } else {
              if (single) {
                entity.show = false;
              } else {
                entity.polygon.material = getColorMaterialProperty(
                  entity,
                  clampedFootprintAlpha
                );
              }
            }
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntity]);

  return (
    <>
      <ResiumGeoJsonDataSource
        name="footprint_extruded"
        data={srcExtruded}
        onLoad={handleOnLoadExtrudedFootprints}
        //onClick={(entity) => setSelectedEntity(entity)}
      />
      <ResiumGeoJsonDataSource
        name="footprint_clamped"
        data={srcClamped}
        clampToGround={true}
        onLoad={handleOnLoadClampedFootprints}
      />
      {!single && (
        <div
          className="leaflet-bar leaflet-control leaflet-control-layers-expanded"
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 1000,
          }}
        >
          {propertyKeys && (
            <select
              title="Select a property to color the buildings by:"
              value={selectedProperty}
              onChange={(event) => setSelectedProperty(event.target.value)}
            >
              {Array.from(propertyKeys).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {debug && (
        <div
          className="leaflet-bar leaflet-control leaflet-control-layers-expanded"
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            zIndex: 1000,
          }}
        >
          <CompareCartesian3Table
            title="Click Position"
            posA={selectionRef.current?.pickPos}
            posAName="click"
          />
        </div>
      )}
    </>
  );
};

export default GeoJsonSelector;
