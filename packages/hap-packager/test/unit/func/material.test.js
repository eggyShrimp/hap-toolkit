/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const {
  parseColor,
  getRootMeta,
  isRootSelector,
  extractGradientColors,
  createMaterialContext,
  validateMaterialCard,
  DEFAULT_MATERIAL_RULES
} = require('../../../lib/validators/material')

const GRADIENT = JSON.stringify({
  values: [{ type: 'linearGradient', directions: ['to', 'bottom'], values: ['#ffffff', '#000000'] }]
})

const rootNode = { type: 'div', classList: ['card'] }

function codes(diagnostics) {
  return diagnostics.map((item) => item.code)
}

function validSolidStyles() {
  return {
    '.card': { backgroundColor: '#FFFFFF' },
    '@MEDIA': [
      {
        condition: 'screen and (prefers-color-scheme: dark)',
        '.card': { backgroundColor: '#1A1A1B' }
      }
    ]
  }
}

describe('validators/material 工具函数', () => {
  it('parseColor 支持 hex/rgb/rgba/transparent', () => {
    expect(parseColor('#fff')).toEqual({ hex: '#FFFFFF', alpha: 1 })
    expect(parseColor('#ffffff')).toEqual({ hex: '#FFFFFF', alpha: 1 })
    expect(parseColor('rgb(255,255,255)')).toEqual({ hex: '#FFFFFF', alpha: 1 })
    expect(parseColor('rgba(0,0,0,0.5)').alpha).toBe(0.5)
    expect(parseColor('#FFFFFF80').alpha).toBeCloseTo(128 / 255, 5)
    expect(parseColor('transparent').alpha).toBe(0)
  })

  it('parseColor 对动态值与未知格式返回 null', () => {
    expect(parseColor('{{bgColor}}')).toBeNull()
    expect(parseColor('oklch(0.7 0.1 200)')).toBeNull()
    expect(parseColor(undefined)).toBeNull()
  })

  it('getRootMeta 读取 classList 与 id', () => {
    expect(getRootMeta({ classList: ['a', 'b'], id: 'root' })).toEqual({
      classes: ['a', 'b'],
      id: 'root'
    })
    expect(getRootMeta({})).toEqual({ classes: [], id: '' })
  })

  it('isRootSelector 仅匹配简单选择器', () => {
    const meta = { classes: ['card', 'active'], id: 'root' }
    expect(isRootSelector('.card', meta)).toBe(true)
    expect(isRootSelector('.card.active', meta)).toBe(true)
    expect(isRootSelector('#root', meta)).toBe(true)
    expect(isRootSelector('.card .title', meta)).toBe(false)
    expect(isRootSelector('.card > .title', meta)).toBe(false)
    expect(isRootSelector('#other', meta)).toBe(false)
    expect(isRootSelector('.other', meta)).toBe(false)
  })

  it('extractGradientColors 解析编译产物中的渐变颜色', () => {
    expect(extractGradientColors(GRADIENT)).toEqual(['#ffffff', '#000000'])
    expect(extractGradientColors('not-json')).toEqual([])
    expect(extractGradientColors(undefined)).toEqual([])
  })

  it('createMaterialContext 内联样式优先并提取全部媒体条件', () => {
    const context = createMaterialContext({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: { classList: ['card'], style: { backgroundColor: '#F5F5F5' } },
      styles: {
        '.card': { backgroundColor: '#FFFFFF' },
        '@MEDIA': [
          {
            condition: 'screen and (prefers-color-scheme: dark)',
            '.card': { backgroundColor: '#1A1A1B' }
          },
          {
            condition: 'screen and (widget-size: 2x2)',
            '.card': { backgroundColor: 'rgba(0,0,0,0.5)' }
          }
        ]
      },
      bundleFilePath: 'CardDemo/index'
    })
    expect(context.base.backgroundColor).toBe('#F5F5F5')
    expect(context.medias.length).toBe(2)
    expect(context.medias[0].isDark).toBe(true)
    expect(context.medias[1].isDark).toBe(false)
  })
})

