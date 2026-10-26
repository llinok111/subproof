'use strict'

const { build } = require('esbuild')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const root = resolve(__dirname, '..')
const outfile = resolve(root, 'docs/subproof.bundle.js')

const main = async () => {
  await build({
    entryPoints: [resolve(root, 'docs/app-entry.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    charset: 'utf8',
    legalComments: 'none',
    outfile,
    logLevel: 'warning',
  })

  // 可复现性：不写时间戳，只输出内容哈希（同样输入两次构建必须字节一致）
  const bytes = readFileSync(outfile)
  const hash = createHash('sha256').update(bytes).digest('hex')
  console.log(`docs/subproof.bundle.js ${bytes.length} bytes sha256=${hash}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
