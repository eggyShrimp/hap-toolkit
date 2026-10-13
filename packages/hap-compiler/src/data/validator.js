/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { templateValueToCardCode } from '@aiot-toolkit/card-expression'
import exp from '../template/exp'

// 编译产物标记前缀（$key 原文 / #key AST），用户数据不可占用
const RESERVED_PREFIXES = ['$', '#']

// 允许的函数调用白名单：国际化函数（与 card-expression 默认 noPrefixFunctionList 一致）
const ALLOWED_CALLS = ['$t', '$tc']

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
 * 校验表达式 AST：仅允许静态系统变量引用与表达式计算，禁止调用 Feature / 函数
 * （$t / $tc 国际化函数除外）
 * @param {*} node - 卡片表达式 AST 节点
 * @param {string} path - 数据路径，用于报错定位
 * @param {string} rawExpr - 表达式原文
 */
function checkExprNode(node, path, rawExpr) {
  if (Array.isArray(node)) {
    if (node[0] === '()' && ALLOWED_CALLS.indexOf(node[1]) === -1) {
      throw new Error(
        `<data> uiData 中 "${path}" 的表达式禁止调用 Feature / 函数，` +
          `仅支持静态系统变量引用（如 system.env.intentInfo）与表达式计算：${rawExpr.trim()}`
      )
    }
    node.forEach((item) => checkExprNode(item, path, rawExpr))
    return
  }

  if (isObject(node)) {
    Object.keys(node).forEach((key) => checkExprNode(node[key], path, rawExpr))
  }
}

/**
 * 校验 uiData 中的表达式（语法 + 静态性约束）
 * @param {string} value - 表达式原文（含 {{}}）
 * @param {string} path - 数据路径，用于报错定位
 */
function checkExpression(value, path) {
  let astStr
  try {
    astStr = templateValueToCardCode(value)
  } catch (e) {
    throw new Error(`<data> uiData 中 "${path}" 的表达式无法解析：${e.message}`)
  }

  checkExprNode(JSON.parse(astStr), path, value)
}

/**
 * 校验数据值（任意层级结构：对象 / 数组递归）
 * @param {*} value - 待校验的值
 * @param {string} path - 数据路径，用于报错定位
 */
function checkValue(value, path) {
  if (typeof value === 'string') {
    if (exp.isExpr(value)) {
      checkExpression(value, path)
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
 * 4. 表达式仅支持静态系统变量引用（如 system.env.intentInfo）与表达式计算，
 *    禁止调用 Feature / 函数（$t / $tc 除外），任意层级生效。
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
