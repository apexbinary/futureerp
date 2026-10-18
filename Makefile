# FUTURE_ERP — one entrypoint for common tasks across both stacks.
.DEFAULT_GOAL := help
.PHONY: help install install-py install-js lint format test typecheck clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: install-py install-js ## Install everything

install-py: ## Install Python workspace (uv)
	uv sync

install-js: ## Install JS workspace (pnpm)
	pnpm install

lint: ## Lint both stacks
	uv run ruff check .
	pnpm lint

format: ## Auto-format both stacks
	uv run ruff format .
	pnpm format

typecheck: ## Type-check both stacks
	uv run mypy .
	pnpm typecheck

test: ## Run all tests
	uv run pytest
	pnpm test

clean: ## Remove caches & build output
	rm -rf .ruff_cache .mypy_cache .pytest_cache .turbo
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
