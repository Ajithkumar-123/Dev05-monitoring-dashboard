# Conan-in-Docker test harness. `make test` is the canonical entrypoint;
# no local Conan / CMake / GoogleTest required — only Docker.

IMAGE   ?= docuploader/aspose-test:dev
CONTEXT := .

.PHONY: test
test:
	docker build -f Dockerfile.test -t $(IMAGE) $(CONTEXT)
	docker run --rm $(IMAGE)

# Drop into the test image for ad-hoc debugging (gdb, rerun a single test, etc.)
.PHONY: shell
shell:
	docker build -f Dockerfile.test -t $(IMAGE) $(CONTEXT)
	docker run --rm -it $(IMAGE) bash

# Force-rebuild without the layer cache (e.g. after a Conan recipe update).
.PHONY: test-clean
test-clean:
	docker build --no-cache -f Dockerfile.test -t $(IMAGE) $(CONTEXT)
	docker run --rm $(IMAGE)

.PHONY: clean
clean:
	docker image rm -f $(IMAGE) 2>/dev/null || true
