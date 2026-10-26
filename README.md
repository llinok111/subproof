# subproof

判断一个 semver 范围是否**完整落在**另一个范围里；答案是否定时，给出一个**具体的反例版本**。

基于 [`npm/node-semver`](https://github.com/npm/node-semver) 7.8.5（ISC），保留完整上游历史。
上游的 `ranges/subset.js` 一行未动；本项目新增一个与之并列的精确判定器 `ranges/exact-subset.js`。

```
$ npx subproof ">=1 <3" ">=1 <2 || >=2 <3"
✓ subset
  sub: >=1 <3
  dom: >=1 <2 || >=2 <3
  38 boundary version(s) checked

$ npx subproof ">=1 <2 || >=2 <3" ">=1 <3"     # 反向
✗ not a subset
  counterexample: 3.0.0
```

## 为什么需要它

`semver.subset(a, b)` 已经存在于上游，绝大多数情况下是对的：**在 182,492 次真实依赖声明的比较中，一致率 99.991%**。
剩下的 0.009% 集中在四类写法上，且全部是「漏判」（说不是子集，其实是）：

| 类型 | 真实案例（来自真实 package.json） | 上游 7.8.5 | 真实语义 |
|---|---|---|---|
| 多分支并集覆盖 | `>=7.0.0` ⊆ `^6.0.0 \|\| ^7.0.0 \|\| >=8.0.0` | `false` | `true` |
| 通配符左界 | `0` ⊆ `*`（真实 `istanbul` 声明） | `false` | `true` |
| 零主版本 caret | `^0.0.8` ⊆ `0.0.8`（真实 `sse`／`faucet` 声明） | `false` | `true` |
| 上界写法等价 | `>= 2.1.2 < 3.0.0` ⊆ `>= 2.1.2 < 3` | `false` | `true` |

上游判定是启发式：把每个 AND 组压成一个区间后逐条比对（`ranges/subset.js:9-43` 的注释就是这份规则表），
因此它无法表达「B 的多个分支拼起来刚好盖住 A」，以及「所有版本都不小于 0.0.0」这类事实。
上游仓库当前有 **5 个未合并的 subset 修复 PR**（#703 / #854 / #889 / #894 / #896 / #911 / #919），方向与本项目一致。

本项目的取舍是：**不修改上游的 `subset()`**，另外提供一个可以自证正确的判定器，并把「上游会判错」这件事写成回归测试。
修复上游是上游的事；使用者需要的是拿到正确结论和反例。

## 判定方式

`satisfies(v, range)` 的真值只依赖三件事：

1. `v` 的 `(major,minor,patch)` 是否与某个常量相同；
2. `v` 与常量集合中每个版本的 `compare()` 符号；
3. 三元组相同时，`v.prerelease` 与该常量 `prerelease` 的符号。

所以整个版本空间可以按常量划分成有限个等价类，**每类取一个代表版本逐点验证**即可。
`ranges/exact-subset.js` 生成判别点网格：

- 每个常量三元组本身，以及它的前后相邻三元组（`p-1`、`p+1`、`m+1.0`、`M+1.0.0`、`M.0.0`）；
- 每个三元组在 prerelease 轴上的代表：最小（`-0`）、最大（`-zzz`）、每个切点、每个切点的**直接后继**（`alpha` → `alpha.0`）；
- 全局最小 `0.0.0-0` 与一个高于所有常量的哨兵。

判定结果同时给出反例，反例可以直接用 `satisfies()` 复核。这比「返回一个布尔值」更有用：
审计场景里你需要知道**到底哪个版本不在范围内**。

## 安装

```bash
npm install github:llinok111/subproof
```

包名是 `subproof`（不是 `semver`），不会覆盖你项目里已有的官方 `semver`。
`require('subproof')` 与官方 `semver` 的 API 完全一致，新增能力在 `subproof/ranges/exact-subset`。

## CLI

```
subproof <sub> <dom>              判定；退出码 0 = 是子集，1 = 不是，2 = 用法/解析错误
subproof --compare <old> <new>    两个范围之间的关系
选项
  --json                机器可读输出
  --include-prerelease  同 semver 的 options.includePrerelease
  -h, --help  -v, --version
```

`--compare` 的关系判定与退出码：

| relation | 含义 | 退出码 |
|---|---|---|
| `equal` | 两个范围等价 | 0 |
| `narrowing` | 新范围收紧，输出被排除的版本 | 0 |
| `widening` | 新范围放宽，输出新接受的版本 | 1 |
| `incomparable` | 互不包含，两侧各输出一个版本 | 1 |

```bash
$ subproof --compare ">=1.0.0" "^1.2.3"
< narrowing
  old: >=1.0.0
  new: ^1.2.3
  newly excluded version: 1.0.0
```

适合放进 CI 当门禁：`subproof --compare "$OLD" "$NEW" || exit 1`（依赖范围被放宽时失败）。

## API

```js
const exactSubset = require('subproof/ranges/exact-subset')

exactSubset('>=1 <3', '>=1 <2 || >=2 <3')          // true
exactSubset('^1.2.3', '>=1.2.3 <2.0.0')            // true（等价写法）
exactSubset('1.2.3-alpha', '<=3.0.0')              // false（prerelease 不属于 release 范围）

exactSubset.explainSubset('>=1.0.0', '>=1.0.0 <2.0.0')
// { subset: false, witness: '2.0.0', sub, dom, points: 11 }

exactSubset.discriminators(rangeA, rangeB)         // 判别点列表（审计用：到底比了哪些版本）
```

## 证据（全部可复现）

| 项目 | 命令 | 结果 |
|---|---|---|
| 上游基线 | `npx tap`（改动前） | 53 套件 / 23,071 断言全绿 |
| 改动后回归 | `npx tap` | **55 套件 / 23,326 断言全绿**（新增 255 条） |
| 上游 82 条公开用例 | `test/ranges/exact-subset.js` 第 1 组 | **100% 一致**，无一偏离 |
| 真实 npm 语料差分 | `node scripts/diff-real-corpus.cjs <目录...> test/fixtures/real-corpus-diff.json` | 3,808 个 `package.json`、3,320 个包名、92,315 组配对、182,492 次比较 → 一致 99.991%，**上游判错 16 处，逐条人工核验** |
| 合成用例差分 | `node scripts/diff-synthetic.cjs 1500` | 上游过宽 18 处（反例 **18/18** 经 `satisfies` 复核）、过严 38 处、本实现 0 处漏检 |
| 演示页验收 | `node scripts/verify-demo.cjs` | 真实浏览器 3 案例 × 6 断言 + 截图像素统计（1444 色 / 墨迹 7.6% / 三个语义色命中）→ **24/24** |
| 打包可复现 | `node scripts/build-demo.cjs` 连跑两次 | `sha256=c9f26a3a…` 完全一致 |

`scripts/` 里的三个差分脚本需要指向本机的 `node_modules` 目录，因此在 CI 上不跑（CI 跑完整测试与打包复现）。

## 已知限制

- 判定的是 **semver 范围语义**（`Range.test` 的口径，含「无 prerelease 比较器则不匹配 prerelease 版本」这条规则）。
  它不等于「npm 实际会装哪个版本」——`dist-tag`、`npm:` 别名、`workspace:` / `catalog:` 协议、overrides 都不在范围内。
- 判别点数量随两个范围的分支数增长。实测 10 个分支（`>=1.0.0` 对 `^1..^10` 并集）约 300 点，单次判定 < 1 ms；
  没有做流式裁剪，分支数上千时点数会随之增长（未测）。
- 上游 `loose` 模式只影响解析，不影响判定逻辑；本项目未对其单独验收。
- 本项目**不修复上游**。`semver.subset()` 保持原样，上游 5 个 PR 的取舍由上游决定。
- 真实语料中的 16 处差异全部属于上面四类写法；如果你的依赖范围里没有这些形态，本项目与上游结论一致。

## 相对上游的改动

- **改动**：`package.json`（name=subproof、version、`bin` 增加 `subproof`、repository/description/keywords）、`README.md`
- **新增**：`ranges/exact-subset.js`、`bin/subproof.js`、`test/ranges/exact-subset.js`、`test/bin/subproof.js`、
  `test/fixtures/exact-subset-real.json`、`test/fixtures/real-corpus-diff.json`、`scripts/`、`docs/`、`.gitattributes`
- **未改动**：`classes/`、`functions/`、`internal/`、`ranges/` 下其余文件（含 `ranges/subset.js`）、`index.js`、上游 `test/`
- 上游的 npm 发布类 workflow 在 fork 上无法工作（会向 `semver` 名字发布），替换为仅做验证的 `ci.yml`。

## 演示页

`docs/` 可直接作为 GitHub Pages 目录：判定 + 与上游结论对比 + release 区间条形图 + 5 个预置案例（含 4 个真实语料案例）。
页面零网络请求；先跑 `node scripts/build-demo.cjs` 生成 `docs/subproof.bundle.js` 即可离线打开。

## 许可证与来源

- 上游 [`npm/node-semver`](https://github.com/npm/node-semver) 采用 **ISC**，本 fork 沿用同一许可证（`LICENSE` 逐字未改）。
- 上游 README 原文保留在 `docs/UPSTREAM-README.md`；上游实现与测试全部保留在仓库中，可按提交历史逐条对比。
