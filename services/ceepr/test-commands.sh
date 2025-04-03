#!/bin/bash

# Set the base URL for the service
BASE_URL="http://localhost:3000"

# Test 1: Check if the service is running
echo "\n=== Testing if the service is running ==="
curl -s "$BASE_URL"

# Test 2: Store a simple configuration
echo "\n\n=== Storing a simple configuration ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/store" \
  -H "Content-Type: application/json" \
  -d '{"name": "Simple Config", "value": 42}')

# Extract the key from the response
KEY=$(echo $RESPONSE | grep -o '"key":"[^"]*"' | cut -d '"' -f 4)
echo "Response: $RESPONSE"
echo "Extracted key: $KEY"

# Test 3: Retrieve the stored configuration
if [ ! -z "$KEY" ]; then
  echo "\n=== Retrieving the stored configuration ==="
  curl -s "$BASE_URL/config/$KEY"
fi

# Test 4: Store a more complex configuration
echo "\n\n=== Storing a complex configuration ==="
RESPONSE2=$(curl -s -X POST "$BASE_URL/store" \
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
  }')

# Extract the key from the response
KEY2=$(echo $RESPONSE2 | grep -o '"key":"[^"]*"' | cut -d '"' -f 4)
echo "Response: $RESPONSE2"
echo "Extracted key: $KEY2"

# Test 5: Retrieve the complex configuration
if [ ! -z "$KEY2" ]; then
  echo "\n=== Retrieving the complex configuration ==="
  curl -s "$BASE_URL/config/$KEY2"
fi

# Test 6: Try to retrieve a non-existent configuration
echo "\n\n=== Trying to retrieve a non-existent configuration ==="
curl -s "$BASE_URL/config/nonexistentkey"

# Test 7: Try to store an invalid configuration (empty object)
echo "\n\n=== Trying to store an invalid configuration (empty object) ==="
curl -s -X POST "$BASE_URL/store" \
  -H "Content-Type: application/json" \
  -d '{}'

# Test 8: Try to store an invalid configuration (not an object)
echo "\n\n=== Trying to store an invalid configuration (not an object) ==="
curl -s -X POST "$BASE_URL/store" \
  -H "Content-Type: application/json" \
  -d '"this is not an object"'

echo "\n"
