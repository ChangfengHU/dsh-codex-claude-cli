# Pinned Codex startup compatibility

The failed Fleet Task used `codex-local/gpt-5.6-terra`, not its parent chat's Qwen.
The installed CLI is 0.147.0. A newer global model catalog omitted the required
`supports_parallel_tool_calls` field on nine models. An initialize-only subprocess
reproduction exited before handshake. No Agent turn or target operation was sent.

Added optional deployment-owned `modelCatalogPath`, a conservative catalog
preparation script (missing parallel support becomes false), and sanitized
PROTOCOL_VERSION classification after startup EOF. Global Codex configuration is
not changed. A compatible 12-model catalog completed initialize with exit 0.

Verification: runner/plugin tests passed; TypeScript passed after exact-optional
property correction. Runtime model response and Fleet Task acceptance are separate
pending checks; successful handshake is not successful machine onboarding.
Unrelated client workbench edits are excluded from this commit/deployment.
