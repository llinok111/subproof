'use strict'

const t = require('tap')
const { spawnSync } = require('child_process')
const path = require('path')

const bin = path.resolve(__dirname, '../../bin/subproof.js')
const run = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })

t.test('判定模式：退出码 0 / 1 / 2', t => {
  const yes = run(['>=1 <3', '>=1 <2 || >=2 <3'])
  t.equal(yes.status, 0, '并集覆盖 → 0')
  t.match(yes.stdout, /subset/)

  const no = run(['>=1.0.0', '>=1.0.0 <2.0.0'])
  t.equal(no.status, 1, '不是子集 → 1')
  t.match(no.stdout, /counterexample: 2\.0\.0/, '给出反例版本')
  t.match(no.stdout, /not a subset/)

  const bad = run(['latest', '*'])
  t.equal(bad.status, 2, '无法解析 → 2')
  t.match(bad.stderr, /cannot parse range/)

  const usage = run([])
  t.equal(usage.status, 2, '缺参数 → 2')

  const unknown = run(['--nope', '1', '2'])
  t.equal(unknown.status, 2, '未知选项 → 2')
  t.end()
})

t.test('--json 输出可被机器消费', t => {
  const r = run(['--json', '0', '*'])
  t.equal(r.status, 0)
  const data = JSON.parse(r.stdout)
  t.equal(data.subset, true)
  t.equal(data.witness, null)
  t.ok(data.discriminators > 0)

  const r2 = run(['--json', '1.2.3', '1.2.4'])
  t.equal(r2.status, 1)
  const d2 = JSON.parse(r2.stdout)
  t.equal(d2.subset, false)
  t.equal(d2.witness, '1.2.3')
  t.end()
})

t.test('--compare 四种关系与 added/removed 方向', t => {
  const equal = JSON.parse(run(['--json', '--compare', '^1.2.3', '>=1.2.3 <2.0.0']).stdout)
  t.equal(equal.relation, 'equal')
  t.equal(equal.compatible, true)
  t.equal(equal.added, null)
  t.equal(equal.removed, null)

  const wider = run(['--json', '--compare', '^1.2.3', '>=1.0.0'])
  t.equal(wider.status, 1, '放宽视为不兼容')
  const w = JSON.parse(wider.stdout)
  t.equal(w.relation, 'widening')
  t.equal(w.added, '1.0.0', '新增的版本是 1.0.0（∈ 新范围、∉ 旧范围）')
  t.equal(w.removed, null)

  const narrower = run(['--json', '--compare', '>=1.0.0', '^1.2.3'])
  t.equal(narrower.status, 0, '收紧视为兼容')
  const n = JSON.parse(narrower.stdout)
  t.equal(n.relation, 'narrowing')
  t.equal(n.removed, '1.0.0', '被排除的版本是 1.0.0（∈ 旧范围、∉ 新范围）')
  t.equal(n.added, null)

  const inc = JSON.parse(run(['--json', '--compare', '^1.2.3', '^2.0.0']).stdout)
  t.equal(inc.relation, 'incomparable')
  t.equal(inc.removed, '1.2.3')
  t.equal(inc.added, '2.0.0')
  t.end()
})

t.test('--help / --version 可用，且不破坏上游 semver CLI', t => {
  const help = run(['--help'])
  t.equal(help.status, 0)
  t.match(help.stdout, /exact semver range containment/)

  const ver = run(['--version'])
  t.equal(ver.status, 0)
  t.match(ver.stdout, /^subproof \d+\.\d+\.\d+/)

  const semverBin = path.resolve(__dirname, '../../bin/semver.js')
  const up = spawnSync(process.execPath, [semverBin, '1.2.3', '^1.0.0'], { encoding: 'utf8' })
  t.equal(up.status, 0, '上游 semver CLI 仍然可用')
  t.match(up.stdout, /1\.2\.3/)
  t.end()
})

t.test('--include-prerelease 改变判定结果', t => {
  const off = run(['--json', '^1.2.3-pre.0', '*'])
  t.equal(JSON.parse(off.stdout).subset, false, '默认不含 prerelease')
  const on = run(['--json', '--include-prerelease', '^1.2.3-pre.0', '*'])
  t.equal(JSON.parse(on.stdout).subset, true, '开 includePrerelease 后成立')
  t.end()
})
