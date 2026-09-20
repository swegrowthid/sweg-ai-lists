---
title: "System Prompt Starter"
summary: "A starter template that turns a vague role idea into a tight, testable system prompt."
kind: "skill"
category: "prompts"
author: "@yoga"
updated: 2026-08-29
tags: ["prompts", "template", "starter"]
status: "approved"
install: "npx skills add catalog:system-prompt-starter"
examples:
  - prompt: "I need a system prompt for a SQL helper bot."
    without: |
      You are a helpful SQL assistant.
      Answer questions about databases.
    with: |
      You are a SQL helper for analysts using Postgres 16.
      Always show the query first, then one line on what it returns.
      Refuse destructive statements unless the user confirms twice.
---

# System Prompt Starter

Teach an agent to turn a vague role idea into a system prompt that holds up.

## When to use

Invoke this skill when the user describes a bot they want in one loose sentence.

## Steps

1. Ask who the bot serves and what decision its answers support.
2. Fix the scope: name the tool versions it knows and what it must refuse.
3. Draft the prompt in three parts: role, rules, and output shape.
4. Add one test question the user can ask to check the prompt works.
5. Keep the whole prompt under 150 words so it stays editable.

## Example

```text
You are a SQL helper for analysts using Postgres 16.
Rules: show the query first, refuse destructive statements.
Shape: query, then one line on what it returns.
```

## Notes

A prompt nobody can test is a wish. Ship the test question with the prompt,
and cut any sentence that changes no behavior.
