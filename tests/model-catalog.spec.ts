import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compatibleCatalog, catalogOverride } from '../src/model-catalog.ts'
describe('pinned catalog compatibility', () => {
  it('preserves explicit flags and original metadata without mutating input', () => {
    const raw = { models: [{ slug: 'a', input_modalities: ['text','image'] }, { slug: 'b', supports_parallel_tool_calls: true }] }
    const before = JSON.stringify(raw)
    const result = compatibleCatalog(raw)
    expect(result.models).toEqual([{ slug:'a', input_modalities:['text','image'], supports_parallel_tool_calls:false }, { slug:'b',supports_parallel_tool_calls:true }])
    expect(JSON.stringify(raw)).toBe(before)
  })
  it('fails closed on malformed input', () => {
    expect(() => compatibleCatalog({})).toThrow()
    expect(() => compatibleCatalog({ models:[{ supports_parallel_tool_calls:'yes' }] })).toThrow()
  })
  it('writes only a private process copy and leaves the source unchanged', async () => {
    const dir = await mkdtemp(join(tmpdir(),'dsh-catalog-test-'))
    try {
      const source=join(dir,'source.json'), bytes=JSON.stringify({models:[{slug:'a'}]})
      await writeFile(source,bytes)
      expect(await catalogOverride(undefined,dir)).toEqual([])
      const args=await catalogOverride(source,dir)
      expect(args[0]).toBe('-c')
      expect(await readFile(source,'utf8')).toBe(bytes)
      expect(JSON.parse(await readFile(join(dir,'model-catalog.json'),'utf8')).models[0].supports_parallel_tool_calls).toBe(false)
    } finally { await rm(dir,{recursive:true,force:true}) }
  })
})
