---
title: "Concise Answers, Low Temperature"
summary: "A model preset for short deterministic answers: low temperature, tight length cap."
kind: "setting"
category: "models"
author: "@laras"
updated: 2026-09-06
tags: ["temperature", "preset", "concise"]
status: "approved"
target: "any chat model"
model: "low-temperature"
examples:
  - prompt: "Explain what a content collection is in one paragraph."
    without: |
      Content collections are a really powerful and flexible feature that...
      (four more wandering sentences follow, restating the docs)
    with: |
      A content collection is a typed folder of markdown validated by a schema.
      Use one when a page lists many similar documents.
---

# Concise Answers, Low Temperature

A preset for questions with one right answer: definitions, lookups, and checks.

## The preset

Temperature 0.2, max 150 tokens, no preamble. Answer the question directly in
its own terms, then stop. One paragraph for explanations, a list only when
the user asks for steps. Never hedge with it depends unless the question is
genuinely ambiguous, and never restate the question back. If the answer needs
a caveat, add exactly one sentence starting with Note.

## Usage note

Apply this preset to reference questions and grading, not brainstorming: at
this temperature the model stops exploring, which is the point for facts and
a flaw for ideas. Raise the cap to 300 tokens for code answers.
