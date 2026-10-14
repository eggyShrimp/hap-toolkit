/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const { validateMaterialStyle, MATERIAL_SPEC_URL } = require('../../../lib/style/material')
const {
  expandTemplateValue,
  maskExpressions,
  unmaskValue
} = require('../../../lib/style/material/expression')
const { extractRootMeta } = require('../../../lib/template/root-meta')

const FILE_PATH = '/proj/src/CardDemo/index.ux'
const SOLID_CTX = {
  version: 1,
  backgroundType: 'solid',
  rootMeta: { classes: ['card'], id: '' }
}
const CUSTOM_CTX = {
  version: 1,
  backgroundType: 'custom',
  rootMeta: { classes: ['card'], id: '' }
}

function run(code, cardCtx, options) {
  return validateMaterialStyle(
    Object.assign(
      {
        code,
        filePath: FILE_PATH,
        cardCtx
      },
      options
    )
  )
}

function codes(result) {
  return result.map((item) => (item.reason.match(/诊断码：([A-Z_]+)/) || [])[1])
}

function find(result, code) {
  return result.filter((item) => item.reason.indexOf(code) > -1)
}

const SOLID_OK_LIGHT = '.card {\n  background-color: #FFFFFF;\n}\n'
const SOLID_OK_DARK =
  '@media (prefers-color-scheme: dark) {\n  .card {\n    background-color: #1A1A1B;\n  }\n}\n'

describe('style/material expression 值集合展开', () => {
  it('静态值退化为单元素集合', () => {
    expect(expandTemplateValue('#FFFFFF')).toEqual({ enumerable: true, values: ['#FFFFFF'] })
  })

  it('字面量与三元（可枚举）', () => {
    expect(expandTemplateValue('{{ "#FFFFFF" }}')).toEqual({
      enumerable: true,
      values: ['#FFFFFF']
    })
    const result = expandTemplateValue(
      '{{ mode === 1 ? "#FFFFFF" : mode === 2 ? "#F5F5F5" : "#FF0000" }}'
    )
    expect(result.enumerable).toBe(true)
    expect(result.values.sort()).toEqual(['#F5F5F5', '#FF0000', '#FFFFFF'])
  })

  it('拼接 / 纯函数 / 数组取值可枚举', () => {
    expect(expandTemplateValue('{{ "#F5" + "F5F5" }}')).toEqual({
      enumerable: true,
      values: ['#F5F5F5']
    })
    expect(expandTemplateValue('{{ join(["#F5", "F5F5"], "") }}')).toEqual({
      enumerable: true,
      values: ['#F5F5F5']
    })
    expect(expandTemplateValue('{{ ["#F5F5F5", "#FFFFFF"][0] }}')).toEqual({
      enumerable: true,
      values: ['#F5F5F5']
    })
  })

  it('数据路径 / 函数调用 / 白名单外运算不可枚举', () => {
    expect(expandTemplateValue('{{ themeColor }}').enumerable).toBe(false)
    expect(expandTemplateValue('{{ $t("card.title") }}').enumerable).toBe(false)
    expect(expandTemplateValue('{{ system.env.intentInfo }}').enumerable).toBe(false)
    expect(expandTemplateValue('{{ bg ?? "#fff" }}').enumerable).toBe(false)
    // && / || 的操作数即结果，含 unknown 即整体不可枚举
    expect(expandTemplateValue('{{ flag && "#FFFFFF" }}').enumerable).toBe(false)
    expect(expandTemplateValue('A{{a+b}}').enumerable).toBe(false)
  })

  it('条件为数据路径的三元取两支并集', () => {
    const result = expandTemplateValue('{{ mode === 2 ? "#FF0000" : "#FFFFFF" }}')
    expect(result.enumerable).toBe(true)
    expect(result.values.sort()).toEqual(['#FF0000', '#FFFFFF'])
  })

  it('掩码保持长度且可还原（含表达式内分号）', () => {
    const value = 'background-color: {{ join(["#F5", "F5F5"], ";") }}'
    const masked = maskExpressions(value)
    expect(masked.length).toBe(value.length)
    expect(masked.indexOf('{')).toBe(-1)
    expect(unmaskValue(masked)).toBe(value)
  })
})

