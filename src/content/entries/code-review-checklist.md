---
title: "Code Review Checklist"
summary: "A step-by-step checklist skill that teaches an agent to review pull requests like a senior engineer."
kind: "skill"
category: "coding"
author: "@praline"
updated: 2026-09-20
tags: ["review", "pull-requests", "quality"]
status: "approved"
install: "npx skills add catalog:code-review-checklist"
examples:
  - prompt: "Review my pull request that adds caching to the login handler."
    without: |
      Looks good overall.
      Maybe add a test or two.
      Ready to merge I think.
    with: |
      Blocking: cache key ignores user id, so users would share sessions.
      Nit: rename cachedUser to sessionCache and add an expiry test.
      Verdict: request changes until the key is fixed.
---

# Code Review Checklist

Teach an agent to review a pull request in a fixed order so nothing gets skipped.

## When to use

Invoke this skill whenever the user asks for a review of a diff, branch, or pull request.

## Steps

1. Restate what the change is trying to do in one sentence before judging it.
2. Check correctness first: trace inputs through the changed code and name any wrong behavior.
3. Check tests: is the new behavior covered, and do the tests fail without the fix?
4. Check scope: flag anything unrelated that should move to its own change.
5. Check readability last: naming, comments, and dead code the change leaves behind.
6. End with a clear verdict: approve, comment, or request changes.

## Example verdict

```text
Summary: adds a 5-minute cache around the login handler.
Blocking: cache key ignores user id, sessions leak across users.
Nit: rename cachedUser to sessionCache.
Verdict: request changes.
```

## Notes

Be specific and point at lines. Never approve a change with an open correctness question.
