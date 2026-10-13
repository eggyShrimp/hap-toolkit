/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// 耗时 Feature 黑名单：这些 Feature 在 UI 线程同步执行会阻塞渲染，
// 禁止出现在 UI 线程求值的表达式中（模板、uiData 等）；
// lifecycle / action params 在工作线程或事件时机执行，不受此限制。
const FORBIDDEN_TEMPLATE_FEATURES = ['system.geolocation.getLocation', 'service.push.subscribe']

// 为每个黑名单 Feature 构建匹配「方法调用」的正则（允许任意参数、段间空白）
const FORBIDDEN_FEATURE_MATCHERS = FORBIDDEN_TEMPLATE_FEATURES.map((feature) => {
  const escaped = feature
    .split('.')
    .map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*\\.\\s*')
  return {
    feature,
    // 前置一个非标识符/非点的边界，避免误匹配 foo.system.geolocation... 之类的其它路径
    re: new RegExp('(?:^|[^\\w$.])' + escaped + '\\s*\\(')
  }
})

/**
 * 查找表达式中命中的耗时 Feature（不抛错，由调用方决定诊断形态）
 * @param  {string} value - 表达式源码
 * @returns {string|null} 命中的 feature 名称；未命中返回 null
 */
function findForbiddenFeature(value) {
  if (!value || typeof value !== 'string') return null

  for (let i = 0; i < FORBIDDEN_FEATURE_MATCHERS.length; i++) {
    const { feature, re } = FORBIDDEN_FEATURE_MATCHERS[i]
    if (re.test(value)) {
      return feature
    }
  }
  return null
}

export { FORBIDDEN_TEMPLATE_FEATURES, FORBIDDEN_FEATURE_MATCHERS, findForbiddenFeature }