describe('validators/material 默认规则', () => {
  it('solid 合规卡片无诊断', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles: validSolidStyles(),
      bundleFilePath: 'CardDemo/index'
    })
    expect(diagnostics).toEqual([])
  })

  it('未声明 backgroundType 输出 INFO', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite' },
      templateRoot: rootNode,
      styles: {},
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_BACKGROUND_TYPE_MISSING')
    expect(diagnostics[0].level).toBe('info')
  })

  it('backgroundType 非法输出 ERROR', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'Solid' },
      templateRoot: rootNode,
      styles: {},
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_BACKGROUND_TYPE_INVALID')
  })

  it('solid 根节点未设置背景', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles: { '.card .inner': { backgroundColor: '#FFFFFF' } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_SOLID_ROOT_BACKGROUND_MISSING')
  })

  it('solid 使用 background-image', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles: { '.card': { backgroundImage: '/CardDemo/bg.png' } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_SOLID_BACKGROUND_IMAGE')
  })

  it('solid 使用 background 简写渐变', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles: { '.card': { background: GRADIENT } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_SOLID_BACKGROUND_GRADIENT')
  })

  it('solid 浅色背景色不合规范', () => {
    const styles = validSolidStyles()
    styles['.card'].backgroundColor = '#FF0000'
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles,
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_SOLID_LIGHT_COLOR')
  })

  it('solid 缺少深色模式适配', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles: { '.card': { backgroundColor: '#FFFFFF' } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_SOLID_DARK_MISSING')
  })

  it('solid 深色背景色不合规范（任一深色规则都校验）', () => {
    const styles = validSolidStyles()
    styles['@MEDIA'].push({
      condition: 'screen and (prefers-color-scheme: dark) and (widget-size: 2x2)',
      '.card': { backgroundColor: '#111111' }
    })
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles,
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_SOLID_DARK_COLOR')
  })

  it('solid 深色模式使用渐变', () => {
    const styles = validSolidStyles()
    styles['@MEDIA'][0]['.card'] = { background: GRADIENT }
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'solid' },
      templateRoot: rootNode,
      styles,
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_SOLID_DARK_IMAGE_OR_GRADIENT')
  })

  it('custom 透明背景输出 ERROR', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'custom' },
      templateRoot: rootNode,
      styles: { '.card': { backgroundColor: 'rgba(0,0,0,0.5)' } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_BACKGROUND_ALPHA')
  })

  it('任意媒体条件中的透明背景都会被检查', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'custom' },
      templateRoot: rootNode,
      styles: {
        '.card': { backgroundColor: '#FFFFFF' },
        '@MEDIA': [
          {
            condition: 'screen and (widget-size: 2x2)',
            '.card': { backgroundColor: 'rgba(255,255,255,0.8)' }
          }
        ]
      },
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_BACKGROUND_ALPHA')
  })

  it('渐变中的透明色也会被检查', () => {
    const gradient = JSON.stringify({
      values: [{ type: 'linearGradient', values: ['rgba(0,0,0,0.5)', '#000000'] }]
    })
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'custom' },
      templateRoot: rootNode,
      styles: { '.card': { background: gradient } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(codes(diagnostics)).toContain('MATERIAL_BACKGROUND_ALPHA')
  })

  it('custom 使用渐变或图片背景不产生背景类型诊断', () => {
    const gradientDiagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'custom' },
      templateRoot: rootNode,
      styles: { '.card': { background: GRADIENT } },
      bundleFilePath: 'CardDemo/index'
    })
    const imageDiagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'custom' },
      templateRoot: rootNode,
      styles: { '.card': { backgroundImage: '/CardDemo/bg.png' } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(gradientDiagnostics).toEqual([])
    expect(imageDiagnostics).toEqual([])
  })

  it('动态背景值不误报', () => {
    const diagnostics = validateMaterialCard({
      widgetKey: 'CardDemo',
      widgetConf: { type: 'lite', backgroundType: 'custom' },
      templateRoot: rootNode,
      styles: { '.card': { backgroundColor: '{{bgColor}}' } },
      bundleFilePath: 'CardDemo/index'
    })
    expect(diagnostics).toEqual([])
  })
})

describe('validators/material 规则可插拔', () => {
  it('自定义规则可与默认规则组合', () => {
    const customRule = {
      id: 'custom/always-warn',
      run() {
        return [{ level: 'warn', code: 'CUSTOM_RULE', message: '自定义规则命中' }]
      }
    }
    const diagnostics = validateMaterialCard(
      {
        widgetKey: 'CardDemo',
        widgetConf: { type: 'lite', backgroundType: 'custom' },
        templateRoot: rootNode,
        styles: {},
        bundleFilePath: 'CardDemo/index'
      },
      [...DEFAULT_MATERIAL_RULES, customRule]
    )
    expect(codes(diagnostics)).toContain('CUSTOM_RULE')
  })

  it('规则异常输出 WARN 且不影响其他规则', () => {
    const brokenRule = {
      id: 'custom/broken',
      run() {
        throw new Error('boom')
      }
    }
    const diagnostics = validateMaterialCard(
      {
        widgetKey: 'CardDemo',
        widgetConf: { type: 'lite', backgroundType: 'solid' },
        templateRoot: rootNode,
        styles: validSolidStyles(),
        bundleFilePath: 'CardDemo/index'
      },
      [...DEFAULT_MATERIAL_RULES, brokenRule]
    )
    expect(codes(diagnostics)).toContain('MATERIAL_RULE_ERROR')
  })

  it('传入空规则集时不产生诊断', () => {
    const diagnostics = validateMaterialCard(
      {
        widgetKey: 'CardDemo',
        widgetConf: { type: 'lite' },
        templateRoot: rootNode,
        styles: {},
        bundleFilePath: 'CardDemo/index'
      },
      []
    )
    expect(diagnostics).toEqual([])
  })
})
