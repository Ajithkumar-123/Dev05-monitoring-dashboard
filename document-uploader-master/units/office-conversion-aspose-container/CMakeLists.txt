cmake_minimum_required(VERSION 3.25)
project(aspose_render LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Conan toolchain provides Boost, cpp-httplib, nlohmann_json.
find_package(Boost REQUIRED)
find_package(httplib REQUIRED)
find_package(nlohmann_json REQUIRED)

# Aspose.Total for C++ is licensed and vendored via a mounted .so (operator
# supplies the .lic file at /opt/aspose/license/Aspose.Total.Cpp.lic). The
# vendored .so search path is wired by the container image base, not CMake.
add_executable(aspose_render
  src/main.cpp
  src/render.cpp
)

target_include_directories(aspose_render PRIVATE include)
target_link_libraries(aspose_render PRIVATE
  Boost::headers
  httplib::httplib
  nlohmann_json::nlohmann_json
)

enable_testing()
add_subdirectory(tests)
