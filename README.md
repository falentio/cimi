# Cimi - Web Analytics

Cimi is a self-hosted web analytics product built around embedded SQLite and DuckDB in a single-node deployment.

## Status

The resource specifications and typed contract declarations define the planned first-release behavior. They remain `draft` until their runtime handlers and persistence boundaries are implemented. The API currently serves authentication routes, `GET /api/system/health`, the illustrative `hello` routes, and the `installation`, `organization`, `membership`, `invitation`, `site`, `retention-policy`, `collection-policy`, and `event-ingestion` resource procedures; remaining first-release product procedures stay planned.

## Documentation

- [Resource specifications](docs/specs/README.md)
- [First-release capabilities](docs/CAPABILITIES.md)