describe('style/material 背景规范校验', () => {
  it('未声明 backgroundType 输出 INFO 且不报错', () => {
    const result = run(SOLID_OK_LIGHT + SOLID_OK_DARK, {
      version: 1,
      rootMeta: { classes: ['card'], id: '' }
    })
    expect(codes(result)).toEqual(['MATERIAL_BACKGROUND_TYPE_MISSING'])
    expect(result[0].reason.startsWith('INFO')).toBe(true)
  })

  it('合规 solid 卡片无诊断', () => {
    expect(run(SOLID_OK_LIGHT + SOLID_OK_DARK, SOLID_CTX)).toEqual([])
  })

  it('solid 根节点未设置背景（含子节点背景）输出 ERROR', () => {
    const result = run('.card .title {\n  background-color: #FFFFFF;\n}', SOLID_CTX)
    expect(codes(result)).toContain('MATERIAL_SOLID_ROOT_BACKGROUND_MISSING')
  })

  it('编译器已丢弃的声明不参与判定（background: #fff 表现为未设置背景）', () => {
    const result = run('.card {\n  background: #fff;\n}', SOLID_CTX)
    expect(codes(result)).toContain('MATERIAL_SOLID_ROOT_BACKGROUND_MISSING')
    expect(codes(result)).not.toContain('MATERIAL_SOLID_BACKGROUND_GRADIENT')
  })

  it('solid 使用 background-image / 渐变输出 ERROR', () => {
    const image = run('.card {\n  background-image: url("./a.png");\n}', SOLID_CTX)
    expect(codes(image)).toContain('MATERIAL_SOLID_BACKGROUND_IMAGE')
    const gradient = run(
      '.card {\n  background: linear-gradient(90deg, #FFFFFF, #F5F5F5);\n}',
      SOLID_CTX
    )
    expect(codes(gradient)).toContain('MATERIAL_SOLID_BACKGROUND_GRADIENT')
  })

  it('浅色非规范色输出 ERROR；rgb 等价写法与小写识别', () => {
    const result = run('.card {\n  background-color: #FF0000;\n}', SOLID_CTX)
    const diag = find(result, 'MATERIAL_SOLID_LIGHT_COLOR')[0]
    expect(diag).toBeTruthy()
    expect(diag.reason).toContain('"#FF0000"')
    expect(diag.reason).toContain('仅支持 #FFFFFF / #F5F5F5')
    expect(diag.reason).toContain(`规范参考：${MATERIAL_SPEC_URL}`)

    const rgb = run('.card {\n  background-color: rgb(255, 0, 0);\n}', SOLID_CTX)
    expect(codes(rgb)).toContain('MATERIAL_SOLID_LIGHT_COLOR')
    const lower = run('.card {\n  background-color: #f5f5f5;\n}', SOLID_CTX)
    expect(codes(lower)).not.toContain('MATERIAL_SOLID_LIGHT_COLOR')
  })

  it('静态与媒体条件内的半透明背景输出 alpha ERROR', () => {
    const base = run('.card {\n  background-color: rgba(255, 255, 255, 0.5);\n}', CUSTOM_CTX)
    expect(codes(base)).toContain('MATERIAL_BACKGROUND_ALPHA')

    const dark = run(
      SOLID_OK_LIGHT +
        '@media (prefers-color-scheme: dark) {\n  .card {\n    background-color: rgba(26, 26, 27, 0.8);\n  }\n}',
      SOLID_CTX
    )
    expect(codes(dark)).toContain('MATERIAL_BACKGROUND_ALPHA')

    const transparent = run('.card {\n  background-color: transparent;\n}', CUSTOM_CTX)
    expect(codes(transparent)).toContain('MATERIAL_BACKGROUND_ALPHA')
  })

  it('渐变内颜色半透明输出 alpha ERROR', () => {
    const result = run(
      '.card {\n  background: linear-gradient(90deg, rgba(255, 255, 255, 0.3), #FFFFFF);\n}',
      CUSTOM_CTX
    )
    expect(codes(result)).toContain('MATERIAL_BACKGROUND_ALPHA')
  })

  it('custom 使用图片 / 渐变放行（无透明度问题时不产生诊断）', () => {
    expect(
      run('.card {\n  background: linear-gradient(90deg, #FFFFFF, #F5F5F5);\n}', CUSTOM_CTX)
    ).toEqual([])
    expect(run('.card {\n  background-image: url("./a.png");\n}', CUSTOM_CTX)).toEqual([])
  })

  it('solid 深色适配缺失 / 色值不符 / 图片渐变输出 ERROR', () => {
    const missing = run(SOLID_OK_LIGHT, SOLID_CTX)
    expect(codes(missing)).toContain('MATERIAL_SOLID_DARK_MISSING')

    const invalidColor = run(
      SOLID_OK_LIGHT +
        '@media (prefers-color-scheme: dark) {\n  .card {\n    background-color: #000000;\n  }\n}',
      SOLID_CTX
    )
    expect(codes(invalidColor)).toContain('MATERIAL_SOLID_DARK_COLOR')

    const invalidForm = run(
      SOLID_OK_LIGHT +
        '@media (prefers-color-scheme: dark) {\n  .card {\n    background-image: url("./d.png");\n  }\n}',
      SOLID_CTX
    )
    expect(codes(invalidForm)).toContain('MATERIAL_SOLID_DARK_IMAGE_OR_GRADIENT')
  })

  it('多命中时取胜出声明', () => {
    const invalid = run(
      '.card {\n  background-color: #FFFFFF;\n}\n.card {\n  background-color: #FF0000;\n}',
      SOLID_CTX
    )
    expect(codes(invalid)).toContain('MATERIAL_SOLID_LIGHT_COLOR')

    const valid = run(
      '.card {\n  background-color: #FF0000;\n}\n.card {\n  background-color: #FFFFFF;\n}',
      SOLID_CTX
    )
    expect(codes(valid)).not.toContain('MATERIAL_SOLID_LIGHT_COLOR')
  })

  it('子节点 / 伪类 / 非法选择器不误报', () => {
    const child = run(
      SOLID_OK_LIGHT + SOLID_OK_DARK + '.card .title {\n  background-color: #FF0000;\n}',
      SOLID_CTX
    )
    expect(child).toEqual([])

    const pseudo = run(
      SOLID_OK_LIGHT + SOLID_OK_DARK + '.card:active {\n  background-color: #FF0000;\n}',
      SOLID_CTX
    )
    expect(pseudo).toEqual([])
  })

  it('动态表达式：可枚举逐值判定、不可枚举 WARN', () => {
    const enumerable = run(
      '.card {\n  background-color: {{ mode === 2 ? "#FF0000" : "#FFFFFF" }};\n}' + SOLID_OK_DARK,
      SOLID_CTX
    )
    const light = find(enumerable, 'MATERIAL_SOLID_LIGHT_COLOR')[0]
    expect(light).toBeTruthy()
    expect(light.reason).toContain('可能取值')
    expect(light.reason).toContain('"#FF0000"')

    const unresolvable = run(
      '.card {\n  background-color: {{ themeColor }};\n}' + SOLID_OK_DARK,
      SOLID_CTX
    )
    const unresolved = find(unresolvable, 'MATERIAL_BACKGROUND_UNRESOLVED')[0]
    expect(unresolved).toBeTruthy()
    expect(unresolved.reason.startsWith('WARN')).toBe(true)
    expect(unresolved.reason).toContain('访问数据路径 themeColor')
    expect(codes(unresolvable)).not.toContain('MATERIAL_SOLID_LIGHT_COLOR')
  })

  it('内联样式优先于样式表，且位置为 .ux 坐标', () => {
    const cardCtx = Object.assign({}, SOLID_CTX, {
      rootStyle: { backgroundColor: '#FFFFFF' },
      rootStyleLocation: { line: 3, column: 46 }
    })
    const ok = run('.card {\n  background-color: #FF0000;\n}' + SOLID_OK_DARK, cardCtx)
    expect(codes(ok)).not.toContain('MATERIAL_SOLID_LIGHT_COLOR')

    const dynamicInline = Object.assign({}, SOLID_CTX, {
      rootStyle: { backgroundColor: '{{ themeColor }}' },
      rootStyleLocation: { line: 3, column: 46 }
    })
    const result = run(SOLID_OK_LIGHT + SOLID_OK_DARK, dynamicInline)
    const unresolved = find(result, 'MATERIAL_BACKGROUND_UNRESOLVED')[0]
    expect(unresolved).toBeTruthy()
    expect(unresolved.line).toBe(3)
  })

  it('内联 background 简写参与判定（内联优先）', () => {
    const cardCtx = Object.assign({}, SOLID_CTX, {
      rootStyle: { background: 'linear-gradient(90deg, #FFFFFF, #F5F5F5)' },
      rootStyleLocation: { line: 2, column: 20 }
    })
    const result = run(SOLID_OK_LIGHT + SOLID_OK_DARK, cardCtx)
    expect(codes(result)).toContain('MATERIAL_SOLID_BACKGROUND_GRADIENT')
  })

  it('@import 合并内容参与判定，位置降级为文件级', () => {
    const merged = '.card {\n  background-color: #FF0000;\n}' + SOLID_OK_DARK
    const result = run('@import "./part.css";', SOLID_CTX, {
      mergedCode: merged,
      hasImport: true
    })
    expect(codes(result)).toContain('MATERIAL_SOLID_LIGHT_COLOR')
    expect(result[0].line).toBeUndefined()
    expect(result[0].column).toBeUndefined()
  })

  it('source map 映射位置，lineOffset 叠加片段起始行', () => {
    const { SourceMapGenerator } = require('source-map')
    const generator = new SourceMapGenerator({ file: 'index.js' })
    for (let line = 1; line <= 10; line++) {
      generator.addMapping({
        source: './src/CardDemo/index.ux',
        original: { line: line + 9, column: 0 },
        generated: { line, column: 0 }
      })
    }
    const sourceMap = generator.toJSON()
    const code = '.card {\n  background-color: #FF0000;\n}' + SOLID_OK_DARK

    const mapped = run(code, SOLID_CTX, { materialPosition: { sourceMap } })
    expect(mapped[0].line).toBe(11)

    const offset = run(code, SOLID_CTX, { materialPosition: { sourceMap, lineOffset: 5 } })
    expect(offset[0].line).toBe(15)
  })

  it('规则可插拔：disabledRules / 自定义规则 / silentInfo', () => {
    const code = '.card {\n  background-color: #FF0000;\n}' + SOLID_OK_DARK
    expect(
      codes(run(code, SOLID_CTX, { disabledRules: ['material/solid-light-color'] }))
    ).not.toContain('MATERIAL_SOLID_LIGHT_COLOR')
    expect(run(code, SOLID_CTX, { rules: [] })).toEqual([])
    expect(
      run(
        SOLID_OK_LIGHT + SOLID_OK_DARK,
        { version: 1, rootMeta: { classes: ['card'] } },
        {
          silentInfo: true
        }
      )
    ).toEqual([])
  })

  it('单条规则异常输出 WARN 不中断', () => {
    const result = run(SOLID_OK_LIGHT, SOLID_CTX, {
      rules: [
        {
          id: 'material/boom',
          run() {
            throw new Error('boom')
          }
        }
      ]
    })
    expect(codes(result)).toContain('MATERIAL_RULE_ERROR')
  })

  it('上下文缺失 / 版本未知 / 根节点信息缺失时跳过', () => {
    expect(run(SOLID_OK_LIGHT, undefined)).toEqual([])
    expect(run(SOLID_OK_LIGHT, Object.assign({}, SOLID_CTX, { version: 2 }))).toEqual([])
    expect(
      run(SOLID_OK_LIGHT, Object.assign({}, SOLID_CTX, { rootMeta: { classes: [], id: '' } }))
    ).toEqual([])
  })

  it('id 选择器可命中根节点', () => {
    const cardCtx = {
      version: 1,
      backgroundType: 'solid',
      rootMeta: { classes: [], id: 'root' }
    }
    const result = run('#root {\n  background-color: #FF0000;\n}' + SOLID_OK_DARK, cardCtx)
    expect(codes(result)).toContain('MATERIAL_SOLID_LIGHT_COLOR')
  })
})

