import type { ReactNode } from 'react'
import { CodexSettingsCard, type CodexSettingsCardProps } from './CodexSettingsCard.tsx'
import css from './RuntimeWorkbenchPage.module.css'

/** Workbench presentation for the two local-login model routes. */
export function RuntimeWorkbenchPage(props: CodexSettingsCardProps): ReactNode {
  return (
    <section className={css.page}>
      <header className={css.head}>
        <div className={css.headCopy}>
          <h2 className={css.title}>CLI Runtimes</h2>
          <p className={css.description}>本机登录态由 CLI 自己维护；DSH 只负责模型路由、能力开关和会话调用。</p>
        </div>
      </header>
      <div className={css.runtimeGrid}>
        <article className={css.runtimeCard}>
          <div className={css.runtimeTop}>
            <span className={css.runtimeName}>Codex App Server</span>
            <span className={css.status}>已注册</span>
          </div>
          <p className={css.runtimeMeta}>provider: codex-local · 模型与推理强度在 DSH 会话模型选择器中选择。</p>
        </article>
        <article className={css.runtimeCard}>
          <div className={css.runtimeTop}>
            <span className={css.runtimeName}>Claude Code</span>
            <span className={css.status}>已注册</span>
          </div>
          <p className={css.runtimeMeta}>provider: claude-local · 直接复用机器上的 Claude Code 登录态。</p>
        </article>
      </div>
      <h3 className={css.sectionTitle}>Codex 能力配置</h3>
      <ul className={css.settingsList}><CodexSettingsCard {...props} /></ul>
    </section>
  )
}
