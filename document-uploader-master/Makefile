# docuploader top-level operator entrypoints.
# All targets are local-only by default; explicit -push targets opt-in to AWS/GitHub.

.PHONY: help test test-lib test-go test-py test-ts helm-template kustomize \
        build build-all dev05-plan dev05-dry-run dev05-deploy \
        localstack-up localstack-down localstack-bootstrap localstack-test localstack-reset \
        clean

help:
	@echo "docuploader Makefile targets"
	@echo "  test            run LIB-04 (76 tests) + per-unit Go/TS/Py handler tests"
	@echo "  test-lib        run only the libs/data-access tests (Go + Py + TS)"
	@echo "  helm-template   helm template every unit chart with placeholder values"
	@echo "  kustomize       kubectl kustomize the deploy/argocd-dev05 bundle"
	@echo ""
	@echo "  build UNIT=<n>  build one unit's image locally (no push)"
	@echo "  build-all       build every unit's image locally (no push)"
	@echo ""
	@echo "  dev05-dry-run   preview every dev05 deploy action without running"
	@echo "  dev05-plan      terraform plan against dev05 (read-only)"
	@echo "  dev05-deploy    interactive phased deploy (A/B/C/E, prompts each)"
	@echo ""
	@echo "  localstack-up         start LocalStack (Docker) at :4566"
	@echo "  localstack-bootstrap  create 7 DDB tables + 4 S3 buckets + KMS + secrets in LocalStack"
	@echo "  localstack-test       run the test rig against LocalStack (6 scenarios)"
	@echo "  localstack-reset      drop + recreate all LocalStack resources"
	@echo "  localstack-down       tear down LocalStack (deletes all state)"
	@echo ""
	@echo "  clean           remove helm chart deps and build logs"

# ---------- tests ----------
test: test-lib test-go test-ts test-py

test-lib:
	cd libs/data-access/go && go test ./...
	cd libs/data-access/py && uv run pytest -q
	pnpm -C libs/data-access/ts test

test-go:
	@for d in units/*/go.mod; do \
	  u=$$(basename $$(dirname $$d)); \
	  echo "--- go test $$u ---"; \
	  (cd units/$$u && go test ./...) || exit 1; \
	done

test-ts:
	pnpm -r --filter "./units/*" test

test-py:
	@for d in units/pdf-processing-service units/office-conversion-orchestrator-sidecar; do \
	  echo "--- pytest $$d ---"; \
	  (cd $$d && uv run pytest -q) || exit 1; \
	done

# ---------- chart-layer checks ----------
helm-template:
	@for d in units/*/helm; do \
	  unit=$$(basename $$(dirname $$d)); \
	  [ "$$unit" = "platform-network-and-compute" ] && continue; \
	  [ ! -f $$d/Chart.yaml ] && continue; \
	  helm dependency build $$d >/dev/null; \
	  helm template $$unit $$d \
	    --set iamRoleArn=arn:aws:iam::000000000000:role/test \
	    --set image.repository=test/repo \
	    --skip-tests >/dev/null && echo "OK   $$unit" || echo "FAIL $$unit"; \
	done

kustomize:
	kubectl kustomize deploy/argocd-dev05

# ---------- image builds ----------
build:
	@[ -n "$(UNIT)" ] || (echo "usage: make build UNIT=<unit-name>"; exit 2)
	./scripts/build-image.sh $(UNIT)

build-all:
	./scripts/build-all-images.sh

# ---------- dev05 deploy ----------
dev05-dry-run:
	./scripts/deploy-dev05.sh --all --dry-run

dev05-plan:
	@for unit in platform-data platform-iam-and-security platform-network-and-compute platform-orchestration; do \
	  echo "--- terraform plan: $$unit ---"; \
	  AWS_PROFILE=$${AWS_PROFILE:-opus2-dev} terraform -chdir=units/$$unit/terraform init -input=false; \
	  AWS_PROFILE=$${AWS_PROFILE:-opus2-dev} terraform -chdir=units/$$unit/terraform plan -input=false -var environment=dev05; \
	done

dev05-deploy:
	./scripts/deploy-dev05.sh --all

# ---------- Tier-2 LocalStack harness ----------
# Local AWS mock for integration testing LIB-04 (and consumer units).
# Zero real AWS dependency. See harness/README.md.
localstack-up:
	docker compose -f harness/localstack/docker-compose.yml up -d
	@echo "Waiting for LocalStack to become healthy..."
	@until curl -fsS http://localhost:4566/_localstack/health >/dev/null 2>&1; do sleep 1; done
	@echo "LocalStack ready at http://localhost:4566"

localstack-bootstrap:
	bash harness/localstack/seed.sh

localstack-test:
	cd harness/local-test-rig && go run .

localstack-reset:
	bash harness/localstack/seed.sh --reset

localstack-down:
	docker compose -f harness/localstack/docker-compose.yml down -v

# ---------- housekeeping ----------
clean:
	find units -path '*/helm/charts' -type d -exec rm -rf {} +
	find units -name Chart.lock -delete
	rm -rf logs/
