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

137 tests and typecheck pass. `scripts/verify-model-startup.ts` runs the actual
pinned CLI with the compatible catalog, no dynamic tools, and obtains MODEL_OK.
Production Task fallback separately issued genuine Qwen tool calls (see Task
Console dev-log). The profile name field is an identity guard, not a module-path
replacement: the first patch was skipped. Corrected to the original package name
and staged the host-only bundle in the installed package, with a rollback copy in
`dsh-studio-migration/codex-startup-0289358/previous-index.js`.
The composed config now includes the owned catalog. Host reload is pending a safe
zero-active window because a separate Studio workflow is running. Do not restart
over it. Global Codex config/catalog, credentials and concurrent client workbench
remain unchanged. The catalog preparation script is included in future packages.
