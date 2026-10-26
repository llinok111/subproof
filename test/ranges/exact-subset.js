'use strict'

const t = require('tap')
const semver = require('../../index.js')
const exactSubset = require('../../ranges/exact-subset.js')
const { explainSubset, discriminators } = require('../../ranges/exact-subset.js')
const Range = require('../../classes/range.js')
const realCorpus = require('../fixtures/exact-subset-real.json')

// ---------------------------------------------------------------------------
// 1) 上游既有用例全量回归：exactSubset 必须与 ranges/subset.js 的 82 条公开
//    用例逐个一致（这些是上游认为正确的行为，我们不得在不同方向上偏离）。
// ---------------------------------------------------------------------------
const upstreamCases = [
  ['1.2.3', '1.2.3', true],
  ['1.2.3', '1.x', true],
  ['1.2.3 1.2.4', '1.2.3', true],
  ['1.2.3 1.2.4', '1.2.9', true], // null set is subset of everything
  ['1.2.3', '>1.2.0', true],
  ['1.2.3 2.3.4 || 2.3.4', '3', false],
  ['^1.2.3-pre.0', '1.x', false],
  ['^1.2.3-pre.0', '1.x', true, { includePrerelease: true }],
  ['>2 <1', '3', true],
  ['1 || 2 || 3', '>=1.0.0', true],
  ['1.2.3', '*', true],
  ['^1.2.3', '*', true],
  ['^1.2.3-pre.0', '*', false],
  ['^1.2.3-pre.0', '*', true, { includePrerelease: true }],
  ['1 || 2 || 3', '*', true],
  ['^1.2.3-pre.0', '>=1.0.0', false],
  ['^1.2.3-pre.0', '>=1.0.0', true, { includePrerelease: true }],
  ['^1.2.3-pre.0', '>=1.2.3-pre.0', true],
  ['^1.2.3-pre.0', '>=1.2.3-pre.0', true, { includePrerelease: true }],
  ['^10.2.0-beta.2', '^10.2.0-beta.1', true],
  ['>1.2.3-pre.0', '>=1.2.3-pre.0', true],
  ['>1.2.3-pre.0', '>1.2.3-pre.0 || 2', true],
  ['1 >1.2.3-pre.0', '>1.2.3-pre.0', true],
  ['1 <=1.2.3-pre.0', '>=1.0.0-0', false],
  ['1 <=1.2.3-pre.0', '>=1.0.0-0', true, { includePrerelease: true }],
  ['1 <=1.2.3-pre.0', '<=1.2.3-pre.0', true],
  ['1 <=1.2.3-pre.0', '<=1.2.3-pre.0', true, { includePrerelease: true }],
  ['<1.2.3-pre.0', '<=1.2.3-pre.0', true],
  ['<1.2.3-pre.0', '<1.2.3-pre.0 || 2', true],
  ['1 <1.2.3-pre.0', '<1.2.3-pre.0', true],
  ['*', '*', true],
  ['', '*', true],
  ['*', '', true],
  ['', '', true],
  ['*', '>=0.0.0-0', true, { includePrerelease: true }],
  ['*', '>=0.0.0', true],
  ['*', '>=0.0.0', false, { includePrerelease: true }],
  ['*', '>=0.0.0-0', true],
  ['^2 || ^3 || ^4', '>=1', true],
  ['^2 || ^3 || ^4', '>1', true],
  ['^2 || ^3 || ^4', '>=2', true],
  ['^2 || ^3 || ^4', '>=3', false],
  ['>=1', '^2 || ^3 || ^4', false],
  ['>1', '^2 || ^3 || ^4', false],
  ['>=2', '^2 || ^3 || ^4', false],
  ['>=3', '^2 || ^3 || ^4', false],
  ['^1', '^2 || ^3 || ^4', false],
  ['^2', '^2 || ^3 || ^4', true],
  ['^3', '^2 || ^3 || ^4', true],
  ['^4', '^2 || ^3 || ^4', true],
  ['1.x', '^2 || ^3 || ^4', false],
  ['2.x', '^2 || ^3 || ^4', true],
  ['3.x', '^2 || ^3 || ^4', true],
  ['4.x', '^2 || ^3 || ^4', true],
  ['>=1.0.0 <=1.0.0 || 2.0.0', '1.0.0 || 2.0.0', true],
  ['<=1.0.0 >=1.0.0 || 2.0.0', '1.0.0 || 2.0.0', true],
  ['>=1.0.0', '1.0.0', false],
  ['>=1.0.0 <2.0.0', '<2.0.0', true],
  ['>=1.0.0 <2.0.0', '>0.0.0', true],
  ['>=1.0.0 <=1.0.0', '1.0.0', true],
  ['>=1.0.0 <=1.0.0', '2.0.0', false],
  ['<2.0.0', '>=1.0.0 <2.0.0', false],
  ['>=1.0.0', '>=1.0.0 <2.0.0', false],
  ['>=1.0.0 <2.0.0', '>=1.0.0', true],
  ['>=1.0.0 <2.0.0', '>1.0.0', false],
  ['>=1.0.0 <=2.0.0', '<2.0.0', false],
  ['>=1.0.0', '<1.0.0', false],
  ['<=1.0.0', '>1.0.0', false],
  ['<=1.0.0 >1.0.0', '>1.0.0', true],
  ['1.0.0 >1.0.0', '>1.0.0', true],
  ['1.0.0 <1.0.0', '>1.0.0', true],
  ['<1 <2 <3', '<4', true],
  ['<3 <2 <1', '<4', true],
  ['>1 >2 >3', '>0', true],
  ['>3 >2 >1', '>0', true],
  ['<=1 <=2 <=3', '<4', true],
  ['<=3 <=2 <=1', '<4', true],
  ['>=1 >=2 >=3', '>0', true],
  ['>=3 >=2 >=1', '>0', true],
  ['>=3 >=2 >=1', '>=3 >=2 >=1', true],
  ['>2.0.0', '>=2.0.0', true],
]

