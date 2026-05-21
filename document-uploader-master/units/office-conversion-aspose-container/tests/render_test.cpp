#include <gtest/gtest.h>

#include "render.h"

using namespace docuploader::aspose;

TEST(RenderTest, ProbeRejectsEmptyPath) {
  EXPECT_THROW(probe(""), DocumentProcessingError);
}

TEST(RenderTest, RenderRejectsInvalidPageRange) {
  EXPECT_THROW(render(RenderRequest{"/tmp/x", 0, 10}), DocumentProcessingError);
  EXPECT_THROW(render(RenderRequest{"/tmp/x", 5, 4}), DocumentProcessingError);
}
