'use strict'

// 差分探针：上游 subset() vs exactSubset()，含双向复核。
//  - 上游 true / exact false → 必须能用 satisfies() 复核 witness（硬证据）
//  - 上游 false / exact true → 用 5 万随机版本独立探测（防止 exact 漏检）
const semver = require('../index.js')
const { explainSubset } = require('../ranges/exact-subset.js')

let seed = Number(process.argv[3] || 7654321)
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff
}
const pick = a => a[Math.floor(rnd() * a.length) % a.length]

const POOL = ['0.0.0', '0.0.1', '0.1.0', '1.0.0', '1.0.0-0', '1.0.0-alpha', '1.1.0',
  '1.2.0', '1.2.3', '1.2.3-0', '1.2.3-alpha', '1.2.4', '1.3.0', '2.0.0', '2.0.0-0', '2.0.0-rc.1', '3.0.0']
const SHORTHANDS = ['*', '1', '1.x', '1.2.x', '^1.2.3', '~1.2.3', '^0.1.0', '~1.2.3-beta', '^2.0.0-rc.1']
const OPS = ['', '>', '>=', '<', '<=']
const simple = () => {
  const n = 1 + Math.floor(rnd() * 2)
  const parts = []
  for (let i = 0; i < n; i++) {
    parts.push(pick(OPS) + pick(POOL))
  }
  return parts.join(' ')
}
const range = () => {
  if (rnd() < 0.18) {
    return pick(SHORTHANDS)
  }
  const n = 1 + Math.floor(rnd() * 2)
  const parts = []
  for (let i = 0; i < n; i++) {
    parts.push(simple())
  }
  return parts.join(' || ')
}

// 独立探测：在合理范围内随机造版本（含 prerelease），看是否推翻 exact 的 true
const PRE_TOKENS = [0, 1, 2, 10, 'alpha', 'beta', 'rc', 'zzz']
const randomVersion = () => {
  const M = Math.floor(rnd() * 6)
  const m = Math.floor(rnd() * 6)
  const p = Math.floor(rnd() * 8)
  if (rnd() < 0.45) {
    return `${M}.${m}.${p}`
  }
  const n = 1 + Math.floor(rnd() * 2)
  const pre = []
  for (let i = 0; i < n; i++) {
    pre.push(pick(PRE_TOKENS))
  }
  return `${M}.${m}.${p}-${pre.join('.')}`
}

const N = Number(process.argv[2] || 3000)
const SAMPLES = Number(process.argv[4] || 20000)

let agree = 0
const fp = []
const fn = []
const throws = []

for (let i = 0; i < N; i++) {
  const a = range(); const b = range()
  let up
  try {
    up = semver.subset(a, b)
  } catch (e) {
    throws.push({ a, b, m: e.message }); continue
  }
  const ex = explainSubset(a, b)

  if (up === ex.subset) {
    agree++; continue
  }

  if (up) {
    // 上游更宽松：witness 必须能被 satisfies 复核
    const A = new semver.Range(a); const B = new semver.Range(b)
    const ok = ex.witness && A.test(ex.witness) && !B.test(ex.witness)
    fp.push({ a, b, witness: ex.witness, verified: ok })
  } else {
    // 上游更严格：用随机版本独立探测，若找到反例说明 exact 漏检
    const A = new semver.Range(a); const B = new semver.Range(b)
    let counter = null
    for (let j = 0; j < SAMPLES; j++) {
      const v = randomVersion()
      let valid = true
      try {
        new semver.SemVer(v)
      } catch {
        valid = false
      }
      if (!valid) {
        continue
      }
      if (A.test(v) && !B.test(v)) {
        counter = v; break
      }
    }
    fn.push({ a, b, counter })
  }
}

const pct = n => (100 * n / N).toFixed(2) + '%'
console.log(`cases=${N} agree=${agree} (${pct(agree)})`)
console.log(`upstream-too-loose (up=true, exact=false) = ${fp.length} (${pct(fp.length)}), witness verified ${fp.filter(x => x.verified).length}/${fp.length}`)
console.log(`upstream-too-strict (up=false, exact=true) = ${fn.length} (${pct(fn.length)}), random counterexample found ${fn.filter(x => x.counter).length}/${fn.length}`)
console.log(`throws=${throws.length}`)

console.log('\n--- 上游过宽（有反例版本，可 satisfies 复核）')
for (const c of fp.slice(0, 10)) {
  console.log(`  subset(${JSON.stringify(c.a)}, ${JSON.stringify(c.b)}) = true ; witness=${c.witness} verified=${c.verified}`)
}
console.log('\n--- 上游过严（exact 在网格上找不到反例）')
for (const c of fn.slice(0, 10)) {
  console.log(`  subset(${JSON.stringify(c.a)}, ${JSON.stringify(c.b)}) = false ; exact=true ; randomCounter=${c.counter}`)
}
console.log('\n--- exact 漏检（随机探测推翻了 exact，需要修算法）')
const bad = fn.filter(x => x.counter)
for (const c of bad.slice(0, 10)) {
  console.log(`  ${JSON.stringify(c.a)} ⊄ ${JSON.stringify(c.b)} 反例=${c.counter}`)
}