t.test('上游 82 条公开用例：exactSubset 全部一致', t => {
  t.plan(upstreamCases.length)
  for (const [sub, dom, expect, options] of upstreamCases) {
    const msg = `${sub || "''"} ⊂ ${dom || "''"} = ${expect}` +
      (options ? ' ' + Object.keys(options).join(',') : '')
    t.equal(exactSubset(sub, dom, options), expect, msg)
  }
})

// ---------------------------------------------------------------------------
// 2) 上游当前会判错的案例。每条同时锁定「上游行为」与「真实语义」：
//    若上游将来修好了，这里的 upstream 断言会红 —— 这是有意的，用来防止
//    README 里的主张在上游升级后悄悄失真。
// ---------------------------------------------------------------------------
const defectCases = [
  // 空集：没有任何版本能满足，必为任何集合的子集
  { sub: '<0.0.0', dom: '1.2.x', why: '空集（非 prerelease 模式下 0.0.0 是最小版本）' },
  { sub: '<0.0.0', dom: '*', why: '空集' },
  // 隐式下界 0.0.0
  { sub: '<=2.0.0', dom: '*', why: '所有版本 >= 0.0.0，因此 <=2.0.0 被 * 覆盖' },
  { sub: '0', dom: '*', why: '0.x 的每一个版本都在 * 之内（真实 package.json 写作 "0"）' },
  { sub: '^0.0.0', dom: '*', why: '^0.0.0 = >=0.0.0 <0.0.1-0' },
  // 多分支并集覆盖
  { sub: '>=1 <3', dom: '>=1 <2 || >=2 <3', why: '并集覆盖，单分支都不包含（上游 #703）' },
  { sub: '>=7.0.0', dom: '^6.0.0 || ^7.0.0 || >=8.0.0', why: '真实 eslint 声明，并集恰好覆盖' },
  { sub: '>=1.2.3', dom: '<3.0.0 || >=1.3.0', why: '第三个 major 起由第二个分支接管' },
  // 零主版本 caret
  { sub: '^0.0.8', dom: '0.0.8', why: '^0.0.8 只含 release 0.0.8（真实 sse/faucet 声明）' },
  { sub: '^0.0.91', dom: '0.0.91', why: '同上（真实 pkg-pr-new 声明）' },
  // 上界写法差异
  { sub: '>= 2.1.2 < 3.0.0', dom: '>= 2.1.2 < 3', why: '对 release 版本两个上界等价' },
  { sub: '>= 2.1.2 < 3.0.0', dom: '^2.1.2', why: '^2.1.2 = >=2.1.2 <3.0.0-0' },
  // prerelease 精确版本
  { sub: '7.0.0-dev.20260707.2', dom: '^7.0.0-dev.20260203.1', why: '真实 @typescript/native-preview 声明' },
]

