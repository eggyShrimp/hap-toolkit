/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 轻卡高级材质：背景规范校验规则集（编译器侧）
 *
 * 规则来源：《快应用卡片高级材质适配 — 需求文档》§2.1 编译时校验
 * - backgroundType: solid  → 根节点必须为规范纯色（浅色 #FFFFFF/#F5F5F5，深色 #1A1A1B），
 *                           且不允许 background-image / background 简写渐变、透明度，并需适配深色模式
 * - backgroundType: custom / 未声明（默认 custom） → 根节点背景不允许有透明度
 *
 * 规则以可插拔数组形式提供：调用方可通过 rules（扩展 / 替换）、disabledRules（按 id 禁用）、
 * silentInfo（静默 INFO）裁剪或扩展默认规则集；标准未定稿时可按平台 / 业务调整。
 *
 * 规则函数签名：rule.run(context) -> Diagnostic[]
 * Diagnostic: { level: 'error' | 'warn' | 'info', code, message, position?, origin? }
 *
 * 动态表达式口径：背景值中的 {{expr}} 由 context 展开为可能取值集合（cell.values），
 * 可枚举时逐值判定（含违规值 → ERROR，附违规子集）；不可枚举时由
 * MATERIAL_BACKGROUND_UNRESOLVED 统一 WARN——不误报、不静默放过。
 */

import { validate as validateDelaration } from '../validator'

export const MATERIAL_LEVEL = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info'
}

export const BACKGROUND_TYPE_SOLID = 'solid'
export const BACKGROUND_TYPE_CUSTOM = 'custom'

// 规范纯色（需求文档 §1.1）
export const LIGHT_BACKGROUND_COLORS = ['#FFFFFF', '#F5F5F5']
export const DARK_BACKGROUND_COLOR = '#1A1A1B'

const REGEXP_HEX_LONG = /^#([0-9a-f]{6})$/i
const REGEXP_HEX_LONG_ALPHA = /^#([0-9a-f]{8})$/i
const REGEXP_HEX_SHORT = /^#([0-9a-f]{3})$/i
const REGEXP_HEX_SHORT_ALPHA = /^#([0-9a-f]{4})$/i
const REGEXP_RGB = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
const REGEXP_HSL_ALPHA = /^hsla\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([\d.]+)\s*\)$/i

/**
 * 解析颜色值为 { hex, alpha }。
 * 无法识别时返回 null，由调用方跳过校验以避免误报（动态值、编译器不支持的现代颜色语法等）。
 *
 * @param {*} value - 颜色值
 * @returns {{hex: String|null, alpha: number|null}|null}
 */
export function parseColor(value) {
  if (typeof value !== 'string') {
    return null
  }
  const v = value.trim()
  if (!v || v.indexOf('{{') > -1) {
    return null
  }

  let match
  if ((match = v.match(REGEXP_HEX_LONG))) {
    return { hex: '#' + match[1].toUpperCase(), alpha: 1 }
  }
  if ((match = v.match(REGEXP_HEX_LONG_ALPHA))) {
    const alpha = parseInt(match[1].slice(6), 16) / 255
    return { hex: '#' + match[1].slice(0, 6).toUpperCase(), alpha }
  }
  if ((match = v.match(REGEXP_HEX_SHORT))) {
    const [r, g, b] = match[1]
    return { hex: `#${r}${r}${g}${g}${b}${b}`.toUpperCase(), alpha: 1 }
  }
  if ((match = v.match(REGEXP_HEX_SHORT_ALPHA))) {
    const [r, g, b, a] = match[1]
    return {
      hex: `#${r}${r}${g}${g}${b}${b}`.toUpperCase(),
      alpha: parseInt(a, 16) / 15
    }
  }
  if ((match = v.match(REGEXP_RGB))) {
    const [, r, g, b, a] = match
    const hex =
      '#' +
      [r, g, b]
        .map((it) => parseInt(it, 10).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    return { hex, alpha: a === undefined ? 1 : parseFloat(a) }
  }
  if ((match = v.match(REGEXP_HSL_ALPHA))) {
    // hsl 的具体色值不参与规范比对，仅提取透明度
    return { hex: null, alpha: parseFloat(match[1]) }
  }
  if (/^hsl\(/i.test(v)) {
    return { hex: null, alpha: 1 }
  }
  if (v === 'transparent') {
    return { hex: null, alpha: 0 }
  }
  return null
}

/**
 * 从编译后的 background 简写值（JSON 字符串）中提取渐变颜色
 * 形如：{"values":[{"type":"linearGradient","values":["#ffffff","#000000"]}]}
 *
 * @param {*} backgroundValue - background 值
 * @returns {String[]} 渐变中出现的颜色值
 */
export function extractGradientColors(backgroundValue) {
  if (typeof backgroundValue !== 'string') {
    return []
  }
  let parsed
  try {
    parsed = JSON.parse(backgroundValue)
  } catch (err) {
    return []
  }
  const colors = []
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node && typeof node === 'object') {
      Object.keys(node).forEach((key) => walk(node[key]))
      return
    }
    if (typeof node === 'string' && parseColor(node)) {
      colors.push(node)
    }
  }
  walk(parsed)
  return colors
}

