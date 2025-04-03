# ceepr Service Curl Examples

Below are some curl commands you can use to test the ceepr (Configuration Entry & Exchange Persistence Relay) service.

## Check if the service is running

```bash
curl http://localhost:3000
```

## Store a simple configuration

```bash
curl -X POST http://localhost:3000/store \
  -H "Content-Type: application/json" \
  -d '{"name": "Simple Config", "value": 42}'
```

## Store a map configuration

```bash
curl -X POST http://localhost:3000/store \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Map Configuration",
    "layers": [
      {
        "id": "base",
        "type": "tile",
        "url": "https://example.com/tiles/{z}/{x}/{y}.png",
        "visible": true
      },
      {
        "id": "overlay",
        "type": "wms",
        "url": "https://example.com/wms",
        "layers": "example:layer",
        "visible": false
      }
    ],
    "view": {
      "center": [7.6261, 51.9607],
      "zoom": 12
    }
  }'
```

## Retrieve a configuration

Replace `{randomKey}` with the key returned from a store operation:

```bash
curl http://localhost:3000/config/{randomKey}
```

## Try to retrieve a non-existent configuration

```bash
curl http://localhost:3000/config/nonexistentkey
```

## Try to store an invalid configuration (empty object)

```bash
curl -X POST http://localhost:3000/store \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Try to store an invalid configuration (not an object)

```bash
curl -X POST http://localhost:3000/store \
  -H "Content-Type: application/json" \
  -d '"this is not an object"'
```

## Store a real-world example with WMS configuration

```bash
curl -X POST http://localhost:3000/store \
  -H "Content-Type: application/json" \
  -d '{
    "name": "WMS Configuration",
    "service": "WMS",
    "version": "1.3.0",
    "layers": "example:layer",
    "format": "image/png",
    "transparent": true,
    "url": "https://example.com/wms",
    "bbox": [7.5, 51.9, 7.7, 52.0],
    "srs": "EPSG:4326"
  }'
```

## Store a configuration with styling information

```bash
curl -X POST http://localhost:3000/store \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Styled Map",
    "baseLayer": "OSM",
    "overlays": [
      {
        "id": "points",
        "type": "geojson",
        "data": {
          "type": "FeatureCollection",
          "features": [
            {
              "type": "Feature",
              "geometry": {
                "type": "Point",
                "coordinates": [7.6261, 51.9607]
              },
              "properties": {
                "name": "Location A"
              }
            }
          ]
        },
        "style": {
          "radius": 8,
          "fillColor": "#ff7800",
          "color": "#000",
          "weight": 1,
          "opacity": 1,
          "fillOpacity": 0.8
        }
      }
    ],
    "view": {
      "center": [7.6261, 51.9607],
      "zoom": 13
    }
  }'
```
