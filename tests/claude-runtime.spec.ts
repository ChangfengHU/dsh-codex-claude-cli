import { afterEach, describe, expect, it, vi } from 'vitest'
const mocked=vi.hoisted(()=>({query:vi.fn()}))
vi.mock('@anthropic-ai/claude-agent-sdk',()=>({query:mocked.query}))
import { ClaudeCodeRuntime, type ClaudeCodeRuntimeOptions } from '../src/claude-runtime.ts'
const base:ClaudeCodeRuntimeOptions={executable:process.execPath,cwd:'/tmp',permissionMode:'dontAsk',timeoutMs:1000,modelCacheMs:60000,env:{}}
function instance(){
  return {supportedModels:vi.fn(async()=>[{value:'sonnet',displayName:'Sonnet',description:'Test',supportedEffortLevels:['low','high']}]),close:vi.fn(),async *[Symbol.asyncIterator](){yield {type:'result',subtype:'success',is_error:false,result:'OK',usage:{input_tokens:1,output_tokens:1}}}}
}
afterEach(()=>{vi.useRealTimers();mocked.query.mockReset()})
describe('Claude saved settings at the SDK boundary',()=>{
  it('reuses a catalog only while its executable/workspace/settings epoch matches',async()=>{
    mocked.query.mockImplementation(instance)
    let settings={...base}
    const runtime=new ClaudeCodeRuntime({...base,resolveSettings:()=>settings})
    await runtime.listModels();await runtime.listModels()
    expect(mocked.query).toHaveBeenCalledTimes(1)
    settings={...settings,cwd:'/var/tmp',permissionMode:'plan'}
    await runtime.listModels()
    expect(mocked.query).toHaveBeenCalledTimes(2)
    expect(mocked.query.mock.calls[1]?.[0].options).toMatchObject({cwd:'/var/tmp',permissionMode:'plan',persistSession:false})
  })
  it('an accepted stream retains its snapshot; the next call uses the new saved settings',async()=>{
    mocked.query.mockImplementation(instance)
    let settings={...base}
    const runtime=new ClaudeCodeRuntime({...base,resolveSettings:()=>settings})
    const first=runtime.stream({model:'sonnet',system:'',prompt:'hello'})[Symbol.asyncIterator]()
    const pending=first.next()
    settings={...settings,cwd:'/var/tmp',permissionMode:'plan'}
    await pending
    await first.return?.()
    for await(const _ of runtime.stream({model:'sonnet',system:'',prompt:'hello again'})){}
    expect(mocked.query.mock.calls[0]?.[0].options).toMatchObject({cwd:'/tmp',permissionMode:'dontAsk'})
    expect(mocked.query.mock.calls[1]?.[0].options).toMatchObject({cwd:'/var/tmp',permissionMode:'plan',persistSession:false})
  })
  it('bounds model discovery and closes a hung SDK before returning unverified aliases',async()=>{
    vi.useFakeTimers()
    const fake=instance();fake.supportedModels=vi.fn(()=>new Promise(()=>{}))
    mocked.query.mockReturnValue(fake)
    const runtime=new ClaudeCodeRuntime(base),pending=runtime.listModels()
    // Allow the executable access check to settle without advancing the discovery deadline.
    await vi.waitFor(()=>expect(mocked.query).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(1000)
    expect((await pending).map(m=>m.id)).toEqual(['default','opus','sonnet','haiku'])
    expect(fake.close).toHaveBeenCalledOnce()
  })
})
