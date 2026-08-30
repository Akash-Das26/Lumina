---
name: Standalone Lumina
description: Requirements for running the Lumina product from its own folder.
---

## Rule
The portable Lumina bundle must include the frontend, API server, shared workspace libraries, generated contracts, database schema, lockfile, local environment example, and a launcher that proxies the web app to the API.

**Why:** The original artifact depends on parent-level workspace packages and Replit routing, so copying only the frontend does not produce a locally runnable project.

**How to apply:** Validate from inside Lumina with a frozen install, full typecheck/build, and a local web-to-API health probe. Keep real credentials out of the bundle and document PostgreSQL as a runtime prerequisite.