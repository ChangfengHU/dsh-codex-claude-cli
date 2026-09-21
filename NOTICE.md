# Provenance

This project is a derivative work. It began as a copy of
[`wss534857356/dsh-plugin-codex`](https://github.com/wss534857356/dsh-plugin-codex)
(npm `dsh-llm-codex-app-server`, MIT), taken at version 0.1.20, and continues
under the same licence with the original copyright notice retained in
`LICENSE`.

It is not a GitHub fork: the upstream git history was dropped and this
repository starts its own. The upstream project remains the place to send
anything that is not specific to the changes listed below.

## What this project changes

- **Harness MCP tools no longer take the provider down.** Codex App Server
  reserves the `mcp__` prefix for the MCP servers it mounts itself, and
  Harness names every MCP tool `mcp__<server>__<tool>`. Declaring one made
  App Server reject the entire `thread/start` with
  `dynamic tool name is reserved`, so a single MCP server configured in
  Harness killed every turn before the model saw anything. Those tools are
  now declared as `harness_mcp__<server>__<tool>` and mapped back on the
  callback.

## Planned

- Claude Code CLI as a second local-login provider alongside Codex.
