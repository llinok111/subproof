'use strict'

// 交叉验证：小版本宇宙「完全穷举」 vs 判别点网格 oracle vs 上游 subset()
// 目的：证明原子候选集在可控宇宙内与穷举结论一致（否则 oracle 不可信）；
//       并统计上游在穷举宇宙上可证伪的错误。
const semver = require('../index.js')

const V = (M, m, p, pre = []) => new semver.SemVer(`${M}.${m}.${p}` + (pre.length ? '-' + pre.join('.') : ''))

// ---- 1) 穷举宇宙
const PRES = [[], [0], ['alpha'], ['beta'], ['alpha', 1], ['zzz']]
const UNIVERSE = []
// 上界必须高于所有 range 常量及其邻居（生成器用到 1.2.4 / 2.0.0-rc.1 / 3.0.0），
// 否则 ~1.2.3 ⊄ 1.2.3 这类会被"宇宙里没有 1.2.4"掩盖成 true。
for (let M = 0; M <= 4; M++) {
  for (let m = 0; m <= 4; m++) {
    for (let p = 0; p <= 6; p++) {
      for (const pre of PRES) {
        UNIVERSE.push(V(M, m, p, pre).version)
      }
    }
  }
}
const UIDX = new Map(UNIVERSE.map((v, i) => [v, i]))
// 用 BitSet 表示满足某 range 的版本集合，判定 subset 即按位包含
const bitsetOf = (range) => {
  const bs = new Uint8Array(Math.ceil(UNIVERSE.length / 8))
  for (let i = 0; i < UNIVERSE.length; i++) {
    if (range.test(UNIVERSE[i])) {
      bs[i >> 3] |= 1 << (i & 7)
    }
  }
  return bs
}
const isSubset = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if ((a[i] & ~b[i]) !== 0) {
      return false
    }
  }
  return true
}
const firstWitness = (a, b) => {
  for (let i = 0; i < UNIVERSE.length; i++) {
    if ((a[i >> 3] >> (i & 7)) & 1) {
      if (!((b[i >> 3] >> (i & 7)) & 1)) {
        return UNIVERSE[i]
      }
    }
  }
  return null
}

// ---- 2) 判别点网格 oracle（与 ranges/exact-subset.js 同一思路，此处独立实现以便交叉验证）
const isNum = x => typeof x === 'number'
const bumpPre = pre => {
  if (!pre.length) {
    return [0]
  }
  const last = pre[pre.length - 1]
  const head = pre.slice(0, -1)
  return isNum(last) ? [...head, last + 1] : [...pre, 0]
}
const candidatesFor = (c) => {
  const { major: M, minor: m, patch: p, prerelease: pre } = c
  const out = []
  const push = v => {
    if (v.major >= 0 && v.minor >= 0 && v.patch >= 0) {
      out.push(v)
    }
  }
  const P = Math.max(p, 0)
  push(V(M, m, P)); push(V(M, m, P, [0])); push(V(M, m, P, ['zzz']))
  if (pre.length) {
    push(c)
    push(V(M, m, P, bumpPre(pre)))
    push(V(M, m, P, pre.slice(0, -1).length ? pre.slice(0, -1) : [0]))
  }
  push(V(M, m, P + 1)); push(V(M, m, P + 1, [0]))
  push(V(M, m, Math.max(P - 1, 0))); push(V(M, m, Math.max(P - 1, 0), ['zzz']))
  push(V(M, m + 1, 0)); push(V(M, m + 1, 0, [0]))
  push(V(M + 1, 0, 0)); push(V(M + 1, 0, 0, [0]))
  push(V(M, 0, 0)); push(V(M, 0, 0, [0]))
  return out
}
const atomCandidates = (A, B) => {
  const seen = new Map()
  const add = v => {
    if (v) {
      seen.set(v.version, v)
    }
  }
  add(V(0, 0, 0)); add(V(0, 0, 0, [0])); add(V(0, 0, 0, ['zzz']))
  add(V(9999, 0, 0)); add(V(9999, 0, 0, [0]))
  for (const r of [A, B]) {
    for (const set of r.set) {
      for (const c of set) {
        if (!(c.semver instanceof semver.SemVer)) {
          continue
        }
        for (const v of candidatesFor(c.semver)) {
          add(v)
        }
      }
    }
  }
  return [...seen.values()].map(v => v.version)
}
const atomOracle = (ra, rb) => {
  const A = new semver.Range(ra)
  const B = new semver.Range(rb)
  for (const v of atomCandidates(A, B)) {
    if (A.test(v) && !B.test(v)) {
      return { subset: false, witness: v }
    }
  }
  return { subset: true, witness: null }
}

// ---- 3) 生成器：更规整、贴近真实写法
let seed = 7654321
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

const N = Number(process.argv[2] || 3000)
let atomVsExhaustiveDisagree = 0
let fp = 0; let fn = 0; let agree = 0
const fpSamples = []; const fnSamples = []; const disagreeSamples = []

for (let i = 0; i < N; i++) {
  const a = range(); const b = range()
  const A = new semver.Range(a); const B = new semver.Range(b)
  const ba = bitsetOf(A); const bb = bitsetOf(B)
  const ex = isSubset(ba, bb)
  const exWitness = ex ? null : firstWitness(ba, bb)
  const atom = atomOracle(a, b)
  const up = semver.subset(a, b)

  if (atom.subset !== ex) {
    atomVsExhaustiveDisagree++
    if (disagreeSamples.length < 6) {
      disagreeSamples.push({
        a,
        b,
        exhaustive: ex,
        exhaustiveWitness: exWitness,
        atom: atom.subset,
        atomWitness: atom.witness,
      })
    }
  }
  if (up === ex) {
    agree++
  } else if (up) {
    fp++; if (fpSamples.length < 10) {
      fpSamples.push({ a, b, witness: exWitness })
    }
  } else {
    fn++; if (fnSamples.length < 10) {
      fnSamples.push({
        a,
        b,
        atomWitness: atom.witness,
        inUniverse: atom.witness ? UIDX.has(atom.witness) : null,
      })
    }
  }
}

const pct = n => (100 * n / N).toFixed(2) + '%'
console.log(`universe=${UNIVERSE.length} versions | cases=${N}`)
console.log(`atom-vs-exhaustive disagree=${atomVsExhaustiveDisagree} (${pct(atomVsExhaustiveDisagree)})`)
console.log(`upstream agree=${agree} (${pct(agree)}) falsePositive=${fp} (${pct(fp)}) falseNegative=${fn} (${pct(fn)})`)
console.log('\n--- atom/exhaustive 分歧（若>0 说明候选集不完备）')
for (const s of disagreeSamples) {
  console.log(' ', JSON.stringify(s))
}
console.log('\n--- 上游假阳性（穷举宇宙内可证伪：说 true，实际有反例）')
for (const s of fpSamples) {
  console.log(`  subset(${JSON.stringify(s.a)}, ${JSON.stringify(s.b)}) => true ; witness=${s.witness}`)
}
console.log('\n--- 上游假阴性（穷举宇宙内 A 全部被 B 覆盖）')
for (const s of fnSamples) {
  console.log(`  subset(${JSON.stringify(s.a)}, ${JSON.stringify(s.b)}) => false ; inUniverseWitness=${s.atomWitness} inUniverse=${s.inUniverse}`)
}
