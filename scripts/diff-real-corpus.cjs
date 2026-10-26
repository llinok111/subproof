'use strict'

// 真实语料差分：同包名的不同 range 声明两两配对（真实升级/共存场景），
// 双向判定 A⊆B / B⊆A，比较上游 subset() 与 exactSubset()。
// 输出可复现的 JSON 证据。
const fs = require('fs')
const path = require('path')
const semver = require('../index.js')
const { explainSubset } = require('../ranges/exact-subset.js')

const ROOTS = process.argv.slice(2, -1)
const OUT = process.argv[process.argv.length - 1]
if (ROOTS.length === 0) {
  console.error('usage: node scripts/diff-real-corpus.cjs <dir...> <out.json>')
  process.exit(2)
}

const byPkg = new Map()
let files = 0
const walk = (dir, depth) => {
  if (depth > 5) {
    return
  }
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'dist' || e.name === 'coverage') {
      continue
    }
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      walk(p, depth + 1); continue
    }
    if (e.name !== 'package.json') {
      continue
    }
    files++
    let pkg
    try {
      pkg = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch {
      continue
    }
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = pkg[field]
      if (!deps || typeof deps !== 'object') {
        continue
      }
      for (const [name, range] of Object.entries(deps)) {
        if (typeof range !== 'string' || range.length > 60) {
          continue
        }
        if (/^(npm:|file:|git|https?:|link:|workspace:)/.test(range)) {
          continue
        }
        if (!byPkg.has(name)) {
          byPkg.set(name, new Set())
        }
        byPkg.get(name).add(range)
      }
    }
  }
}
for (const r of ROOTS) {
  walk(r, 0)
}

const pairs = []
for (const [name, set] of byPkg) {
  const arr = [...set]
  if (arr.length < 2) {
    continue
  }
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      pairs.push([name, arr[i], arr[j]])
    }
  }
}

let compared = 0
let agree = 0
let tooLoose = 0
let tooStrict = 0
const findings = []
const invalid = []

for (const [name, a, b] of pairs) {
  for (const [x, y] of [[a, b], [b, a]]) {
    let up
    try {
      up = semver.subset(x, y)
    } catch (e) {
      invalid.push({ name, x, y, error: e.message }); continue
    }
    let ex
    try {
      ex = explainSubset(x, y)
    } catch (e) {
      invalid.push({ name, x, y, error: e.message }); continue
    }
    compared++
    if (up === ex.subset) {
      agree++; continue
    }
    if (up && !ex.subset) {
      tooLoose++
      const A = new semver.Range(x); const B = new semver.Range(y)
      findings.push({
        kind: 'upstream-too-loose',
        pkg: name,
        sub: x,
        dom: y,
        witness: ex.witness,
        verified: !!(ex.witness && A.test(ex.witness) && !B.test(ex.witness)),
      })
    } else {
      tooStrict++
      findings.push({ kind: 'upstream-too-strict', pkg: name, sub: x, dom: y })
    }
  }
}

const result = {
  generatedBy: 'scripts/diff-real-corpus.cjs',
  dirs: ROOTS,
  packageJsonFiles: files,
  packages: byPkg.size,
  pairs: pairs.length,
  comparisons: compared,
  agree,
  upstreamTooLoose: tooLoose,
  upstreamTooStrict: tooStrict,
  agreeRate: compared ? Number((100 * agree / compared).toFixed(3)) : null,
  invalidRanges: invalid.length,
  findings,
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n')

console.log(`files=${files} packages=${byPkg.size} pairs=${pairs.length} comparisons=${compared}`)
console.log(`agree=${agree} (${result.agreeRate}%) tooLoose=${tooLoose} tooStrict=${tooStrict} invalid=${invalid.length}`)
console.log('witness verified:', findings.filter(f => f.verified).length, '/', findings.filter(f => f.kind === 'upstream-too-loose').length)
for (const f of findings.slice(0, 10)) {
  console.log(`  [${f.kind}] ${f.pkg}  ${JSON.stringify(f.sub)} ⊆ ${JSON.stringify(f.dom)}${f.witness ? ' witness=' + f.witness : ''}${f.verified !== undefined ? ' verified=' + f.verified : ''}`)
}
