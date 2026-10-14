/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import loaderUtils from 'loader-utils'
import { parseStyle } from '@hap-toolkit/compiler'
import { logWarn, compileOptionsObject } from '@hap-toolkit/shared-utils'

import { convertPath, getWebpackOptions } from './common/utils'

const componentId = (() => {
  const resourceMap = new Map()
  let uniqueId = 1

  return {
    get(resourcePath) {
      return resourceMap.get(resourcePath)
    },
    add(resourcePath) {
      if (!resourceMap.has(resourcePath)) {
        // 生成唯一ID
        resourceMap.set(resourcePath, uniqueId++)
      }
    }
  }
})()

/**
 * 解析构建链透传的卡片上下文（单一版本化参数 cardCtx）
 * 缺失 / 解析失败时返回 undefined（降级跳过材质校验）
 */
function parseCardCtx(raw) {
  if (!raw || typeof raw !== 'string') {
    return undefined
  }
  try {
    const context = JSON.parse(raw)
    return context && typeof context === 'object' ? context : undefined
  } catch (err) {
    return undefined
  }
}

/**
 * 合成材质校验的位置映射信息：
 * - 有上游 map（片段 map 或预处理 map）时随 parseStyle 传入，由编译器映射源码位置；
 * - 内联片段使用预处理样式（styleLang）时，map 位置为片段内相对行，需叠加片段起始行（styleLine）；
 * - 无 map（独立样式文件 / 降级场景）时位置降级为文件级。
 */
function buildMaterialPosition(options, inputSourceMap) {
  if (!inputSourceMap) {
    return undefined
  }
  const materialPosition = { sourceMap: inputSourceMap }
  if (options.styleLine !== undefined && options.styleLang) {
    const lineOffset = parseInt(options.styleLine, 10)
    if (lineOffset > 0) {
      materialPosition.lineOffset = lineOffset
    }
  }
  return materialPosition
}

export default function styleLoader(code, inputSourceMap) {
  const self = this
  const options = loaderUtils.parseQuery(this.resourceQuery)
  const cardEntry = options.cardEntry
  const loaderQuery = loaderUtils.parseQuery(this.query)
  const suppresslogs = !!getWebpackOptions(this).suppresslogs
  const resourcePath = this.resourcePath // 当前文件绝对路径

  const { depList, log, depFiles, jsonStyle } = parseStyle({
    cardEntry: options.cardEntry,
    filePath: resourcePath,
    code: code,
    query: loaderQuery,
    // 轻卡高级材质：构建链透传的上下文与位置映射（缺失时静默降级）
    cardCtx: parseCardCtx(options.cardCtx),
    materialPosition: buildMaterialPosition(options, inputSourceMap)
  })

  if (compileOptionsObject.enableExtractCss && !options.newJSCard) {
    componentId.add(resourcePath)
    if (jsonStyle) {
      jsonStyle[`@info`] = {
        styleObjectId: componentId.get(resourcePath)
      }
    }
  }

  const parsed = JSON.stringify(jsonStyle, null, 2)

  if (log && log.length) {
    logWarn(this, log, suppresslogs)
  }

  // Recompile while dependency changed
  depList.forEach(function (depFilePath) {
    self.addDependency(depFilePath)
  })

  depFiles.forEach((file) => {
    let fileName = file
    if (cardEntry && file.startsWith('/node_modules')) {
      fileName = decodeURIComponent(cardEntry) + file
    }
    self.addDependency(convertPath(fileName))
  })

  return `module.exports = ${parsed}`
}
