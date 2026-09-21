/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 轻卡高级材质（HyperOS 高级材质）编译期校验规则
 *
 * 规则来源：《快应用卡片高级材质适配 — 需求文档》§2.1 编译时校验
 * - backgroundType: solid  → 根节点必须为规范纯色（浅色 #FFFFFF/#F5F5F5，深色 #1A1A1B），
 *                           且不允许 background-image / background 简写渐变、透明度，并需适配深色模式
 * - backgroundType: custom / 未声明（默认 custom） → 根节点背景不允许有透明度
 *
 * 规则以可插拔数组形式提供：
 * - 默认规则见 DEFAULT_MATERIAL_RULES
 * - 调用方可通过 MaterialValidatePlugin 的 options.rules 传入自定义规则集（扩展或替换），
 *   便于后续对齐不同标准或裁剪规则
 *
 * 规则函数签名：rule.run(context) -> Diagnostic[]
 * Diagnostic: { level: 'error' | 'warn' | 'info', code, message }
 */

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
 * 颜色可能来自编译产物（已被编译器归一化）或自定义规则；无法识别时返回 null，
 * 由调用方跳过校验以避免误报（如动态表达式、编译器不支持的现代颜色语法）。
 *
 * @param {String} value - 颜色值
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
 * 模板根节点信息（轻卡静态 class 编译为 classList 数组）
 * @param {Object} rootNode - 编译产物 template 根节点
 * @returns {{classes: String[], id: String}}
 */
export function getRootMeta(rootNode) {
  const node = rootNode || {}
  const classes = Array.isArray(node.classList)
    ? node.classList.filter((it) => typeof it === 'string')
    : []
  const id = typeof node.id === 'string' ? node.id : ''
  return { classes, id }
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
  if (ids.some((id) => id !== rootMeta.id)) {
    return false
  }
  return classes.every((cls) => rootMeta.classes.indexOf(cls) > -1)
}

/**
 * 从一个样式对象（顶层或 @MEDIA 条目）中提取根节点的背景声明
 */
function pickRootBackground(styleObj, rootMeta) {
  const picked = {}
  if (!styleObj || typeof styleObj !== 'object') {
    return picked
  }
  Object.keys(styleObj).forEach((selector) => {
    if (selector.charAt(0) === '@') {
      return
    }
    if (!isRootSelector(selector, rootMeta)) {
      return
    }
    const declarations = styleObj[selector]
    if (!declarations || typeof declarations !== 'object') {
      return
    }
    if (declarations.backgroundColor !== undefined) {
      picked.backgroundColor = declarations.backgroundColor
    }
    if (declarations.backgroundImage !== undefined) {
      picked.backgroundImage = declarations.backgroundImage
    }
    if (declarations.background !== undefined) {
      picked.background = declarations.background
    }
  })
  return picked
}

/**
 * 从编译产物的 background 简写（JSON 字符串）中提取渐变颜色
 * 形如：{"values":[{"type":"linearGradient","values":["#ffffff","#000000"]}]}
 *
 * @param {String} backgroundValue
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
 * 判断媒体条件是否为深色模式（prefers-color-scheme: dark）
 */
export function isDarkColorSchemeCondition(condition) {
  return typeof condition === 'string' && /prefers-color-scheme\s*:\s*dark/i.test(condition)
}

/**
 * 构建一条规则的上下文，便于规则函数只关心判断逻辑
 *
 * @param {Object} params
 * @param {String} params.widgetKey - manifest widgets 的 key（卡片路由）
 * @param {Object} params.widgetConf - manifest widgets 配置
 * @param {Object} params.templateRoot - 编译产物 #entry.template 根节点
 * @param {Object} params.styles - 编译产物 css.json 中该卡片的样式对象
 * @param {String} params.bundleFilePath - 卡片产物路径（相对 src，无扩展名）
 * @returns {Object}
 */
export function createMaterialContext({
  widgetKey,
  widgetConf = {},
  templateRoot,
  styles = {},
  bundleFilePath = ''
}) {
  const rootMeta = getRootMeta(templateRoot)
  const inlineStyle = (templateRoot && templateRoot.style) || {}
  const baseStyle = pickRootBackground(styles, rootMeta)

  // 基础（浅色/无媒体）背景：内联样式优先于样式表
  const base = {
    backgroundColor:
      inlineStyle.backgroundColor !== undefined
        ? inlineStyle.backgroundColor
        : baseStyle.backgroundColor,
    backgroundImage:
      inlineStyle.backgroundImage !== undefined
        ? inlineStyle.backgroundImage
        : baseStyle.backgroundImage,
    background: baseStyle.background
  }
  base.gradientColors = extractGradientColors(base.background)

  // 所有 @MEDIA 条目中的根节点背景（含深色与组合条件）
  const mediaList = Array.isArray(styles['@MEDIA']) ? styles['@MEDIA'] : []
  const medias = mediaList
    .map((mediaStyle) => {
      if (!mediaStyle || typeof mediaStyle !== 'object') {
        return null
      }
      const picked = pickRootBackground(mediaStyle, rootMeta)
      if (
        picked.backgroundColor === undefined &&
        picked.backgroundImage === undefined &&
        picked.background === undefined
      ) {
        return null
      }
      return {
        condition: mediaStyle.condition,
        isDark: isDarkColorSchemeCondition(mediaStyle.condition),
        backgroundColor: picked.backgroundColor,
        backgroundImage: picked.backgroundImage,
        background: picked.background,
        gradientColors: extractGradientColors(picked.background)
      }
    })
    .filter(Boolean)

  return {
    widgetKey,
    widgetConf,
    bundleFilePath,
    backgroundType: widgetConf.backgroundType,
    rootMeta,
    base,
    medias,
    hasBaseImageOrGradient: !!(base.backgroundImage || base.background)
  }
}

