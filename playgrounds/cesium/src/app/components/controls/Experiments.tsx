import { faRocket, faVial, faVials } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  GeoJsonDataSource,
  JulianDate,
  Cesium3DTileset,
  Cartesian3,
} from 'cesium';
import { useCesium, CesiumComponentRef } from 'resium';
import { unlockPosition } from '../../lib/position';

type ExperimentsProps = {
  tilesetRef: CesiumComponentRef<Cesium3DTileset> | null;
};

const Experiments = (props: ExperimentsProps) => {
  const { viewer } = useCesium();
  const { tilesetRef } = props;
  return (
    <>
      <div className="leaflet-bar leaflet-control">
        <button
          className="leaflet-bar-part"
          title="Experimentalfunktion 1"
          onClick={() => {
            const holeResourcePromise = GeoJsonDataSource.load(
              '/data/neubau.json',
              {
                clampToGround: true,
              }
            );

            holeResourcePromise.then(function (dataSource) {
              // Get the array of entities from the data source
              const entities = dataSource.entities.values;
              // Loop through the entities and find the one with a polygon geometry
              const time = JulianDate.now();
              for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                if (entity.polygon?.hierarchy) {
                  // This is a polygon entity, get the geometry
                  const polygonGeometry = entity.polygon.hierarchy.getValue(
                    time,
                    undefined
                  );
                  // Get the root tile of the tileset
                  console.log('xxx tilesetRef', tilesetRef);
                  console.log(
                    'xxx tileset',
                    tilesetRef?.cesiumElement,
                    polygonGeometry
                  );

                  // Add the hole to the root tile using the addHoles function
                  // root.addHoles([polygonGeometry]);
                }
              }
            });
          }}
        >
          <FontAwesomeIcon icon={faVial}></FontAwesomeIcon>
        </button>
      </div>
      <div className="leaflet-bar leaflet-control">
        <button
          className="leaflet-bar-part"
          title="Experimentalfunktion 2"
          onClick={() => {
            unlockPosition(viewer);
          }}
        >
          <FontAwesomeIcon icon={faVials}></FontAwesomeIcon>
        </button>
      </div>
      <div className="leaflet-bar leaflet-control">
        <button
          className="leaflet-bar-part"
          title="Experimentalfunktion 3"
          onClick={() => {
            if (viewer) {
              viewer.scene.camera.constrainedAxis = Cartesian3.UNIT_Z;
            }
          }}
        >
          <FontAwesomeIcon icon={faRocket}></FontAwesomeIcon>
        </button>
      </div>
    </>
  );
};

export default Experiments;
