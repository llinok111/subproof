// 演示页验收：真实浏览器执行 + DOM 断言 + 截图像素统计。
// 用法：node scripts/verify-demo.mjs [--url <地址>]
// 退出码 0 = 全部通过，1 = 有失败项。
'use strict'

const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { inflateSync } = require('node:zlib')

const root = resolve(__dirname, '..')
const shots = resolve(root, 'shots')
mkdirSync(shots, { recursive: true })

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
const edge = EDGE_CANDIDATES.find(existsSync)
if (!edge) {
  console.error('未找到 Edge，可跳过浏览器验收（CI 上不阻塞）')
  process.exit(0)
}

const argUrl = process.argv.indexOf('--url')
const baseUrl = argUrl > -1
  ? process.argv[argUrl + 1]
  : 'file:///' + resolve(root, 'docs/index.html').replace(/\\/g, '/')

const failures = []
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  if (!ok) {
    failures.push(name + (detail ? ' — ' + detail : ''))
  }
}

const runEdge = (args) => spawnSync(edge, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--virtual-time-budget=4000', ...args,
], { encoding: 'utf8', timeout: 60000 })

// ---- 1) DOM 断言（三个案例）
const cases = [
  {
    name: '并集覆盖（exact=true，上游=false）',
    hash: '#sub=' + encodeURIComponent('>=1 <3') + '&dom=' + encodeURIComponent('>=1 <2 || >=2 <3'),
    expect: { verdict: '是子集', exact: 'true', upstream: 'false', divergence: true, witness: '无' },
  },
  {
    name: '普通反例（两者都说 false）',
    hash: '#sub=' + encodeURIComponent('>=1.0.0') + '&dom=' + encodeURIComponent('>=1.0.0 <2.0.0'),
    expect: { verdict: '不是子集', exact: 'false', upstream: 'false', divergence: false, witness: '2.0.0' },
  },
  {
    name: '零主版本（exact=true，上游=false）',
    hash: '#sub=0&dom=' + encodeURIComponent('*'),
    expect: { verdict: '是子集', exact: 'true', upstream: 'false', divergence: true, witness: '无' },
  },
]

for (const c of cases) {
  const dom = runEdge(['--dump-dom', baseUrl + c.hash]).stdout || ''
  const text = dom.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  check(c.name + '：结论正确', text.includes(c.expect.verdict), `期望包含「${c.expect.verdict}」`)
  const exactCell = /subproof\s+(true|false)/.exec(text)
  check(c.name + '：subproof 列', !!exactCell && exactCell[1] === c.expect.exact,
    exactCell ? exactCell[1] : '未取到')
  const upCell = /semver\.subset\(\)\s*(true|false|解析失败)/.exec(text)
  check(c.name + '：上游列', !!upCell && upCell[1] === c.expect.upstream,
    upCell ? upCell[1] : '未取到')
  check(c.name + '：分歧提示', text.includes('两者结论不同') === c.expect.divergence)
  check(c.name + '：反例字段', text.includes(c.expect.witness), `期望包含 ${c.expect.witness}`)
  // 区间条：sub 轨道 + dom 轨道至少各一条
  const segs = (dom.match(/class="seg (sub|dom)"/g) || []).length
  check(c.name + '：区间条渲染', segs >= 2, `seg 元素 ${segs} 个`)
}

// ---- 2) 截图像素统计（证明不是白屏，且关键语义色确实生效）
const png = resolve(shots, 'demo.png')
runEdge(['--window-size=1000,1500', '--screenshot=' + png, baseUrl])

const decodePng = (buf) => {
  if (buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('不是 PNG')
  }
  let off = 8
  let width = 0; let height = 0; let bitDepth = 0; let colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`不支持的 PNG 格式 bitDepth=${bitDepth} colorType=${colorType}`)
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) {
        v += a
      } else if (filter === 2) {
        v += b
      } else if (filter === 3) {
        v += (a + b) >> 1
      } else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, bpp, data: out }
}

if (existsSync(png)) {
  try {
    const img = decodePng(readFileSync(png))
    const { width, height, bpp, data } = img
    const colors = new Map()
    let ink = 0
    let red = 0; let green = 0; let navy = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * bpp
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2]
        const key = (r << 16) | (g << 8) | b
        colors.set(key, (colors.get(key) || 0) + 1)
        if (r < 245 || g < 245 || b < 245) {
          ink++
        }
        // 语义色命中（容差 ±6，抗锯齿边缘不算）
        if (Math.abs(r - 0xDC) < 6 && Math.abs(g - 0x14) < 6 && Math.abs(b - 0x3C) < 6) {
          red++
        }
        if (Math.abs(r - 0x00) < 6 && Math.abs(g - 0x80) < 6 && Math.abs(b - 0x00) < 6) {
          green++
        }
        if (Math.abs(r - 0x00) < 6 && Math.abs(g - 0x00) < 6 && Math.abs(b - 0x80) < 6) {
          navy++
        }
      }
    }
    const total = width * height
    check('截图：尺寸合理', width >= 900 && height >= 1000, `${width}×${height}`)
    check('截图：非白屏（去重色数 > 20）', colors.size > 20, `${colors.size} 种颜色`)
    check('截图：墨迹占比 3%–80%', ink / total > 0.03 && ink / total < 0.8,
      `${(100 * ink / total).toFixed(1)}%`)
    check('截图：成功色 #008000 出现', green > 50, `${green} px`)
    check('截图：分歧色 #DC143C 出现', red > 50, `${red} px`)
    check('截图：强调色 #000080 出现', navy > 200, `${navy} px`)
  } catch (e) {
    check('截图：像素统计', false, e.message)
  }
} else {
  check('截图：文件生成', false, png)
}

// ---- 输出
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`)
}
console.log(`\n${results.filter(r => r.ok).length}/${results.length} 通过`)
if (failures.length) {
  console.error('\n失败项:\n' + failures.map(f => '  - ' + f).join('\n'))
  process.exit(1)
}
