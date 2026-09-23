// A real, no-tool model reply through the pinned runner; never touches Fleet nodes.
import { spawn } from 'node:child_process'
import { CodexAppServerRunner } from '../src/runner.ts'
import { assertCompletedTurn } from '../src/protocol.ts'
const runner = new CodexAppServerRunner({
  timeoutMs: 90000, disposeGraceMs: 3000, maxJsonRpcLineBytes: 8388608,
  maxStderrBytes: 65536, env: {}, modelCatalogPath: process.argv[2]!,
  spawn: (spec: any) => {
    const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdio: ['pipe','pipe','pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536) })
    const done = new Promise<any>(resolve => { child.on('close', (exitCode, signal) => resolve({exitCode,signal})) })
    const terminate = () => { child.kill() }
    spec.signal?.addEventListener('abort', terminate, { once:true })
    return { pid:child.pid!, stdin:child.stdin, stdout:child.stdout, stderr:undefined,
      collected:{stderr:{readFrom:()=>({text:stderr,nextOffset:stderr.length,lossy:false})}},
      done, terminate, waitForExit:async()=>{await done; return true} }
  },
})
let deltas = '', toolRequested = false, completed = false
try {
  for await (const event of runner.stream({model:'gpt-5.6-terra',modelProvider:'openai',system:'Reply MODEL_OK only. Never call tools.',
    history:[{type:'message',role:'user',content:[{type:'input_text',text:'Reply MODEL_OK only.'}]}],dynamicTools:[]})) {
    if (event.kind === 'notification') {
      const e = event as any
      if(e.method === 'item/agentMessage/delta') deltas += e.params?.delta ?? ''
      if(event.method === 'turn/completed') { assertCompletedTurn(event); completed = true }
    }
    if (event.kind === 'server-request') toolRequested = true
  }
  console.log(JSON.stringify({streamCompleted:true,toolRequested,responseContainsMarker:deltas.includes('MODEL_OK')}))
  if(!completed || toolRequested || !deltas.includes('MODEL_OK')) process.exitCode = 1
} catch (error: any) {
  console.log(JSON.stringify({streamCompleted:false,code:error.code ?? 'unknown'}))
  process.exitCode = 1
}
