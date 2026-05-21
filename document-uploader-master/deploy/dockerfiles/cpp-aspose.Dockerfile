# C++ Aspose.Total HTTP service. Conan + CMake build, debian-slim runtime.
# License binary is NEVER baked in — it's mounted at runtime from k8s Secret
# `aspose-total-license` at /etc/aspose/Aspose.Total.Product.Family.lic.
ARG UNIT_NAME=office-conversion-aspose-container

FROM debian:bookworm-slim AS build
ARG UNIT_NAME
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake ninja-build python3 python3-pip git ca-certificates \
    && pip3 install --break-system-packages conan==2.* \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY units/${UNIT_NAME} ./

RUN conan profile detect --force \
 && conan install . --output-folder=build --build=missing -s build_type=Release \
 && cmake -S . -B build/build -G Ninja \
      --preset conan-release \
      -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build/build --target aspose-server -j

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      libstdc++6 libgomp1 ca-certificates fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -u 65532 -r -s /sbin/nologin app
COPY --from=build /src/build/build/aspose-server /usr/local/bin/aspose-server
USER app
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/aspose-server"]
