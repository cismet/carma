# Oblique object views

`obliqueObjectViews` extends `obliqueViewer` with the
**Objektansichtenabfrage** mode. It requires the viewer's state channel and
registers an optional `ObliqueViewerExtension` through its own addon channel.
It replaces the query hook and overlay formerly mounted directly inside
`ObliqueViewer`; the regular viewer no longer imports that runtime.

Geoportal declares this addon on `/oblique` and with its default addons, gated by
`featureFlagObliqueNextUi` (`obliqueng`). Resolution also requires a declared viewer.
The component and viewer wrapper enforce the same UI gate when mounted manually.
The Cesium-style default interface offers no object-view mode.

The feature package lazy-loads sphere picking, coverage search and the contact
sheet when the mode opens. The host viewer supplies its current selection data,
surface picker and camera callbacks; the extension owns its query state and
resources. Closing the mode or removing the addon unmounts those resources.
Camera flights and the shared mesh remain owned by the parent viewer.