t.test('上游已知缺陷：exactSubset 给出正确结论且 witness 可复核', t => {
  t.plan(defectCases.length * 4)
  for (const c of defectCases) {
    const res = explainSubset(c.sub, c.dom)
    t.equal(res.subset, true, `exactSubset(${c.sub} ⊂ ${c.dom}) 应为 true —— ${c.why}`)
    t.equal(res.witness, null, '为 true 时不应有反例')
    // truthful: 随机抽 400 个版本，不应存在满足 sub 但不满足 dom 的版本
    const A = new Range(c.sub); const B = new Range(c.dom)
    let probe = null
    for (const v of sampleVersions(c.sub, c.dom, 400)) {
      if (A.test(v) && !B.test(v)) {
        probe = v; break
      }
    }
    t.equal(probe, null, `随机探测不应找到反例（找到 ${probe}）`)
    t.equal(semver.subset(c.sub, c.dom), false, `上游 7.8.5 在这条上返回 false（已核实的缺陷）`)
  }
})

// ---------------------------------------------------------------------------
// 3) 反例必须真实：任何 exactSubset=false 的结论都要能拿出一个版本，
//    同时满足 sub、不满足 dom。
// ---------------------------------------------------------------------------
const notSubsetCases = [
  ['1.2.3', '1.2.4'],
  ['^1.2.3', '>=1.2.3 <1.3.0'],
  ['^1.2.3-pre.0', '*'],
  ['1.2.3-alpha', '<=3.0.0'],
  ['>=1.0.0', '>=1.0.0 <2.0.0'],
  ['<=2.0.0', '>=1.0.0'],
  ['1.2.3 || 2.0.0', '1.2.3'],
  ['1.2.3 2.3.4 || 4.0.0', '3'],
]

t.test('判为「不是子集」时必须给出可复核的反例', t => {
  t.plan(notSubsetCases.length * 3)
  for (const [sub, dom] of notSubsetCases) {
    const res = explainSubset(sub, dom)
    t.equal(res.subset, false, `${sub} ⊄ ${dom}`)
    t.ok(res.witness, '应有反例')
    const A = new Range(sub); const B = new Range(dom)
    t.ok(A.test(res.witness) && !B.test(res.witness),
      `反例 ${res.witness} 满足 ${sub} 且不满足 ${dom}`)
  }
})

// ---------------------------------------------------------------------------
// 4) 等价写法必须双向成立（真实项目里同一约束的两种写法）
// ---------------------------------------------------------------------------
const equivalentPairs = [
  ['^1.2.3', '>=1.2.3 <2.0.0'],
  ['~1.2.3', '>=1.2.3 <1.3.0'],
  ['1.x', '>=1.0.0 <2.0.0'],
  ['1.2.x', '>=1.2.0 <1.3.0'],
  ['*', '>=0.0.0'],
  ['^0.1.2', '>=0.1.2 <0.2.0'],
]

t.test('等价写法双向判定一致', t => {
  for (const [a, b] of equivalentPairs) {
    t.equal(exactSubset(a, b), true, `${a} ⊆ ${b}`)
    // 反向单独断言，便于定位
    t.equal(exactSubset(b, a), true, `${b} ⊆ ${a}`)
  }
  // 含 prerelease 分支的写法只在一个方向上等价：>=1.0.0-0 || >=1.0.0 多出 1.0.0 之前的 prerelease
  t.equal(exactSubset('>=1.0.0', '>=1.0.0-0 || >=1.0.0'), true)
  t.equal(exactSubset('>=1.0.0-0 || >=1.0.0', '>=1.0.0'), false)
  t.end()
})

// ---------------------------------------------------------------------------
// 5) 判别点规模：网格必须随分支数线性增长，不能爆炸（否则大数据集会卡死）
// ---------------------------------------------------------------------------
t.test('判别点数量受分支数线性约束', t => {
  const branches = []
  for (let i = 1; i <= 10; i++) {
    branches.push(`^${i}.0.0`)
  }
  const dom = branches.join(' || ')
  const points = discriminators(new Range('>=1.0.0'), new Range(dom))
  t.ok(points.length < 400, `10 个分支时点数 ${points.length} < 400`)
  const t0 = process.hrtime.bigint()
  const r = exactSubset('9.0.0', dom)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  t.equal(r, true)
  t.ok(ms < 50, `单次判定耗时 ${ms.toFixed(2)}ms < 50ms（仅作回归护栏，不作性能声明）`)
  t.end()
})

