---
name: No Codebuff footer in commits
description: Never append "Generated with Codebuff" or any agent footer to commit messages.
---

## Rule
All git commits in this repository must use plain, descriptive commit messages with no trailing footer, attribution block, or "Co-Authored-By" line. Do not add "Generated with Codebuff" or similar agent-generated footers.

**Why:** The user explicitly requested clean commit history without tool-generated attribution (2026-10-02).

**How to apply:** When committing, omit any footer lines regardless of default tooling templates. Keep messages concise and focused on the intent of the change.
