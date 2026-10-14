/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 轻卡材质校验：上下文的构建
 *
 * 输入：样式源码（片段） + 构建链透传的卡片上下文（backgroundType / 根节点信息 / 内联样式），
 * 输出：规则唯一输入 MaterialContext：
 * {
 *   backgroundType,                                   // manifest：widgets.<key>.backgroundType
 *   rootMeta: { classes, id },                        // 模板根节点静态 class / id
 *   base: { backgroundColor, backgroundImage, background },       // 默认条件下根节点背景
 *   medias: [{ condition, isDark, backgroundColor, backgroundImage, background }],
 *   hasBaseImageOrGradient
 * }
 *
 * 单元格（cell）：{ property, raw, values, reason, position, origin }
 * - raw        原始声明值（表达式还原后原文，用于消息）
 * - values     可能取值集合（静态值即退化集合，单元素）；null 表示不可枚举（动态值）
 * - reason     不可枚举原因（如「访问数据路径 xxx」）
 * - position   相对解析文本的位置 { line, column }（@import 合并时降级为 undefined）
 * - origin     'style'（样式表）/ 'inline'（模板内联样式，位置为 .ux 原始坐标）
 *
 * 口径与样式编译保持一致：
 * - 编译器已判定非法并丢弃的声明（如 background: #fff、非法选择器、伪类状态样式）不参与判定；
 * - 解析前先对 {{expr}} 掩码，避免 CSS 解析器截断表达式（行列号不受影响）；
 * - 内联样式优先于样式表（backgroundColor / backgroundImage），与产物级过渡实现口径一致。
 */

import css from 'css'
import { validate as validateDelaration } from '../validator'
import { isValidValue } from '../../utils'
import { maskExpressions, unmaskValue, expandTemplateValue } from './expression'
import { isRootSelector, isDarkCondition } from './rules'

const BACKGROUND_PROPERTIES = {
  'background-color': 'backgroundColor',
  'background-image': 'backgroundImage',
  background: 'background'
}

