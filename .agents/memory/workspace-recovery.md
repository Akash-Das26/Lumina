---
name: Workspace recovery
description: Recovery pattern when root workspace metadata is moved into an untracked folder.
---

## Rule
If artifact workflows still run but root package metadata is marked deleted, check for a duplicate metadata-only folder before changing app code. Restore the root workspace files and validate the lockfile with a frozen install.

**Why:** Artifact workflows can continue serving from installed dependencies even when the root workspace is no longer installable from a clean checkout.

**How to apply:** Treat an untracked metadata directory as potentially user-owned; do not delete it automatically. Verify root config, lockfile compatibility, full typecheck, and full build separately.