// ---------------------------------------------------------------------------
// 6) 真实语料回归：来自 3808 个真实 package.json、182492 次比较里筛出的
//    16 条上游错误，必须全部被判为 true。
// ---------------------------------------------------------------------------
t.test('真实 npm 语料：16 条上游漏判全部纠正', t => {
  t.plan(realCorpus.findings.length * 2)
  for (const f of realCorpus.findings) {
    t.equal(exactSubset(f.sub, f.dom), true, `${f.pkg}: ${f.sub} ⊆ ${f.dom}`)
    t.equal(semver.subset(f.sub, f.dom), false, `${f.pkg}: 上游 7.8.5 仍判 false`)
  }
})

// ---------------------------------------------------------------------------
// 7) 随机一致性：不依赖固定用例，防止「只对样本过拟合」
// ---------------------------------------------------------------------------
t.test('固定种子的随机对比：exact 的结论与独立探测不矛盾', t => {
  let seed = 20261026
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff
  }
  const pick = a => a[Math.floor(rnd() * a.length) % a.length]
  const POOL = ['0.0.0', '0.0.1', '0.1.0', '1.0.0', '1.0.0-0', '1.0.0-alpha', '1.1.0', '1.2.3', '1.2.3-0', '1.2.3-alpha', '1.3.0', '2.0.0', '2.0.0-rc.1', '3.0.0']
  const OPS = ['', '>', '>=', '<', '<=']
  const simple = () => {
    const n = 1 + Math.floor(rnd() * 2)
    const parts = []
    for (let i = 0; i < n; i++) {
      parts.push(pick(OPS) + pick(POOL))
    }
    return parts.join(' ')
  }
  const makeRange = () => {
    if (rnd() < 0.2) {
      return pick(['*', '1.x', '1.2.x', '^1.2.3', '~1.2.3', '1'])
    }
    const n = 1 + Math.floor(rnd() * 2)
    const parts = []
    for (let i = 0; i < n; i++) {
      parts.push(simple())
    }
    return parts.join(' || ')
  }

  const N = 120
  let checked = 0
  let contradictions = 0
  for (let i = 0; i < N; i++) {
    const a = makeRange(); const b = makeRange()
    const res = explainSubset(a, b)
    const A = new Range(a); const B = new Range(b)
    if (!res.subset) {
      if (!(A.test(res.witness) && !B.test(res.witness))) {
        contradictions++
      }
    } else {
      for (const v of sampleVersions(a, b, 300)) {
        if (A.test(v) && !B.test(v)) {
          contradictions++; break
        }
      }
    }
    checked++
  }
  t.equal(contradictions, 0, `${checked} 组随机用例，0 处自相矛盾`)
  t.end()
})

// ---------------------------------------------------------------------------
// 辅助：在 range 常量附近采样（含 prerelease 网格），用于独立探测
// ---------------------------------------------------------------------------
function sampleVersions (a, b, limit) {
  const out = []
  const consts = []
  for (const r of [new Range(a), new Range(b)]) {
    for (const set of r.set) {
      for (const c of set) {
        if (c.semver && c.semver.version) {
          consts.push(c.semver)
        }
      }
    }
  }
  for (const c of consts) {
    const { major: M, minor: m, patch: p } = c
    for (const dp of [-1, 0, 1, 2]) {
      for (const pre of ['', '-0', '-alpha', '-beta', '-zzz', '-alpha.1']) {
        const patch = p + dp
        if (patch < 0) {
          continue
        }
        out.push(`${M}.${m}.${patch}${pre}`)
      }
    }
    out.push(`${M}.${m + 1}.0`, `${M}.${m + 1}.0-0`, `${M + 1}.0.0`, `${M + 1}.0.0-0`)
  }
  out.push('0.0.0', '0.0.0-0', '0.0.1', '9999.0.0', '9999.0.0-0')
  const uniq = [...new Set(out)]
  return uniq.length > limit ? uniq.slice(0, limit) : uniq
}

t.test('签名与入口形状', t => {
  t.equal(typeof exactSubset, 'function')
  t.equal(exactSubset.exactSubset, exactSubset)
  t.equal(typeof exactSubset.explainSubset, 'function')
  t.equal(typeof exactSubset.discriminators, 'function')
  t.equal(exactSubset('^1', new Range('^1')), true, '支持传入 Range 对象')
  t.end()
})
