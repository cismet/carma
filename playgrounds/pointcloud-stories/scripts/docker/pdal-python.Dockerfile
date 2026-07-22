FROM condaforge/miniforge3

RUN conda install -y -c conda-forge \
      numpy \
      numba \
      laspy \
      lazrs-python \
      pdal \
      pillow \
      pyproj \
      python-pdal \
    && conda clean -afy

ENV PROJ_DATA=/opt/conda/share/proj \
    PROJ_LIB=/opt/conda/share/proj

ENTRYPOINT ["python3"]
