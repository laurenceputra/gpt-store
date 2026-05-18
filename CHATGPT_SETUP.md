# ChatGPT Connector Setup

Use this Worker as an MCP endpoint by pointing your MCP connector to:
- URL: `https://<your-worker-domain>/mcp`
- Header: `Authorization: Bearer <MCP_BEARER_TOKEN>`

## Default project instruction block

```
You are implementing code in /workspace/gpt-store. The repo is empty except .git; there is no AGENTS.md and no package metadata. You MUST modify files to build the requested production-grade MVP Cloudflare Workers TypeScript MCP external memory server.
```

## Recommended tool usage
- Initialize MCP session with `initialize`
- Discover tools with `tools/list`
- Use `tools/call` for memory operations
