---
name: Lumina local workspace
description: Requirements for running the Lumina product locally from the canonical workspace.
---

## Rule
The root workspace is the canonical local Lumina project after the separate Lumina/ copy was removed. It must retain the frontend, API server, shared workspace libraries, generated contracts, database schema, lockfile, local environment example, and a launcher that proxies the web app to the API.

**Why:** The product originally depended on parent-level workspace packages and Replit routing; local use now needs those same pieces plus an explicit root-level launcher and proxy.

**How to apply:** Validate from the project root with a frozen install, full typecheck/build, and a local web-to-API health probe. Keep real credentials out of source control and document PostgreSQL as a runtime prerequisite.