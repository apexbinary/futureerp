# build — the packaging & masking pipeline

Turns the monorepo into deployable, **signed** artifacts. Runs in OUR cloud CI only.

Planned stages (added with your go-ahead — nothing implemented yet):
1. select licensed module(s) for a tenant
2. Cython-compile business logic  (.py -> .so)   ← masking
3. PyArmor obfuscate + license-bind
4. strip original .py sources
5. build the module's React frontend bundle
6. compute integrity hashes -> signed manifest
7. build Docker image (cloud OR self-hosted variant)
8. sign the image (cosign)

`templates/` holds the Dockerfile templates (cloud vs self-hosted).
