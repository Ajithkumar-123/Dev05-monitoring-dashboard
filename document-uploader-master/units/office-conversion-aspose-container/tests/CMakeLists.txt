find_package(GTest REQUIRED)

add_executable(render_test render_test.cpp ../src/render.cpp)
target_include_directories(render_test PRIVATE ../include)
target_link_libraries(render_test PRIVATE GTest::gtest_main)
add_test(NAME render_test COMMAND render_test)
