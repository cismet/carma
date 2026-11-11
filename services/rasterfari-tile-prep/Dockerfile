# The build context is the workspace root, not this directory (that is what the
# nx container executor passes).
#
# The runtime (Ubuntu 18.04, GDAL 2.3.2, ImageMagick, Ghostscript, Poppler, Node 12
# and node_modules) is taken unchanged from the last hand-built image of
# github.com/cismet/rasterfari-tile-prep. Only the application source comes from carma.
# Read README.md before changing the base image: a different runtime renders
# documents differently.
FROM cismet/rasterfari-tile-prep-bplaene:1.1.1

COPY services/rasterfari-tile-prep/src/ /app/src/
# c2t.sh calls gdal2tiles_ll.py from the PATH, so keep that copy in sync with the source.
COPY services/rasterfari-tile-prep/src/gdal2tiles_ll.py /usr/bin/gdal2tiles_ll.py
RUN chmod 755 /app/src/lib/*.sh /usr/bin/gdal2tiles_ll.py