describe('template/root-meta 根节点提取', () => {
  it('提取静态 class / id / 内联背景声明与位置', () => {
    const content =
      '\n  <div class="card-wrapper foo" id="root" style="background-color: #FFFFFF; color: red;">\n    <text>hi</text>\n  </div>\n'
    const meta = extractRootMeta(content)
    expect(meta.classes).toEqual(['card-wrapper', 'foo'])
    expect(meta.id).toBe('root')
    expect(meta.rootStyle).toEqual({ backgroundColor: '#FFFFFF' })
    expect(meta.styleLocation).toBeTruthy()
    expect(meta.styleLocation.line).toBe(2)
  })

  it('表达式内联样式保留原文（含三元中的冒号）', () => {
    const meta = extractRootMeta(
      '<div class="card" style="background-color: {{ mode === 1 ? \'#FFFFFF\' : \'#F5F5F5\' }};">x</div>'
    )
    expect(meta.rootStyle.backgroundColor).toBe("{{ mode === 1 ? '#FFFFFF' : '#F5F5F5' }}")
  })

  it('动态 class 取不到时返回 null（降级跳过）', () => {
    expect(extractRootMeta('<div class="{{ klass }}">x</div>')).toBeNull()
  })

  it('动态 id 视为取不到', () => {
    const meta = extractRootMeta('<div class="card" id="{{ id }}">x</div>')
    expect(meta.id).toBe('')
  })
})
