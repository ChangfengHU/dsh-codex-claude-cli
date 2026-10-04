import { describe, expect, it } from 'vitest'
import { validateClaudeSettings, type ClaudeRuntimeSettings } from '../src/claude-settings.ts'
import { ClaudeCodeAdapter } from '../src/claude-adapter.ts'
const valid:ClaudeRuntimeSettings={executable:'claude',cwd:'/tmp',permissionMode:'dontAsk',timeoutMs:300000,modelCacheMs:300000,maxRetries:0}
describe('Claude user runtime settings',()=>{
  it('accepts a native executable without changing authentication',()=>expect(()=>validateClaudeSettings(valid)).not.toThrow())
  it.each([{executable:''},{executable:'bad\npath'},{cwd:'relative'},{timeoutMs:0},{modelCacheMs:NaN},{maxRetries:11},{maxRetries:0.5}])('rejects invalid values %j',patch=>expect(()=>validateClaudeSettings({...valid,...patch})).toThrow())
  it('reads the saved retry policy on the next request',()=>{
    let retries=0
    const adapter=new ClaudeCodeAdapter({provider:'claude-local',displayName:'Claude',maxRetries:0,resolveMaxRetries:()=>retries,runtime:{listModels:async()=>[],stream:async function*(){}}})
    expect(adapter.providerRetryPolicy('claude-local')).toMatchObject({mode:'normal',maxRetries:0})
    retries=2
    expect(adapter.providerRetryPolicy('claude-local')).toMatchObject({mode:'normal',maxRetries:2})
  })
})
