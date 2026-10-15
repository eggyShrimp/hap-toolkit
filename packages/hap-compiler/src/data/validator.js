/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { templateValueToCardCode } from '@aiot-toolkit/card-expression'
import exp from '../template/exp'
import { FORBIDDEN_TEMPLATE_FEATURES } from '../common/forbidden-feature'

// 编译产物标记前缀（$key 原文 / #key AST），用户数据不可占用
const RESERVED_PREFIXES = ['$', '#']

// 允许的无前缀调用白名单：国际化函数（与 card-expression 默认 noPrefixFunctionList 一致）
const ALLOWED_CALLS = ['$t', '$tc']

// Feature 命名空间：仅这两类前缀的调用视为 Feature 调用，其余函数 / 方法调用保持禁止
const FEATURE_NAMESPACES = ['system', 'service']

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
 * 从成员表达式 AST 还原点号路径（如 system.package.hasInstalled）
 * 仅支持「标识符 + 字符串属性」的简单路径，其他形态返回 null
 * @param {*} node - 卡片表达式 AST 节点
 * @returns {string[]|null} 路径分段；非简单路径返回 null
 */
function getMemberPath(node) {
  if (Array.isArray(node)) {
    if (node[0] === '$' && typeof node[1] === 'string') {
      return [node[1]]
    }
    if (node[0] === '.' && typeof node[2] === 'string') {
      const base = getMemberPath(node[1])
      if (base) {
        return base.concat(node[2])
      }
    }
  }
  return null
}

/**
 * 是否为 Feature 调用（system.xxx / service.xxx，至少两段）
 * @param {string[]|null} segments - getMemberPath 的返回值
 */
function isFeatureCall(segments) {
  return !!(segments && segments.length > 1 && FEATURE_NAMESPACES.indexOf(segments[0]) > -1)
}

/**
 * 是否为耗时 Feature 路径（与模板共用同一份黑名单）
 * @param {string} featurePath - 完整调用路径，如 system.geolocation.getLocation
 */
function isForbiddenFeature(featurePath) {
  return FORBIDDEN_TEMPLATE_FEATURES.some(
    (feature) => featurePath === feature || featurePath.indexOf(feature + '.') === 0
  )
}

/**
 * 校验表达式 AST：仅允许静态系统变量引用、表达式计算与非耗时 Feature 调用
 * （$t / $tc 国际化函数除外；普通函数 / 方法调用保持禁止）
 * @param {*} node - 卡片表达式 AST 节点
 * @param {string} path - 数据路径，用于报错定位
 * @param {string} rawExpr - 表达式原文
 */
function checkExprNode(node, path, rawExpr) {
  if (Array.isArray(node)) {
    if (node[0] === '()' && ALLOWED_CALLS.indexOf(node[1]) === -1) {
      const segments = getMemberPath(node[1])

      if (!isFeatureCall(segments)) {
        throw new Error(
          `<data> uiData 中 "${path}" 的表达式仅支持静态系统变量引用（如 system.env.intentInfo）、` +
            `表达式计算与非耗时 Feature 调用（$t / $tc 除外），禁止调用其他函数 / 方法：${rawExpr.trim()}`
        )
      }

      const featurePath = segments.join('.')
      if (isForbiddenFeature(featurePath)) {
        throw new Error(
          `<data> uiData 中 "${path}" 的表达式不允许调用耗时 Feature "${featurePath}"（uiData 默认值在卡片创建时于 UI 线程同步求值）；` +
            `建议改用非耗时 Feature，或通过 create/update params、数据提供方下发`
        )
      }
    }
    node.forEach((item) => checkExprNode(item, path, rawExpr))
    return
  }

  if (isObject(node)) {
    Object.keys(node).forEach((key) => checkExprNode(node[key], path, rawExpr))
  }
}

/**
 * 校验 uiData 中的表达式（语法 + 调用约束）
 * 允许静态系统变量引用、表达式计算与非耗时 Feature 调用；
 * 普通函数 / 方法调用（非 system.* / service.*）与耗时 Feature（黑名单，与模板共用）报错。
 * @param {string} value - 表达式原文（含 {{}}）
 * @param {string} path - 数据路径，用于报错定位
 */
function checkExpression(value, path) {
  // 语法校验：表达式无法解析（语法错误 / 空表达式）在 loader 阶段报错
  let cardCode
  try {
    cardCode = templateValueToCardCode(value)
  } catch (e) {
    throw new Error(`<data> uiData 中 "${path}" 的表达式无法解析：${e.message}`)
  }
  if (!cardCode) {
    throw new Error(`<data> uiData 中 "${path}" 的表达式无法解析：表达式为空`)
  }

  checkExprNode(JSON.parse(cardCode), path, value)
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
 * 4. 表达式仅允许静态系统变量引用、表达式计算与非耗时 Feature 调用，
 *    普通函数 / 方法调用与耗时 Feature（与模板共用同一份黑名单）禁止，任意层级生效。
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
