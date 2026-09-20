---
title: "Paper Summarizer"
summary: "Distills a research paper into question, method, result, and one honest limitation."
kind: "skill"
category: "research"
author: "@ndaru"
updated: 2026-09-09
tags: ["papers", "summaries", "reading"]
status: "approved"
install: "npx skills add catalog:paper-summarizer"
examples:
  - prompt: "Summarize this paper on retrieval-augmented generation for me."
    without: |
      This paper is about RAG and it is very interesting.
      The authors do experiments and get good results.
    with: |
      Question: does retrieved context beat longer context windows?
      Result: plus 12 points on QA, but only with fresh indexes.
      Limitation: evaluated on English Wikipedia only.
---

# Paper Summarizer

Teach an agent to summarize papers the way a careful labmate would.

## When to use

Invoke this skill when the user pastes a paper, abstract, or PDF excerpt.

## Steps

1. State the research question in one sentence before anything else.
2. Describe the method in two sentences: what they did and what they compared against.
3. Report the headline result with its number, not an adjective like impressive.
4. Name one honest limitation: dataset scope, baseline gap, or missing ablation.
5. Close with a one-line verdict on who should read the full paper.

## Example

```text
Question: does retrieved context beat longer context windows?
Method: RAG over Wikipedia vs 128k-context baseline on QA sets.
Result: plus 12 points, but only with fresh indexes.
Limitation: English Wikipedia only.
```

## Notes

Numbers beat adjectives. If the paper hides its evaluation setup, say so
instead of filling the gap with a guess.
