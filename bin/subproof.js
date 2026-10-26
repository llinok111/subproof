#!/usr/bin/env node
// subproof — decide whether one semver range is fully contained in another,
// and name a counterexample when it is not.
//
// Exit codes:
//   0  yes (subset / compatible)
//   1  no  (not a subset / incompatible)
//   2  usage error or unparsable range
'use strict'

const { explainSubset } = require('../ranges/exact-subset.js')
const { version } = require('../package.json')

const USAGE = `
subproof ${version} — exact semver range containment with counterexamples

Usage
  subproof <sub> <dom>              is every version in <sub> also in <dom>?
  subproof --compare <old> <new>    what changed between two ranges?

Options
  --json                 machine-readable output
  --explain              show the counterexample (default in human mode)
  --include-prerelease   same as options.includePrerelease in the semver API
  -h, --help             this text
  -v, --version          print version

Exit codes
  0  sub ⊆ dom  (compare: equal or narrowing)
  1  sub ⊄ dom  (compare: widening or incomparable)
  2  usage error / unparsable range

Examples
  subproof ">=1 <3" ">=1 <2 || >=2 <3"
  subproof --compare "^1.2.3" ">=1.2.3 <2.0.0"
  subproof --json "0" "*"
`

const parseArgs = (argv) => {
  const out = {
    json: false,
    explain: false,
    compare: null,
    includePrerelease: false,
    positional: [],
    help: false,
    version: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      out.json = true
    } else if (a === '--explain') {
      out.explain = true
    } else if (a === '--include-prerelease') {
      out.includePrerelease = true
    } else if (a === '-h' || a === '--help') {
      out.help = true
    } else if (a === '-v' || a === '--version') {
      out.version = true
    } else if (a === '--compare') {
      // 取后面两个位置参数
      const rest = []
      for (let j = i + 1; j < argv.length; j++) {
        if (argv[j].startsWith('--')) {
          break
        }
        rest.push(argv[j])
      }
      out.compare = rest
      i += rest.length
    } else if (a.startsWith('--')) {
      throw new UsageError(`unknown option: ${a}`)
    } else {
      out.positional.push(a)
    }
  }
  return out
}

class UsageError extends Error {}

const fail = (message, code = 2) => {
  process.stderr.write(`subproof: ${message}\n`)
  process.exit(code)
}

const main = () => {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    if (e instanceof UsageError) {
      fail(e.message)
    }
    throw e
  }

  if (args.help) {
    process.stdout.write(USAGE.trimStart())
    return 0
  }
  if (args.version) {
    process.stdout.write(`subproof ${version}\n`)
    return 0
  }

  const options = args.includePrerelease ? { includePrerelease: true } : {}

  if (args.compare) {
    if (args.compare.length !== 2) {
      fail('--compare needs exactly two ranges')
    }
    const [oldRange, newRange] = args.compare
    let oldToNew, newToOld
    try {
      oldToNew = explainSubset(oldRange, newRange, options) // 新范围覆盖旧范围？
      newToOld = explainSubset(newRange, oldRange, options)
    } catch (e) {
      fail(`cannot parse range: ${e.message}`)
    }

    let relation
    // old ⊆ new → 新范围放宽；new ⊆ old → 新范围收紧
    if (oldToNew.subset && newToOld.subset) {
      relation = 'equal'
    } else if (oldToNew.subset) {
      relation = 'widening'
    } else if (newToOld.subset) {
      relation = 'narrowing'
    } else {
      relation = 'incomparable'
    }

    const compatible = relation === 'equal' || relation === 'narrowing'
    // oldToNew 的反例 ∈ old 且 ∉ new → 被新范围排除
    // newToOld 的反例 ∈ new 且 ∉ old → 新范围新增
    const removed = oldToNew.witness
    const added = newToOld.witness
    if (args.json) {
      process.stdout.write(JSON.stringify({
        relation,
        compatible,
        old: oldRange,
        new: newRange,
        added: relation === 'widening' || relation === 'incomparable' ? added : null,
        removed: relation === 'narrowing' || relation === 'incomparable' ? removed : null,
      }, null, 2) + '\n')
      return compatible ? 0 : 1
    }

    const mark = { equal: '=', widening: '>', narrowing: '<', incomparable: '!=' }[relation]
    process.stdout.write(`${mark} ${relation}\n`)
    process.stdout.write(`  old: ${oldRange}\n`)
    process.stdout.write(`  new: ${newRange}\n`)
    if (relation === 'widening') {
      process.stdout.write(`  newly accepted version: ${added}\n`)
    }
    if (relation === 'narrowing') {
      process.stdout.write(`  newly excluded version: ${removed}\n`)
    }
    if (relation === 'incomparable') {
      process.stdout.write(`  excluded by new range: ${removed}\n`)
      process.stdout.write(`  newly accepted by new range: ${added}\n`)
    }
    return compatible ? 0 : 1
  }

  if (args.positional.length !== 2) {
    process.stderr.write(USAGE.trimStart())
    return 2
  }

  const [sub, dom] = args.positional
  let res
  try {
    res = explainSubset(sub, dom, options)
  } catch (e) {
    fail(`cannot parse range: ${e.message}`)
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({
      subset: res.subset,
      sub,
      dom,
      witness: res.witness,
      discriminators: res.points,
    }, null, 2) + '\n')
  } else if (res.subset) {
    process.stdout.write('✓ subset\n')
    process.stdout.write(`  sub: ${sub}\n`)
    process.stdout.write(`  dom: ${dom}\n`)
    process.stdout.write(`  ${res.points} boundary version(s) checked\n`)
  } else {
    process.stdout.write('✗ not a subset\n')
    process.stdout.write(`  sub: ${sub}\n`)
    process.stdout.write(`  dom: ${dom}\n`)
    process.stdout.write(`  counterexample: ${res.witness}\n`)
    process.stdout.write('  (this version satisfies sub but not dom)\n')
  }
  return res.subset ? 0 : 1
}

process.exitCode = main()
