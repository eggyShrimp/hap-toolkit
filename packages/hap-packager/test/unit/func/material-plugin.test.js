/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const { getStyleObjectId } = require('@hap-toolkit/shared-utils')
const { MaterialValidatePlugin } = require('../../../lib/plugins/material-validate-plugin')

function makeAsset(value) {
  const text = JSON.stringify(value)
  return { source: { source: () => text } }
}

function makeCompilation(assets) {
  return {
    warnings: [],
    errors: [],
    getAsset(name) {
      return assets[name]
    }
  }
}

function cardTemplate() {
  return { '#entry': { template: { type: 'div', classList: ['card'] } } }
}

function cardStyles() {
  return {
    [getStyleObjectId('CardDemo/index')]: {
      '.card': { backgroundColor: '#FF0000' }
    }
  }
}

function cardAssets(styleRes) {
  return {
    'CardDemo/index.template.json': makeAsset(cardTemplate()),
    'CardDemo/index.css.json': makeAsset(styleRes || cardStyles())
  }
}

function warningMessages(compilation) {
  return compilation.warnings.map((item) => item.message).join('\n')
}

describe('MaterialValidatePlugin', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'material-plugin-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeManifest(widgets) {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({ router: { widgets } }))
  }

  it('违规轻卡输出带卡片定位的 warnings', () => {
    writeManifest({ CardDemo: { type: 'lite', component: 'index', backgroundType: 'solid' } })
    const compilation = makeCompilation(cardAssets())
    new MaterialValidatePlugin({ pathSrc: tmpDir }).validate(compilation)

    const messages = warningMessages(compilation)
    expect(compilation.warnings.length).toBeGreaterThan(0)
    expect(messages).toContain('[卡片高级材质] ERROR')
    expect(messages).toContain('不符合规范')
    expect(messages).toContain('卡片 CardDemo')
    expect(messages).toContain('CardDemo/index.ux')
  })

  it('disabledRules 过滤指定规则', () => {
    writeManifest({ CardDemo: { type: 'lite', component: 'index', backgroundType: 'Solid' } })
    const plugin = new MaterialValidatePlugin({
      pathSrc: tmpDir,
      disabledRules: ['material/background-type-valid']
    })
    const compilation = makeCompilation(cardAssets())
    plugin.validate(compilation)
    expect(warningMessages(compilation)).not.toContain('不合法')
  })

  it('silentInfo 抑制 INFO 诊断', () => {
    writeManifest({ CardDemo: { type: 'lite', component: 'index' } })
    const styles = {
      [getStyleObjectId('CardDemo/index')]: {
        '.card': { backgroundColor: '#FFFFFF' },
        '@MEDIA': [
          {
            condition: 'screen and (prefers-color-scheme: dark)',
            '.card': { backgroundColor: '#1A1A1B' }
          }
        ]
      }
    }
    const normalCompilation = makeCompilation(cardAssets(styles))
    new MaterialValidatePlugin({ pathSrc: tmpDir }).validate(normalCompilation)
    expect(normalCompilation.warnings.length).toBe(1)
    expect(warningMessages(normalCompilation)).toContain('[卡片高级材质] INFO')

    const silentCompilation = makeCompilation(cardAssets(styles))
    new MaterialValidatePlugin({ pathSrc: tmpDir, silentInfo: true }).validate(silentCompilation)
    expect(silentCompilation.warnings.length).toBe(0)
  })

  it('默认跳过非轻卡', () => {
    writeManifest({ CardDemo: { type: 'js', component: 'index', backgroundType: 'solid' } })
    const compilation = makeCompilation(cardAssets())
    new MaterialValidatePlugin({ pathSrc: tmpDir }).validate(compilation)
    expect(compilation.warnings.length).toBe(0)

    const allCompilation = makeCompilation(cardAssets())
    new MaterialValidatePlugin({ pathSrc: tmpDir, onlyLite: false }).validate(allCompilation)
    expect(allCompilation.warnings.length).toBeGreaterThan(0)
  })

  it('产物缺失时静默跳过', () => {
    writeManifest({ CardDemo: { type: 'lite', component: 'index', backgroundType: 'solid' } })
    const compilation = makeCompilation({})
    new MaterialValidatePlugin({ pathSrc: tmpDir }).validate(compilation)
    expect(compilation.warnings.length).toBe(0)
  })

  it('getActiveRules 按 disabledRules 过滤', () => {
    const plugin = new MaterialValidatePlugin({
      pathSrc: tmpDir,
      disabledRules: ['material/solid-dark-color']
    })
    const rules = plugin.getActiveRules()
    expect(rules.some((rule) => rule.id === 'material/solid-dark-color')).toBe(false)
    expect(rules.length).toBeGreaterThan(0)
  })
})
