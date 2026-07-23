FROM condaforge/miniforge3 AS build

RUN conda install -y -c conda-forge cmake compilers git ninja pdal=2.10.2 \
    && conda clean -afy

COPY untwine-1.5.1-carma.patch /tmp/untwine-1.5.1-carma.patch

RUN git clone https://github.com/hobuinc/untwine.git /src/untwine \
    && git -C /src/untwine checkout --detach 532bca41f5e10c83a5ac4b6ec729b04e6ffbd74d \
    && git -C /src/untwine apply /tmp/untwine-1.5.1-carma.patch \
    && cmake -S /src/untwine -B /src/untwine/build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/opt/untwine \
    && cmake --build /src/untwine/build \
    && cmake --install /src/untwine/build

FROM condaforge/miniforge3

RUN conda install -y -c conda-forge pdal=2.10.2 \
    && conda clean -afy

COPY --from=build /opt/untwine/bin/untwine /opt/conda/bin/untwine

ENV LD_LIBRARY_PATH=/opt/conda/lib

ENTRYPOINT ["untwine"]
