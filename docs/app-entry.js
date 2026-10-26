// 演示页打包入口：把库暴露到 window，页面本身不打包任何业务逻辑之外的东西。
const semver = require('../index.js')
const exact = require('../ranges/exact-subset.js')

window.__subproof = {
  version: require('../package.json').version,
  subset: semver.subset,
  satisfies: semver.satisfies,
  SemVer: semver.SemVer,
  Range: semver.Range,
  explainSubset: exact.explainSubset,
  exactSubset: exact.exactSubset,
}
