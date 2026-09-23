// Generate a deployment-owned 0.147 catalog; never edit the source/global Codex config.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const [source, destination] = process.argv.slice(2)
if (!source || !destination || resolve(source) === resolve(destination)) throw Error('Provide distinct source and destination paths')
const data = JSON.parse(await readFile(source, 'utf8'))
if (!Array.isArray(data.models) || !data.models.length) throw Error('Expected a nonempty model catalog')
let adapted = 0
for (const model of data.models) {
  if (typeof model.slug !== 'string') throw Error('Invalid model entry')
  // Newer catalogs omit this old mandatory field. Unknown parallel capability
  // is conservatively disabled; existing explicit booleans remain unchanged.
  if (model.supports_parallel_tool_calls === undefined) { model.supports_parallel_tool_calls = false; adapted++ }
}
await writeFile(destination, JSON.stringify(data), { mode: 0o600, flag: 'wx' })
console.log(JSON.stringify({ models: data.models.length, adapted }))
