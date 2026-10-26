'use strict'

// exact-subset: 判定 subRange 的版本集合是否被 superRange 覆盖，并给出反例。
//
// 与 ranges/subset.js 的区别：上游是启发式（把每个 AND 组压成一个区间逐条比对），
// 在多分支并集、空分支、隐式下界 0.0.0、prerelease 边界上会给出错误结论。
// 这里改用「判别点网格」：在有限个点上逐点测试，网格由两个 range 中出现的全部
// 版本常量推导，覆盖所有可能的真值跳变位置。
//
// 完备性依据：
//   Range.test(v) 的真值只依赖三件事：
//     (1) v 的 (major,minor,patch) 三元组是否出现在常量集合中；
//     (2) v 与每个常量的 compare() 结果符号；
//     (3) 当三元组相同时，v.prerelease 与该常量 prerelease 的比较符号。
//   因此若两个版本在上述三项上一致，test() 结果必然相同。网格为每个三元组生成
//   「该三元组本身 + 前后相邻三元组」的代表，并为每个三元组生成 prerelease 的
//   「最小 / 各切点 / 切点直接后继 / 最大」代表，即覆盖全部等价类。

const Range = require('../classes/range.js')
const SemVer = require('../classes/semver.js')
const parseOptions = require('../internal/parse-options.js')

const isNum = x => typeof x === 'number'
const tupleKey = (M, m, p) => `${M}.${m}.${p}`

// prerelease 的直接后继：数值 +1，或尾部追加 .0（'alpha' < 'alpha.0'，中间无其他版本）
const bumpPrerelease = pre => {
  if (!pre.length) {
    return [0]
  }
  const last = pre[pre.length - 1]
  const head = pre.slice(0, -1)
  return isNum(last) ? [...head, last + 1] : [...pre, 0]
}

const collectConstants = (ranges) => {
  const out = []
  for (const range of ranges) {
    for (const set of range.set) {
      for (const comp of set) {
        if (comp.semver instanceof SemVer) {
          out.push(comp.semver)
        }
      }
    }
  }
  return out
}

// 生成判别点（版本字符串）。options 只影响 test()，不影响点集。
const discriminators = (rangeA, rangeB) => {
  const consts = collectConstants([rangeA, rangeB])
  const tuples = new Map() // key -> [M,m,p]
  const addTuple = (M, m, p) => {
    if (M < 0 || m < 0 || p < 0) {
      return
    }
    tuples.set(tupleKey(M, m, p), [M, m, p])
  }

  let maxMajor = 0
  for (const c of consts) {
    const { major: M, minor: m, patch: p } = c
    addTuple(M, m, p)
    addTuple(M, m, p + 1) // 上侧紧邻（> / <= 边界处需要）
    addTuple(M, m, Math.max(p - 1, 0)) // 下侧紧邻（< / >= 边界处需要）
    addTuple(M, m + 1, 0) // minor 边界（x-range / ~ / ^ 的上界）
    addTuple(M + 1, 0, 0) // major 边界
    addTuple(M, 0, 0) // 该 major 的起点
    maxMajor = Math.max(maxMajor, M)
  }
  // 全局最小与"足够高"的哨兵：保证开区间 (max, +∞) 有代表
  addTuple(0, 0, 0)
  addTuple(maxMajor + 1, 0, 0)

  // 每个三元组的 prerelease 切点
  const preByTuple = new Map()
  for (const c of consts) {
    const k = tupleKey(c.major, c.minor, c.patch)
    if (!preByTuple.has(k)) {
      preByTuple.set(k, [])
    }
    const list = preByTuple.get(k)
    list.push(c.prerelease)
    list.push(bumpPrerelease(c.prerelease))
    if (c.prerelease.length > 1) {
      list.push(c.prerelease.slice(0, -1))
    }
  }

  const versions = []
  const seen = new Set()
  const push = (M, m, p, pre) => {
    const v = `${M}.${m}.${p}` + (pre.length ? '-' + pre.join('.') : '')
    if (seen.has(v)) {
      return
    }
    seen.add(v)
    versions.push(v)
  }

  for (const [k, [M, m, p]] of tuples) {
    // release 版本 + 该三元组在 pre 轴上的代表点
    push(M, m, p, [])
    push(M, m, p, [0]) // 最小 prerelease
    push(M, m, p, ['zzz']) // 足够大的 prerelease
    const cuts = preByTuple.get(k) || []
    for (const pre of cuts) {
      push(M, m, p, pre)
      push(M, m, p, bumpPrerelease(pre))
    }
  }
  return versions
}

// 核心：找反例。返回 null 表示找不到（即 sub ⊆ dom）。
const findWitness = (subRange, domRange) => {
  for (const v of discriminators(subRange, domRange)) {
    if (subRange.test(v) && !domRange.test(v)) {
      return v
    }
  }
  return null
}

const toRange = (r, options) => (r instanceof Range ? r : new Range(r, options))

const exactSubset = (sub, dom, options) => {
  options = parseOptions(options)
  if (sub === dom) {
    return true
  }
  const A = toRange(sub, options)
  const B = toRange(dom, options)
  return findWitness(A, B) === null
}

// 给出结论 + 反例 + 判别点规模（便于审计"到底比对了多少个点"）
const explainSubset = (sub, dom, options) => {
  options = parseOptions(options)
  const A = toRange(sub, options)
  const B = toRange(dom, options)
  const points = discriminators(A, B)
  const witness = findWitness(A, B)
  return {
    subset: witness === null,
    witness,
    sub: A.raw,
    dom: B.raw,
    points: points.length,
  }
}

module.exports = exactSubset
module.exports.exactSubset = exactSubset
module.exports.explainSubset = explainSubset
module.exports.discriminators = discriminators
