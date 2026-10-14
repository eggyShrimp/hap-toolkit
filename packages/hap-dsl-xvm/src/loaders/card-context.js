/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 轻卡高级材质：卡片上下文的读取与合成（构建链侧）
 *
 * ux-loader 读取 manifest 的 backgroundType 与模板片段根节点信息
 * （静态 class / id、内联样式），合并为单一版本化上下文（随片段请求透传，样式校验从请求中取用）：
 * { version: 1, backgroundType, rootMeta: { classes, id }, rootStyle, rootStyleLocation }
 *
 * 任何环节取不到（模板缺失、动态 class、manifest 缺失 / 解析失败）时返回 null，
 * 由调用方降级跳过校验（不报错、不误报）。
 */

import path from 'path'
import fs from 'fs'
import { globalConfig, readJson } from '@hap-toolkit/shared-utils'
import { templater } from '@hap-toolkit/compiler'

// manifest 按 mtime 缓存，避免重复读取
let manifestCache = null

function readManifestWithCache() {
  const manifestPath = path.join(globalConfig.SRC_DIR, 'manifest.json')
  let stat
  try {
    stat = fs.statSync(manifestPath)
  } catch (err) {
    return null
  }
  if (
    manifestCache &&
    manifestCache.path === manifestPath &&
    manifestCache.mtimeMs === stat.mtimeMs
  ) {
    return manifestCache.data
  }
  const data = readJson(manifestPath)
  manifestCache = { path: manifestPath, mtimeMs: stat.mtimeMs, data }
  return data
}

/**
 * 按卡片入口（widgets 的 key）定位 manifest 中的卡片配置
 * cardEntry 可能带前导 `/`（路由路径），两种 key 形式都尝试
 */
function resolveWidgetConf(manifest, cardEntry) {
  const widgets = manifest && manifest.router && manifest.router.widgets
  if (!widgets || !cardEntry) {
    return null
  }
  const key = String(cardEntry).replace(/^\/+/, '')
  return widgets[key] || widgets['/' + key] || null
}

/**
 * 将模板片段内联样式的位置（相对片段内容）换算为 .ux 源码绝对位置
 */
function resolveStyleLocation(source, template, styleLocation) {
  const start = (template.location && template.location.start) || 0
  const before = source.slice(0, start)
  const lastNewline = before.lastIndexOf('\n')
  const contentStartLine = (before.match(/\n/g) || []).length + 1
  const contentStartColumn = start - (lastNewline + 1) + 1
  return {
    line: contentStartLine + styleLocation.line - 1,
    column:
      styleLocation.line === 1 ? contentStartColumn + styleLocation.col - 1 : styleLocation.col
  }
}

/**
 * 合成卡片上下文
 *
 * @param {Object} options
 * @param {String} options.source - .ux 源码
 * @param {Object} options.template - 模板片段（parseFragments 结果项）
 * @param {String} options.cardEntry - 卡片入口（manifest widgets key）
 * @returns {Object|null} 卡片上下文；取不到时返回 null（降级跳过）
 */
export function buildCardContext({ source, template, cardEntry }) {
  try {
    if (!template || template.attrs.src) {
      // 外部模板取不到根节点信息
      return null
    }
    const rootMeta = templater.extractRootMeta(template.content)
    if (!rootMeta) {
      return null
    }
    const classes = rootMeta.classes || []
    if (!classes.length && !rootMeta.id) {
      // 无静态 class / id，无法匹配根节点选择器，降级跳过
      return null
    }
    const widgetConf = resolveWidgetConf(readManifestWithCache(), cardEntry) || {}
    const context = {
      version: 1,
      backgroundType: widgetConf.backgroundType,
      rootMeta: {
        classes,
        id: rootMeta.id || ''
      },
      rootStyle: rootMeta.rootStyle || {}
    }
    if (rootMeta.styleLocation) {
      context.rootStyleLocation = resolveStyleLocation(source, template, rootMeta.styleLocation)
    }
    return context
  } catch (err) {
    return null
  }
}
