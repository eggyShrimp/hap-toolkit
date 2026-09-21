/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')
const { copyApp } = require('hap-dev-utils')
const { compile } = require('../lib')

describe('测试轻卡高级材质校验', () => {
  const platform = 'native'
  let projectRoot
  let buildDir
  let distDir
  let stats

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

    // 3. 编译（产物供后续断言使用）
    const result = await compile(platform, 'prod', false, { cwd: projectRoot })
    stats = result.stats
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
})
