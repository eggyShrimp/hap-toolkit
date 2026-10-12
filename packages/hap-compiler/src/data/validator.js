/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import exp from '../template/exp'
import { findForbiddenFeature } from '../common/forbidden-feature'

// 编译产物标记前缀（$key 原文 / #key AST），用户数据不可占用
const RESERVED_PREFIXES = ['$', '#']

function isReservedKey(key) {
  return RESERVED_PREFIXES.indexOf((key + '').charAt(0)) > -1
}

function isObject(obj) {
  return obj && Object.prototype.toString.call(obj) === '[object Object]'
}

/**
 * 校验数据 key（任意层级）
 * @param {string} key - 数据 key
 * @param {string} path - 数据路径，用于报错定位
 */
function checkKey(key, path) {
  if (isReservedKey(key)) {
    throw new Error(`<data> uiData 的 key 不能以 “$” 或 “#” 开头：${path}`)
  }

  if (exp.isExpr(key)) {
    throw new Error(`<data> uiData 的 key 必须为静态字符串，不支持表达式：${path}`)
  }
}

/**
 * 校验数据值（任意层级结构：对象 / 数组递归）
 * @param {*} value - 待校验的值
 * @param {string} path - 数据路径，用于报错定位
 */
function checkValue(value, path) {
  if (typeof value === 'string') {
    if (exp.isExpr(value)) {
      const feature = findForbiddenFeature(value)
      if (feature) {
        throw new Error(
          `耗时 Feature "${feature}" 不允许在 uiData 表达式中使用（uiData 默认值在 UI 线程求值），` +
            `可通过 create/update params 或数据提供方下发：${path}`
        )
      }
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => checkValue(item, `${path}[${index}]`))
    return
  }

  if (isObject(value)) {
    Object.keys(value).forEach((key) => {
      checkKey(key, `${path}.${key}`)
      checkValue(value[key], `${path}.${key}`)
    })
  }
}

/**
 * 校验轻卡 <data> 块中的 uiData
 * 规则：
 * 1. 必须为 Object 对象；
 * 2. key 不能以 $ / # 开头（保留前缀，与编译产物标记冲突），任意层级生效；
 * 3. key 必须为静态字符串（不支持表达式），任意层级生效；
 * 4. 表达式不得引用 UI 线程耗时 Feature（与模板使用同一份黑名单），任意层级生效。
 * @param {Object} uiData - uiData 对象
 */
function checkUiData(uiData) {
  if (uiData && !isObject(uiData)) {
    throw new Error(`<data> uiData 必须为 Object 对象`)
  }

  Object.keys(uiData || {}).forEach((key) => {
    checkKey(key, key)
    checkValue(uiData[key], key)
  })
}

export { checkUiData }