/**
 * 从 background 单元格的任一取值中提取渐变颜色。
 * 取值可能为编译后的 JSON 结构或 CSS 渐变源码（动态表达式展开结果），
 * 后者交给编译器既有校验器转换后提取。
 *
 * @param {*} value - background 取值
 * @returns {String[]}
 */
export function gradientColorsOfValue(value) {
  if (typeof value !== 'string') {
    return []
  }
  const fromJson = extractGradientColors(value)
  if (fromJson.length) {
    return fromJson
  }
  const result = validateDelaration('background', value)
  if (result.log) {
    return []
  }
  const transformed = result.value && result.value[0] && result.value[0].v
  return extractGradientColors(transformed)
}

/**
 * 判断一个样式选择器是否直接作用于卡片根节点。
 * 仅接受简单选择器（class/id 组合）；后代/子代等组合选择器作用于子节点，不参与判定。
 *
 * @param {String} selector
 * @param {{classes: String[], id: String}} rootMeta
 * @returns {Boolean}
 */
export function isRootSelector(selector, rootMeta) {
  if (typeof selector !== 'string' || !selector) {
    return false
  }
  if (/[\s>+~]/.test(selector)) {
    // 组合选择器（如 `.card .title`）作用对象不是根节点
    return false
  }
  const clean = selector.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '')
  const classes = []
  const ids = []
  const REGEXP_CLASS = /\.([A-Za-z0-9_-]+)/g
  const REGEXP_ID = /#([A-Za-z0-9_-]+)/g
  let match
  while ((match = REGEXP_CLASS.exec(clean))) {
    classes.push(match[1])
  }
  while ((match = REGEXP_ID.exec(clean))) {
    ids.push(match[1])
  }
  if (!classes.length && !ids.length) {
    return false
  }
  const meta = rootMeta || {}
  const metaClasses = meta.classes || []
  const metaId = meta.id || ''
  if (ids.some((id) => id !== metaId)) {
    return false
  }
  return classes.every((cls) => metaClasses.indexOf(cls) > -1)
}

/**
 * 判断媒体条件是否为深色模式（prefers-color-scheme: dark）
 */
export function isDarkCondition(condition) {
  return typeof condition === 'string' && /prefers-color-scheme\s*:\s*dark/i.test(condition)
}

function diagnostic(level, code, message, cell) {
  return {
    level,
    code,
    message,
    position: cell && cell.position,
    origin: cell && cell.origin
  }
}

function quote(value) {
  return typeof value === 'string' ? `"${value}"` : String(value)
}

/**
 * 取单元格的可能取值集合与不可枚举原因
 */
function cellValues(cell) {
  if (!cell || cell.values === null) {
    return null
  }
  return cell.values
}

function isDynamic(value) {
  return typeof value === 'string' && value.indexOf('{{') > -1
}

/**
 * 将违规取值格式化为消息片段：静态值用原文，动态值附「可能取值」子集
 */
function formatViolation(cell, invalidValues) {
  if (isDynamic(cell.raw)) {
    const all = (cell.values || []).map(quote).join(', ')
    const invalid = invalidValues.map(quote).join(', ')
    return `可能取值 { ${all} } 中 ${invalid} 不符合规范`
  }
  return `${quote(cell.raw)} 不符合规范`
}

function collectBackgroundCells(context) {
  const cells = []
  ;['backgroundColor', 'backgroundImage', 'background'].forEach((property) => {
    if (context.base[property]) {
      cells.push(context.base[property])
    }
    context.medias.forEach((media) => {
      if (media[property]) {
        cells.push(media[property])
      }
    })
  })
  return cells
}

/**
 * 默认校验规则集（需求文档 §2.1 + 源码阶段校验边界约定）
 */
