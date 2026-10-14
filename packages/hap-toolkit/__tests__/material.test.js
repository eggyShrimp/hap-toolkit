/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')
const { copyApp } = require('hap-dev-utils')
const { colorconsole } = require('@hap-toolkit/shared-utils')
const { compile } = require('../lib')

function lineOf(content, text) {
  const index = content.indexOf(text)
  return index === -1 ? -1 : content.slice(0, index).split('\n').length
}

describe('测试轻卡高级材质校验', () => {
  const platform = 'native'
  let projectRoot
  let buildDir
  let distDir
  let stats
  let materialLogs = []
  let cardDemoLine = -1
  let cardDemoScssLine = -1

  beforeAll(async () => {
    const testAppDir = path.resolve(__dirname, '../fixtures/app')
    projectRoot = await copyApp(testAppDir)
    buildDir = path.resolve(projectRoot, 'build')
    distDir = path.resolve(projectRoot, 'dist')

    // 1. CardDemo 改为轻卡 + solid，并使用低版本目标（验证不引入版本门槛）
    const manifestPath = path.join(projectRoot, 'src/manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath).toString())
    manifest.versionCode = 1
    manifest.router.widgets.CardDemo.type = 'lite'
    manifest.router.widgets.CardDemo.backgroundType = 'solid'
    manifest.router.widgets.CardDemo.minCardPlatformVersion = 1000
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

    // 2. 卡片样式：违规背景（非规范浅色、无深色适配）+ prefers-material 媒体条件
    const uxPath = path.join(projectRoot, 'src/CardDemo/index.ux')
    const ux = fs
      .readFileSync(uxPath, 'utf8')
      .replace(
        '  .demo-page {',
        [
          '  .demo-page {',
          '    background-color: #FF0000;',
          '  }',
          '  @media (prefers-material: glass) {',
          '    .demo-page {',
          '      color: #FFFFFF;',
          '    }',
          '  }',
          '  .demo-page {'
        ].join('\n')
      )
    fs.writeFileSync(uxPath, ux)

    // 3. 新增 CardDemoScss：内联预处理样式（scss）→ 源码行列号的映射验证
    const scssDir = path.join(projectRoot, 'src/CardDemoScss')
    fs.mkdirSync(scssDir, { recursive: true })
    const scssUx = [
      '<template>',
      '  <div class="demo-page-scss">',
      '    <text>{{text}}</text>',
      '  </div>',
      '</template>',
      '',
      '<style lang="scss">',
      '$brand: #FF0000;',
      '',
      '.demo-page-scss {',
      '  background-color: $brand;',
      '  .demo-page-scss-inner {',
      '    color: #FFFFFF;',
      '  }',
      '}',
      '</style>',
      '',
      '<script>',
      '  export default {',
      `    private: { text: 'scss card' }`,
      '  }',
      '</script>',
      ''
    ].join('\n')
    const scssPath = path.join(scssDir, 'index.ux')
    fs.writeFileSync(scssPath, scssUx)
    manifest.router.widgets.CardDemoScss = {
      name: 'CardDemoScss',
      component: 'index',
      path: '/CardDemoScss',
      type: 'lite',
      backgroundType: 'solid',
      minCardPlatformVersion: 1000
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

    // 4. 编译（收集材质诊断：源码阶段诊断经样式日志通道 colorconsole 输出），产物供后续断言使用
    const logs = []
    const originWarn = colorconsole.warn
    const originError = colorconsole.error
    colorconsole.warn = (...args) => logs.push(args.map((item) => String(item)).join(' '))
    colorconsole.error = (...args) => logs.push(args.map((item) => String(item)).join(' '))
    try {
      const result = await compile(platform, 'prod', false, { cwd: projectRoot })
      stats = result.stats
    } finally {
      colorconsole.warn = originWarn
      colorconsole.error = originError
    }
    materialLogs = logs.filter((item) => item.indexOf('[卡片高级材质]') > -1)

    cardDemoLine = lineOf(fs.readFileSync(uxPath, 'utf8'), 'background-color: #FF0000;')
    cardDemoScssLine = lineOf(fs.readFileSync(scssPath, 'utf8'), 'background-color: $brand;')
  }, 5 * 60 * 1000)

  it('违规轻卡输出材质诊断且不阻塞出包', () => {
    expect(stats.hasErrors()).toBe(false)

    const warnings = (stats.compilation.warnings || []).map((item) => item.message || String(item))
    const materialWarnings = warnings.filter((item) => item.indexOf('[卡片高级材质]') > -1)
    expect(materialWarnings.length).toBeGreaterThan(0)

    const messages = materialWarnings.join('\n')
    expect(messages).toContain('不符合规范')
    expect(messages).toContain('CardDemo')
    expect(messages).toContain('CardDemo/index.ux')
  })

  it('低版本目标仍编出 prefers-material 媒体条件', () => {
    const cssPath = path.join(buildDir, 'CardDemo/index.css.json')
    const styleRes = JSON.parse(fs.readFileSync(cssPath).toString())
    const conditions = []
    Object.keys(styleRes).forEach((key) => {
      const style = styleRes[key]
      if (style && Array.isArray(style['@MEDIA'])) {
        style['@MEDIA'].forEach((media) => conditions.push(media.condition))
      }
    })
    expect(conditions.join('\n')).toContain('prefers-material: glass')
  })

  it('rpk 产物照常产出', () => {
    const rpkFiles = glob.sync('*.rpk', { cwd: distDir })
    expect(rpkFiles.length).toBeGreaterThan(0)
  })

  it('源码阶段诊断：含诊断码、规范链接与 .ux 源码行列号', () => {
    expect(cardDemoLine).toBeGreaterThan(0)

    const lightLogs = materialLogs.filter(
      (item) =>
        item.indexOf('MATERIAL_SOLID_LIGHT_COLOR') > -1 &&
        item.indexOf(path.join('CardDemo', 'index.ux')) > -1
    )
    expect(lightLogs.length).toBeGreaterThan(0)
    const joined = lightLogs.join('\n')
    expect(joined).toContain('[卡片高级材质]')
    expect(joined).toContain('仅支持 #FFFFFF / #F5F5F5')
    expect(joined).toContain('规范参考：https://')
    expect(lightLogs.some((item) => item.indexOf('@' + cardDemoLine + ':') > -1)).toBe(true)

    const missingDark = materialLogs.filter(
      (item) =>
        item.indexOf('MATERIAL_SOLID_DARK_MISSING') > -1 &&
        item.indexOf(path.join('CardDemo', 'index.ux')) > -1
    )
    expect(missingDark.length).toBeGreaterThan(0)
  })

  it('内联 scss 样式经 source map 映射回 .ux 源码行', () => {
    expect(cardDemoScssLine).toBeGreaterThan(0)

    const scssLogs = materialLogs.filter(
      (item) =>
        item.indexOf('MATERIAL_SOLID_LIGHT_COLOR') > -1 &&
        item.indexOf(path.join('CardDemoScss', 'index.ux')) > -1
    )
    expect(scssLogs.length).toBeGreaterThan(0)
    expect(scssLogs.some((item) => item.indexOf('@' + cardDemoScssLine + ':') > -1)).toBe(true)
  })
})
