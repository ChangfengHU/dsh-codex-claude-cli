import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { isAbsolute } from 'node:path'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'

export const CLAUDE_SETTINGS_NAMESPACE = settingsNamespace('claude-code-runtime')
export interface ClaudeRuntimeSettings {
  executable: string
  cwd: string
  permissionMode: PermissionMode
  timeoutMs: number
  modelCacheMs: number
  maxRetries: number
}
export const ClaudeRuntimeSettingsSchema: z<ClaudeRuntimeSettings> = z.object({
  executable: z.string().required(),
  cwd: z.string().required(),
  permissionMode: z.union(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']).required(),
  timeoutMs: z.number().step(1).min(1000).max(2_147_483_647).required(),
  modelCacheMs: z.number().step(1).min(1000).max(2_147_483_647).required(),
  maxRetries: z.number().step(1).min(0).max(10).required(),
})
export function validateClaudeSettings(value: ClaudeRuntimeSettings): void {
  if (!value.executable.trim() || /[\r\n\0]/.test(value.executable)) throw new Error('Claude 可执行路径无效')
  if (!isAbsolute(value.cwd) || /[\r\n\0]/.test(value.cwd)) throw new Error('Claude 工作目录必须是绝对路径')
  if (!['default','acceptEdits','bypassPermissions','plan','dontAsk','auto'].includes(value.permissionMode)) throw new Error('Claude 权限模式无效')
  for (const duration of [value.timeoutMs, value.modelCacheMs]) if (!Number.isSafeInteger(duration) || duration < 1000 || duration > 2_147_483_647) throw new Error('Claude 超时或缓存时间无效')
  if (!Number.isInteger(value.maxRetries) || value.maxRetries < 0 || value.maxRetries > 10) throw new Error('Claude 重试次数必须在 0–10 之间')
}