export const DEFAULT_MATERIAL_RULES = [
  {
    id: 'material/background-type-declared',
    run(context) {
      const { backgroundType } = context
      if (backgroundType === undefined || backgroundType === null || backgroundType === '') {
        return [
          diagnostic(
            MATERIAL_LEVEL.INFO,
            'MATERIAL_BACKGROUND_TYPE_MISSING',
            '卡片未声明 backgroundType，默认按 custom 处理；如需完整材质效果请在 manifest 中声明 "backgroundType": "solid"'
          )
        ]
      }
      return []
    }
  },
  {
    id: 'material/solid-requires-root-background',
    run(context) {
      if (context.backgroundType !== BACKGROUND_TYPE_SOLID) {
        return []
      }
      const { base } = context
      if (!base.backgroundColor && !base.backgroundImage && !base.background) {
        return [
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_ROOT_BACKGROUND_MISSING',
            'solid 卡片的背景色必须设置在模板根节点上（引擎只抹除根节点背景）'
          )
        ]
      }
      return []
    }
  },
  {
    id: 'material/solid-forbids-background-image',
    run(context) {
      if (context.backgroundType !== BACKGROUND_TYPE_SOLID) {
        return []
      }
      const diagnostics = []
      const { base } = context
      if (base.backgroundImage && cellValues(base.backgroundImage)) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_BACKGROUND_IMAGE',
            `solid 卡片根节点不允许使用 background-image（当前：${base.backgroundImage.raw}）`,
            base.backgroundImage
          )
        )
      }
      if (base.background && cellValues(base.background)) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_BACKGROUND_GRADIENT',
            'solid 卡片根节点不允许使用 background 简写渐变',
            base.background
          )
        )
      }
      return diagnostics
    }
  },
  {
    id: 'material/solid-light-color',
    run(context) {
      if (context.backgroundType !== BACKGROUND_TYPE_SOLID) {
        return []
      }
      if (context.hasBaseImageOrGradient) {
        // 图片/渐变已由对应规则报错，避免重复诊断
        return []
      }
      const cell = context.base.backgroundColor
      const values = cellValues(cell)
      if (!cell || !values) {
        return []
      }
      const invalidValues = values.filter((value) => {
        const color = parseColor(value)
        return color && color.hex && LIGHT_BACKGROUND_COLORS.indexOf(color.hex) === -1
      })
      if (invalidValues.length) {
        return [
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_LIGHT_COLOR',
            `solid 卡片浅色模式背景色 ${formatViolation(
              cell,
              invalidValues
            )}，仅支持 ${LIGHT_BACKGROUND_COLORS.join(' / ')}`,
            cell
          )
        ]
      }
      return []
    }
  },
  {
    id: 'material/background-no-alpha',
    run(context) {
      const violations = []
      let firstCell
      collectBackgroundCells(context).forEach((cell) => {
        const values = cellValues(cell)
        if (!values) {
          return
        }
        values.forEach((value) => {
          const colors =
            cell.property === 'background'
              ? // 渐变简写：提取渐变内颜色
                gradientColorsOfValue(value)
              : [value]
          colors.forEach((color) => {
            const parsed = parseColor(color)
            if (parsed && parsed.alpha !== null && parsed.alpha < 1) {
              violations.push(color)
              if (!firstCell) {
                firstCell = cell
              }
            }
          })
        })
      })
      if (violations.length) {
        return [
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_BACKGROUND_ALPHA',
            `卡片背景不允许有透明度（alpha < 1）：${violations.join(', ')}`,
            firstCell
          )
        ]
      }
      return []
    }
  },
  {
    id: 'material/solid-dark-color',
    run(context) {
      if (context.backgroundType !== BACKGROUND_TYPE_SOLID) {
        return []
      }
      const darkMedias = context.medias.filter((item) => item.isDark)
      if (!darkMedias.length) {
        return [
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_DARK_MISSING',
            `solid 卡片必须通过 @media (prefers-color-scheme: dark) 为根节点设置深色背景 ${DARK_BACKGROUND_COLOR}`
          )
        ]
      }
      const diagnostics = []
      const imageOrGradientCell = darkMedias.filter(
        (item) => item.backgroundImage || item.background
      )[0]
      if (imageOrGradientCell) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_DARK_IMAGE_OR_GRADIENT',
            `solid 卡片深色模式必须为纯色 ${DARK_BACKGROUND_COLOR}，不允许背景图/渐变`,
            imageOrGradientCell.backgroundImage || imageOrGradientCell.background
          )
        )
      }
      const colorCells = darkMedias.map((item) => item.backgroundColor).filter(Boolean)
      if (!colorCells.length) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_DARK_MISSING',
            `solid 卡片必须通过 @media (prefers-color-scheme: dark) 为根节点设置深色背景 ${DARK_BACKGROUND_COLOR}`
          )
        )
        return diagnostics
      }
      colorCells.forEach((cell) => {
        const values = cellValues(cell)
        if (!values) {
          return
        }
        const invalidValues = values.filter((value) => {
          const color = parseColor(value)
          return color && color.hex && color.hex !== DARK_BACKGROUND_COLOR
        })
        if (invalidValues.length) {
          diagnostics.push(
            diagnostic(
              MATERIAL_LEVEL.ERROR,
              'MATERIAL_SOLID_DARK_COLOR',
              `solid 卡片深色模式背景色 ${formatViolation(
                cell,
                invalidValues
              )}，仅支持 ${DARK_BACKGROUND_COLOR}`,
              cell
            )
          )
        }
      })
      return diagnostics
    }
  },
  {
    id: 'material/dynamic-value-unresolved',
    run(context) {
      const diagnostics = []
      collectBackgroundCells(context).forEach((cell) => {
        if (cell.values !== null) {
          return
        }
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.WARN,
            'MATERIAL_BACKGROUND_UNRESOLVED',
            `卡片背景值 "${cell.raw}" 依赖运行时数据${
              cell.reason ? `（${cell.reason}）` : ''
            }，编译期无法判定是否符合材质规范；建议收敛为静态值`,
            cell
          )
        )
      })
      return diagnostics
    }
  }
]
