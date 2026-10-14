/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 提取模板片段根节点元信息（构建链 ux-loader 透传上下文用）
 *
 * 返回模板根节点的静态 class / id 与内联样式中的背景声明（保留原文，含表达式）：
 * {
 *   classes: String[],                        // 静态 class；动态 class（含 {{}}）取不到时返回 null
 *   id: String,                               // 静态 id；动态 id 视为取不到
 *   rootStyle: { [property]: String },        // 内联 style 中 background-color / background-image / background
 *   styleLocation: { line, col } | undefined  // style 属性位置（相对模板片段内容）
 * }
 *
 * 取不到根节点（无根元素、动态 class 等）时返回 null，由调用方降级跳过校验（不误报）。
 */

import parse5 from 'parse5'

const INLINE_BACKGROUND_PROPERTIES = {
  backgroundColor: true,
  backgroundImage: true,
  background: true
}

function hyphenedToCamelCase(name) {
  return String(name).replace(/-([a-z])/g, (match, char) => char.toUpperCase())
}

/**
 * 解析内联 style 文本中的背景声明（与模板编译 checkStyle 相同的拆分口径）
 */
function parseInlineStyle(styleText) {
  const result = {}
  String(styleText)
    .split(';')
    .forEach((declarationText) => {
      let pair = declarationText.split(':')
      if (pair.length < 2) {
        return
      }
      // 值中可能含 ':'（如三元表达式），首个 ':' 之后整体为值
      pair = [pair[0], pair.slice(1).join(':')]
      const property = hyphenedToCamelCase(pair[0].trim())
      if (!INLINE_BACKGROUND_PROPERTIES[property]) {
        return
      }
      const value = pair[1].trim()
      if (value) {
        result[property] = value
      }
    })
  return result
}

/**
 * @param {String} content - 模板片段内容（<template> 标签内部文本）
 * @returns {Object|null}
 */
export function extractRootMeta(content) {
  if (typeof content !== 'string' || !content.trim()) {
    return null
  }
  let fragment
  try {
    fragment = parse5.parseFragment(content, { locationInfo: true })
  } catch (err) {
    return null
  }
  const root = (fragment.childNodes || []).filter((node) => node.tagName)[0]
  if (!root) {
    return null
  }
  const attrs = {}
  ;(root.attrs || []).forEach((attr) => {
    attrs[attr.name] = attr.value
  })

  // 动态 class 无法静态判定 → 取不到（降级跳过）
  if (attrs.class && attrs.class.indexOf('{{') > -1) {
    return null
  }
  const classes = attrs.class ? attrs.class.split(/\s+/).filter(Boolean) : []
  const id = attrs.id && attrs.id.indexOf('{{') === -1 ? attrs.id : ''

  const rootStyle = attrs.style ? parseInlineStyle(attrs.style) : {}

  let styleLocation
  const location = root.__location
  if (location && location.startTag && location.startTag.attrs && location.startTag.attrs.style) {
    const attrLocation = location.startTag.attrs.style
    styleLocation = { line: attrLocation.line, col: attrLocation.col }
  }

  return {
    classes,
    id,
    rootStyle,
    styleLocation
  }
}