// 与样式编译一致的选择器合法性判定（processSingleClass 同款正则）
const REGEXP_SEL = /^[.#]?[A-Za-z0-9_\-:]+$/
const REGEXP_SEL_COMPLEX = /^([.#]?[A-Za-z0-9_-]+(\s+|\s*>\s*))+([.#]?[A-Za-z0-9_\-:]+)$/

/**
 * 是否为可参与判定的根节点选择器：
 * - 伪类/伪元素选择器（:hover / ::before 等）为状态样式或不被支持，不判定；
 * - 选择器非法（编译期整条丢弃）不判定；
 * - 仅 class/id 简单选择器可命中根节点（后代/子代选择器视为子节点）。
 */
function isMaterialRootSelector(selector, rootMeta) {
  if (selector.indexOf(':') > -1) {
    return false
  }
  if (!REGEXP_SEL.test(selector) && !REGEXP_SEL_COMPLEX.test(selector)) {
    return false
  }
  return isRootSelector(selector, rootMeta)
}

/**
 * 创建背景单元格；与样式编译同口径过滤「已判定非法并丢弃」的声明
 */
function createCell({ property, raw, filePath, position, origin }) {
  if (typeof raw !== 'string' || !raw) {
    return null
  }
  let validation
  try {
    validation = validateDelaration(property, raw, { filePath })
  } catch (err) {
    return null
  }
  const items = validation.value instanceof Array ? validation.value : []
  const item = items.filter((it) => it && it.n === property)[0] || items[0]
  if (!item || !isValidValue(item.v)) {
    // 编译器已判定非法并丢弃（如 background: #fff），不参与判定
    return null
  }
  const cell = {
    property,
    raw,
    values: null,
    reason: undefined,
    position,
    origin
  }
  const expansion = expandTemplateValue(raw)
  if (expansion.enumerable) {
    // 静态值取校验 / 转换后的值（退化集合）；表达式取展开集合
    cell.values = raw.indexOf('{{') > -1 ? expansion.values : [item.v]
  } else {
    cell.reason = expansion.reason
  }
  return cell
}

function createInlineCell({ property, raw, filePath, position }) {
  return createCell({
    property,
    raw,
    filePath,
    position,
    origin: 'inline'
  })
}

/**
 * 构建材质校验上下文
 *
 * @param {Object} options
 * @param {String} options.code - 样式片段源码（未合并 @import）
 * @param {String} options.mergedCode - 合并 @import 后的样式源码
 * @param {Boolean} options.hasImport - 是否存在被合并的 @import（位置降级为文件级）
 * @param {String} options.filePath - 样式文件路径
 * @param {Object} options.cardCtx - 构建链透传的卡片上下文
 * @returns {Object|null} MaterialContext（无法解析时返回 null，由调用方静默降级）
 */
export function buildMaterialContext({ code, mergedCode, hasImport, filePath, cardCtx }) {
  const parseSource = hasImport ? mergedCode : code
  if (typeof parseSource !== 'string' || !parseSource) {
    return null
  }
  const ast = css.parse(maskExpressions(parseSource), { silent: true })
  if (!ast || !ast.stylesheet || !Array.isArray(ast.stylesheet.rules)) {
    return null
  }

  const rootMeta = (cardCtx && cardCtx.rootMeta) || {}
  // 媒体条件（'' 为默认条件）下根节点背景的胜出声明
  const conditionCells = {}

  const visitRules = (rules, parentCondition) => {
    ;(rules || []).forEach((rule) => {
      if (rule.type === 'rule') {
        const condition = parentCondition || ''
        const selectors = Array.isArray(rule.selectors) ? rule.selectors : []
        const matched = selectors.some((selector) =>
          isMaterialRootSelector(String(selector).trim(), rootMeta)
        )
        if (!matched) {
          return
        }
        ;(rule.declarations || []).forEach((declaration) => {
          if (!declaration || declaration.type !== 'declaration') {
            return
          }
          const property = BACKGROUND_PROPERTIES[String(declaration.property).toLowerCase()]
          if (!property) {
            return
          }
          const position =
            !hasImport && declaration.position && declaration.position.start
              ? {
                  line: declaration.position.start.line,
                  column: declaration.position.start.column
                }
              : undefined
          const cell = createCell({
            property,
            raw: unmaskValue(declaration.value),
            filePath,
            position,
            origin: 'style'
          })
          if (!cell) {
            return
          }
          conditionCells[condition] = conditionCells[condition] || {}
          // 文档序后者胜出（多命中时取胜出声明）
          conditionCells[condition][property] = cell
        })
      } else if (rule.type === 'media') {
        const condition = parentCondition ? `${parentCondition} and ${rule.media}` : rule.media
        visitRules(rule.rules, condition)
      }
    })
  }
  visitRules(ast.stylesheet.rules, '')

  const base = Object.assign({}, conditionCells[''] || {})

  // 模板内联样式优先（backgroundColor / backgroundImage / background），位置为 .ux 原始坐标
  const inlineStyle = (cardCtx && cardCtx.rootStyle) || {}
  const inlinePosition = cardCtx && cardCtx.rootStyleLocation
  ;['backgroundColor', 'backgroundImage', 'background'].forEach((property) => {
    const raw = inlineStyle[property]
    if (raw === undefined || raw === null || raw === '') {
      return
    }
    const cell = createInlineCell({
      property,
      raw: String(raw),
      filePath,
      position: inlinePosition
    })
    if (cell) {
      base[property] = cell
    }
  })

  const medias = Object.keys(conditionCells)
    .filter((condition) => condition !== '')
    .map((condition) =>
      Object.assign(
        {
          condition,
          isDark: isDarkCondition(condition)
        },
        conditionCells[condition]
      )
    )

  return {
    backgroundType: cardCtx ? cardCtx.backgroundType : undefined,
    rootMeta,
    base,
    medias,
    hasBaseImageOrGradient: !!(base.backgroundImage || base.background)
  }
}
