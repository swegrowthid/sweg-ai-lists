---
title: "Commit Message Writer"
summary: "Turns a messy diff into a short conventional commit message with a clear subject line."
kind: "skill"
category: "writing"
author: "@kertas"
updated: 2026-09-15
tags: ["git", "commits", "conventions"]
status: "approved"
install: "npx skills add catalog:commit-message-writer"
examples:
  - prompt: "Write a commit message for my diff that fixes the retry timeout."
    without: |
      fix stuff
      updated some files related to the bug
    with: |
      fix(net): cap retry timeout at 30s with jitter
      Retries piled up under packet loss and blocked the queue.
---

# Commit Message Writer

Teach an agent to write commit messages a future reader can actually use.

## When to use

Invoke this skill when the user has staged changes and wants a message for them.

## Steps

1. Read the diff and summarize the behavior change in one plain sentence.
2. Pick the conventional prefix that fits: feat, fix, docs, refactor, test, or chore.
3. Write a subject line under 72 characters: prefix, scope in parentheses, then the change.
4. Add one or two body lines explaining why the change was needed, not what files moved.
5. If there are multiple unrelated changes, say so and draft one message per change.

## Example

```text
fix(net): cap retry timeout at 30s with jitter

Retries piled up under packet loss and blocked the queue.
```

## Notes

Use the imperative mood in the subject. Never write messages like fix stuff
or updates, and never invent scope names that match no directory.
