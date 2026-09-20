---
title: "MCP Server Setup"
summary: "Scaffolds a minimal MCP server step by step: tools, schemas, and a first smoke test."
kind: "skill"
category: "mcp"
author: "@ompong"
updated: 2026-09-03
tags: ["mcp", "tools", "scaffold"]
status: "approved"
install: "npx skills add catalog:mcp-server-setup"
examples:
  - prompt: "Help me expose my notes search as an MCP tool."
    without: |
      You should create a server file and add your tool.
      Then connect it to your client somehow.
    with: |
      Created server.ts with one tool, search_notes, with a typed query schema.
      Smoke-tested it with the inspector: 3 results in 40ms.
      Next: add pagination before wiring it into the client.
---

# MCP Server Setup

Teach an agent to scaffold a minimal MCP server without over-engineering it.

## When to use

Invoke this skill when the user wants to expose a local capability as an MCP tool.

## Steps

1. Name the single tool first and write its input schema before any server code.
2. Scaffold the smallest server that registers exactly that tool and nothing else.
3. Keep secrets out of the tool schema: pass paths and keys via server config.
4. Smoke-test with the inspector: call the tool once and read the raw output.
5. Report latency and one known limit, then stop before adding extra tools.

## Example scaffold

```text
server.ts registers search_notes(query: string, limit?: number)
inspector call: search_notes("astro collections") -> 3 results, 40ms
known limit: no pagination yet, caps at 50 hits.
```

## Notes

One tool working beats five tools stubbed. Add pagination and error shapes
before a second tool, not after the fifth.