function diagnostic(level, code, message) {
  return { level, code, message }
}

/**
 * 默认校验规则集（需求文档 §2.1 + spec 边界约定）
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
    id: 'material/background-type-valid',
    run(context) {
      const { backgroundType } = context
      if (!backgroundType) {
        return []
      }
      if (backgroundType !== BACKGROUND_TYPE_SOLID && backgroundType !== BACKGROUND_TYPE_CUSTOM) {
        return [
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_BACKGROUND_TYPE_INVALID',
            `backgroundType "${backgroundType}" 不合法，仅支持 "solid" | "custom"`
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
      if (base.backgroundImage) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_BACKGROUND_IMAGE',
            `solid 卡片根节点不允许使用 background-image（当前：${base.backgroundImage}）`
          )
        )
      }
      if (base.background) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_BACKGROUND_GRADIENT',
            'solid 卡片根节点不允许使用 background 简写渐变'
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
      const value = context.base.backgroundColor
      if (!value) {
        return []
      }
      const color = parseColor(value)
      if (!color || !color.hex) {
        return []
      }
      if (LIGHT_BACKGROUND_COLORS.indexOf(color.hex) === -1) {
        return [
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_LIGHT_COLOR',
            `solid 卡片浅色模式背景色 "${value}" 不符合规范，仅支持 ${LIGHT_BACKGROUND_COLORS.join(
              ' / '
            )}`
          )
        ]
      }
      return []
    }
  },
  {
    id: 'material/background-no-alpha',
    run(context) {
      const { backgroundType } = context
      if (
        backgroundType &&
        backgroundType !== BACKGROUND_TYPE_SOLID &&
        backgroundType !== BACKGROUND_TYPE_CUSTOM
      ) {
        // backgroundType 非法时由类型规则负责
        return []
      }
      const values = []
      const collect = (item) => {
        if (!item) {
          return
        }
        if (item.backgroundColor) {
          values.push(item.backgroundColor)
        }
        if (item.gradientColors && item.gradientColors.length) {
          values.push(...item.gradientColors)
        }
      }
      collect(context.base)
      context.medias.forEach(collect)

      const transparentValues = values.filter((value) => {
        const color = parseColor(value)
        return color && color.alpha !== null && color.alpha < 1
      })
      if (transparentValues.length) {
        return [
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_BACKGROUND_ALPHA',
            `卡片背景不允许有透明度（alpha < 1）：${transparentValues.join(', ')}`
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
      if (darkMedias.some((item) => item.backgroundImage || item.background)) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_DARK_IMAGE_OR_GRADIENT',
            `solid 卡片深色模式必须为纯色 ${DARK_BACKGROUND_COLOR}，不允许背景图/渐变`
          )
        )
      }
      const darkColors = darkMedias
        .map((item) => item.backgroundColor)
        .filter((value) => value !== undefined)
      if (!darkColors.length) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_DARK_MISSING',
            `solid 卡片必须通过 @media (prefers-color-scheme: dark) 为根节点设置深色背景 ${DARK_BACKGROUND_COLOR}`
          )
        )
        return diagnostics
      }
      const invalidColors = darkColors.filter((value) => {
        const color = parseColor(value)
        return color && color.hex && color.hex !== DARK_BACKGROUND_COLOR
      })
      if (invalidColors.length) {
        diagnostics.push(
          diagnostic(
            MATERIAL_LEVEL.ERROR,
            'MATERIAL_SOLID_DARK_COLOR',
            `solid 卡片深色模式背景色 "${invalidColors.join(
              ', '
            )}" 不符合规范，仅支持 ${DARK_BACKGROUND_COLOR}`
          )
        )
      }
      return diagnostics
    }
  }
]

/**
 * 按规则集校验一张卡片，返回诊断列表
 *
 * @param {Object} params - 同 createMaterialContext
 * @param {Array} [rules] - 规则集，默认 DEFAULT_MATERIAL_RULES
 * @returns {Array<{level: String, code: String, message: String}>}
 */
export function validateMaterialCard(params, rules) {
  const context = createMaterialContext(params)
  const ruleList = Array.isArray(rules) ? rules : DEFAULT_MATERIAL_RULES
  const diagnostics = []
  ruleList.forEach((rule) => {
    if (!rule || typeof rule.run !== 'function') {
      return
    }
    try {
      const result = rule.run(context)
      if (Array.isArray(result)) {
        diagnostics.push(...result)
      }
    } catch (err) {
      diagnostics.push(
        diagnostic(
          MATERIAL_LEVEL.WARN,
          'MATERIAL_RULE_ERROR',
          `规则 ${rule.id || '(unknown)'} 执行失败：${err.message}`
        )
      )
    }
  })
  return diagnostics
}
