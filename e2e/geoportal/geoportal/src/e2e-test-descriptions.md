# Geoportal E2E Test Descriptions

## Smoke
Description: Checks that the main map view loads with all key controls, buttons and the modal menu can be opened and closed.

## Add map layers
Description: Mocks WMS capabilities, opens the layer library, searches for a specific layer and applies it so that it appears as an active map layer button.

## Fullscreen
Description: Verifies that the fullscreen control toggles the browser fullscreen mode on and off.

## Fuzzy search
Description: Ensures the fuzzy search input opens a result dropdown, shows expected address suggestions and closes when a result is selected.

## Helper overlay
Description: Opens the helper overlay, verifies background visibility and iterates primary items to open and close their secondary popovers.

## Home
Description: The test checks that URL query params like lat and lng change after the home control button is pressed.

## Oblique UI
Description: Opens the oblique aerial imagery mode and verifies that all key viewer UI controls (rotation, pan arrows, and action buttons like "Flug zum Bild", "Bild öffnen", "Herunterladen" and "Rückmeldung") are visible and usable.

## Layer group toggle
Description: Tests that the layer group button toggles visibility of the transparency slider (layer options) on and off.

## Measurements
Description: Draws a line and a polygon, checks measurement info (length/area), navigation between measurements, visibility counters, zoom-to and delete flows.

## Refresh
Description: Ensures the reload button refreshes the page and measurement mode is turned off (no empty measurement info is shown) after reload.

## Share
Description: Verifies the share dialog copies a link to the clipboard that contains lat/lng and either data or config parameters.

## Weaken map
Description: Checks that the weaken background button shows the map background container and sets its background color to white.

## Zoom
Description: Confirms the zoom-in and zoom-out controls update the zoom level in the URL hash, increasing then returning to the initial level.
