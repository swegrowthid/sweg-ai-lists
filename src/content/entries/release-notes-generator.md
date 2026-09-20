---
title: "Release Notes Generator"
summary: "Turns a pile of merged pull requests into grouped, human-readable release notes."
kind: "skill"
category: "ops"
author: "@bagas"
updated: 2026-08-30
tags: ["releases", "changelog", "notes"]
status: "approved"
install: "npx skills add catalog:release-notes-generator"
examples:
  - prompt: "Draft release notes for v2.4 from these 14 merged PRs."
    without: |
      Various fixes and improvements in this release.
      Thanks to everyone who contributed.
    with: |
      Highlights: faster search (2x) and dark mode.
      Breaking: drops Node 16, needs Node 18 or newer.
      Full list grouped below under Features, Fixes, and Docs.
---

# Release Notes Generator

Teach an agent to turn merged pull requests into notes people actually read.

## When to use

Invoke this skill when the user has a version tag and a list of merged changes.

## Steps

1. Collect the merged pull requests since the last tag and drop pure chores.
2. Sort the rest into three groups: features, fixes, and docs or internal.
3. Write a two-line highlight section naming the changes users will feel.
4. Call out breaking changes first with the minimum upgrade path.
5. Credit contributors by handle at the end, one line, no embellishment.

## Example

```text
## v2.4 highlights
Faster search (2x) and dark mode.
Breaking: drops Node 16, needs Node 18+.
```

## Notes

Write for the updater, not the author: lead with what changed for the user,
and link each bullet to its pull request number.
