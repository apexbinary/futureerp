# infra — deployment & operations

| Dir             | Purpose                                             |
|-----------------|-----------------------------------------------------|
| `docker/`       | Base images, compose files for local dev.           |
| `kubernetes/`   | Manifests: control-plane, node-runtime, shared.     |
| `terraform/`    | Cloud infrastructure as code.                        |
| `ci-cd/`        | Pipelines (build → test → sign → publish).           |
| `registry/`     | Private artifact/image registry config.              |
| `observability/`| Prometheus, Grafana, logging stack.                  |
