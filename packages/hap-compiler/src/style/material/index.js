/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 轻卡高级材质：背景规范校验（编译器侧 / 源码阶段）
 *
 * 由 style-loader 调用 parseStyle 触发：构建链（ux-loader）透传卡片上下文（cardCtx），
 * 样式编译阶段执行规则集，产出带源码位置（经 source map 映射）的诊断，
 * 随样式编译日志通道输出（style-loader → logWarn），不阻塞打包。
 *
 * 诊断形态（与技术方案一致）：
 *   ERROR: [卡片高级材质] <说明>
 *   诊断码：MATERIAL_XXX
 *   规范参考：<规范文档链接>
 * 位置由日志条目 line / column 承载（logWarn 输出 @line:column），
 * 无法映射时降级为文件级位置（不输出行列号）。
 */

import { SourceMapConsumer } from 'source-map'
import { buildMaterialContext } from './context'
import { DEFAULT_MATERIAL_RULES, MATERIAL_LEVEL } from './rules'

export * from './rules'
export { buildMaterialContext } from './context'
export { expandTemplateValue } from './expression'

export const MATERIAL_SPEC_URL =
  'https://www.quickapp.cn/document/%E6%A0%87%E5%87%86%E5%8D%A1/reference/app-service/page-style-and-layout.html'

const LEVEL_TEXT = {
  [MATERIAL_LEVEL.ERROR]: 'ERROR',
  [MATERIAL_LEVEL.WARN]: 'WARN',
  [MATERIAL_LEVEL.INFO]: 'INFO'
}

/**
 * 按 source map 解析位置（consumer 在一次校验内复用，避免每条诊断重复解析；
 * 0.6.x 同步 API，仅内部消费，不产出到构建结果）
 */
function originalPositionFor(consumer, line, column) {
  // css 解析器为 1-based 列，source map 为 0-based；先按声明列查询，再退化为行首
  const candidates = [Math.max(0, (column || 1) - 1), 0]
  for (let i = 0; i < candidates.length; i++) {
    const pos = consumer.originalPositionFor({ line, column: candidates[i] })
    if (pos && pos.line) {
      return pos
    }
  }
  return null
}

/**
 * 解析诊断的最终位置：
 * - 内联样式：位置为 .ux 原始坐标，直接使用；
 * - 样式表：经 source map 映射（预处理样式 → 源码；片段 → .ux），
 *   行级精度、列号近似；无法映射时降级为文件级（不输出位置）。
 */
function resolvePosition(diagnostic, materialPosition, getMapConsumer) {
  const position = diagnostic.position
  if (!position || !position.line) {
    return null
  }
  if (diagnostic.origin === 'inline') {
    return { line: position.line, column: position.column || 1 }
  }
  if (!materialPosition || !materialPosition.sourceMap) {
    return null
  }
  const consumer = getMapConsumer()
  if (!consumer) {
    return null
  }
  let mapped
  try {
    mapped = originalPositionFor(consumer, position.line, position.column)
  } catch (err) {
    return null
  }
  if (!mapped) {
    return null
  }
  let line = mapped.line
  if (materialPosition.lineOffset) {
    // 预处理样式（内联片段）：map 位置为片段内相对行，叠加片段起始行
    line = line + materialPosition.lineOffset - 1
  }
  return { line, column: mapped.column || 1 }
}

function toLogEntry(diagnostic, materialPosition, getMapConsumer) {
  const levelText = LEVEL_TEXT[diagnostic.level] || 'WARN'
  const reason = [
    `${levelText}: [卡片高级材质] ${diagnostic.message}`,
    `诊断码：${diagnostic.code}`,
    `规范参考：${MATERIAL_SPEC_URL}`
  ].join('\n')
  const entry = { reason }
  const position = resolvePosition(diagnostic, materialPosition, getMapConsumer)
  if (position && position.line) {
    entry.line = position.line
    entry.column = position.column || 1
  }
  return entry
}

/**
 * 执行材质背景规范校验
 *
 * @param {Object} options
 * @param {String} options.code - 样式片段源码（未合并 @import）
 * @param {String} options.mergedCode - 合并 @import 后的样式源码
 * @param {Boolean} options.hasImport - 是否存在被合并的 @import（位置降级为文件级）
 * @param {String} options.filePath - 样式文件路径
 * @param {Object} options.cardCtx - 构建链透传的卡片上下文（缺失 / 版本未知时跳过）
 * @param {Object} [options.materialPosition] - 位置映射信息 { sourceMap, lineOffset }
 * @param {Array} [options.rules] - 自定义规则集（扩展 / 替换），默认 DEFAULT_MATERIAL_RULES
 * @param {Array} [options.disabledRules] - 按规则 id 禁用
 * @param {Boolean} [options.silentInfo] - 静默 INFO 诊断
 * @returns {Array<{line: Number|undefined, column: Number|undefined, reason: String}>}
 */
export function validateMaterialStyle(options = {}) {
  const { code, mergedCode, hasImport, filePath, cardCtx, materialPosition } = options
  if (!cardCtx || typeof cardCtx !== 'object' || cardCtx.version !== 1) {
    return []
  }
  const rootMeta = cardCtx.rootMeta
  const hasRootMeta =
    rootMeta && ((Array.isArray(rootMeta.classes) && rootMeta.classes.length) || rootMeta.id)
  if (!hasRootMeta) {
    return []
  }

  let context
  try {
    context = buildMaterialContext({ code, mergedCode, hasImport, filePath, cardCtx })
  } catch (err) {
    // 解析 / 上下文构建失败 → 静默降级，不影响构建
    return []
  }
  if (!context) {
    return []
  }

  const rules = Array.isArray(options.rules) ? options.rules : DEFAULT_MATERIAL_RULES
  const disabledRules = Array.isArray(options.disabledRules) ? options.disabledRules : []
  const diagnostics = []
  rules.forEach((rule) => {
    if (!rule || typeof rule.run !== 'function' || disabledRules.indexOf(rule.id) > -1) {
      return
    }
    try {
      const result = rule.run(context)
      if (Array.isArray(result)) {
        diagnostics.push(...result)
      }
    } catch (err) {
      diagnostics.push({
        level: MATERIAL_LEVEL.WARN,
        code: 'MATERIAL_RULE_ERROR',
        message: `规则 ${rule.id || '(unknown)'} 执行失败：${err.message}`
      })
    }
  })

  let mapConsumer
  let mapConsumerReady = false
  const getMapConsumer = () => {
    if (!mapConsumerReady) {
      mapConsumerReady = true
      try {
        mapConsumer =
          materialPosition && materialPosition.sourceMap
            ? new SourceMapConsumer(materialPosition.sourceMap)
            : null
      } catch (err) {
        mapConsumer = null
      }
    }
    return mapConsumer
  }

  return diagnostics
    .filter((item) => !(options.silentInfo && item.level === MATERIAL_LEVEL.INFO))
    .map((item) => toLogEntry(item, materialPosition, getMapConsumer))
}
