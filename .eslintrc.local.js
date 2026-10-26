'use strict'

module.exports = {
  // docs/subproof.bundle.js 是 esbuild 的构建产物（由 scripts/build-demo.cjs 生成），
  // 它必须与源文件一起提交，但不该按源码标准检查。
  ignorePatterns: ['docs/subproof.bundle.js'],
  overrides: [
    {
      files: ['bin/**', 'classes/**', 'functions/**', 'internal/**', 'ranges/**'],
      rules: {
        'import/no-extraneous-dependencies': [
          'error',
          {
            devDependencies: false,
          },
        ],
        'import/no-nodejs-modules': ['error'],
        strict: ['error', 'global'],
      },
    },
  ],
}
