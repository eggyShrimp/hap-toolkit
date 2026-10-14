/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 轻卡材质校验：动态表达式值集合展开
 *
 * 背景值中的 {{expr}} 经 @aiot-toolkit/card-expression 编为卡片表达式 AST（opcode 数组），
 * 本模块将 AST 展开为「所有可能取值集合」，供规则逐值判定：
 * - 可枚举（字面量 / 一元 / 二元 / 三元 / 白名单函数 / 数组 / 对象）→ 值集合
 * - 不可枚举（数据路径 / Feature 调用 / $t / $tc / 白名单外 opcode）→ 标记 unresolved
 * 口径见技术方案「AST 确定动态表达式下样式范围」：unknown 保守传播，
 * 数据只出现在控制位（如三元条件）不影响枚举，流入值位（可能成为结果本身）即不可枚举。
 */

import { templateValueToCardCode } from '@aiot-toolkit/card-expression'

// 掩码占位符：CSS 解析器会把值中的 `}`、`;` 当作声明/规则边界截断，
// 解析前将表达式内部字符替换为等长占位符，保证解析成功且行列号不变
const MASK_OPEN = '\u0001'
const MASK_CLOSE = '\u0002'
const MASK_SEMI = '\u0003'

const EXPRESSION_REGEXP = /\{\{[\s\S]*?\}\}/g
// 值集合规模上限，超限按不可枚举处理（避免组合爆炸）
const MAX_SET_SIZE = 256
// 运行时可枚举的纯函数白名单（与卡片表达式协议一致）
const ENUMERABLE_FUNCTIONS = ['clamp', 'round', 'floor', 'ceil', 'join']

class UnresolvedError extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}

function unresolved(reason) {
  throw new UnresolvedError(reason)
}

/**
 * 将代码中 {{...}} 内部字符掩码为占位符（长度不变，行列号不受影响）
 * @param {String} code - 样式代码
 * @returns {String} 掩码后的样式代码
 */
export function maskExpressions(code) {
  if (typeof code !== 'string' || code.indexOf('{{') === -1) {
    return code
  }
  return code.replace(EXPRESSION_REGEXP, (match) =>
    match.split('{').join(MASK_OPEN).split('}').join(MASK_CLOSE).split(';').join(MASK_SEMI)
  )
}

/**
 * 将掩码后的值还原为原文
 * @param {*} value - 掩码后的值
 * @returns {*} 还原后的值
 */
export function unmaskValue(value) {
  if (typeof value !== 'string') {
    return value
  }
  return value.split(MASK_OPEN).join('{').split(MASK_CLOSE).join('}').split(MASK_SEMI).join(';')
}

function isPrimitive(node) {
  return (
    node === null ||
    node === undefined ||
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'boolean'
  )
}

function isTruthy(value) {
  return !!value
}

function valueKey(value) {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'object') {
    try {
      return 'object:' + JSON.stringify(value)
    } catch (err) {
      return 'object:' + String(value)
    }
  }
  return typeof value + ':' + String(value)
}

function dedupe(values) {
  const seen = {}
  const result = []
  values.forEach((value) => {
    const key = valueKey(value)
    if (!seen[key]) {
      seen[key] = true
      result.push(value)
    }
  })
  return result
}

/**
 * 集合笛卡尔组合，规模超限即不可枚举
 */
function cartesian(sets) {
  let combinations = [[]]
  sets.forEach((set) => {
    const next = []
    combinations.forEach((combo) => {
      set.forEach((value) => {
        next.push(combo.concat([value]))
        if (next.length > MAX_SET_SIZE) {
          unresolved('可能取值过多')
        }
      })
    })
    combinations = next
  })
  return combinations
}

function applyBinary(op, left, right) {
  switch (op) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      return left / right
    case '%':
      return left % right
    case '**':
      return Math.pow(left, right)
    case '===':
      return left === right
    case '!==':
      return left !== right
    case '==':
      // 与运行时 JS 语义一致
      // eslint-disable-next-line eqeqeq
      return left == right
    case '!=':
      // eslint-disable-next-line eqeqeq
      return left != right
    case '>':
      return left > right
    case '<':
      return left < right
    case '>=':
      return left >= right
    case '<=':
      return left <= right
    default:
      return unresolved('不支持的表达式运算 ' + op)
  }
}

function binaryValues(op, leftNode, rightNode) {
  const leftValues = evaluate(leftNode)
  const rightValues = evaluate(rightNode)
  return cartesian([leftValues, rightValues]).map((pair) => applyBinary(op, pair[0], pair[1]))
}

function logicalValues(op, leftNode, rightNode) {
  // && / || 的操作数本身可能即结果，含 unknown 即整体不可枚举（右侧无条件求值）
  const leftValues = evaluate(leftNode)
  const rightValues = evaluate(rightNode)
  const result = []
  leftValues.forEach((left) => {
    if (op === '&&') {
      if (left) {
        result.push(...rightValues)
      } else {
        result.push(left)
      }
    } else if (left) {
      result.push(left)
    } else {
      result.push(...rightValues)
    }
  })
  return dedupe(result)
}

function conditionalValues(testNode, consequentNode, alternateNode) {
  let testValues
  try {
    testValues = evaluate(testNode)
  } catch (err) {
    if (err instanceof UnresolvedError) {
      // 条件不可判定 → 取两支并集
      return dedupe(evaluate(consequentNode).concat(evaluate(alternateNode)))
    }
    throw err
  }
  const hasTruthy = testValues.some(isTruthy)
  const hasFalsy = testValues.some((value) => !isTruthy(value))
  if (hasTruthy && hasFalsy) {
    return dedupe(evaluate(consequentNode).concat(evaluate(alternateNode)))
  }
  return hasTruthy ? evaluate(consequentNode) : evaluate(alternateNode)
}

function applyEnumerableFunction(name, args) {
  switch (name) {
    case 'clamp':
      return Math.min(Math.max(args[0], args[1]), args[2])
    case 'round':
      return Math.round(args[0])
    case 'floor':
      return Math.floor(args[0])
    case 'ceil':
      return Math.ceil(args[0])
    case 'join':
      return Array.prototype.join.call(args[0], args[1])
    default:
      return unresolved('调用函数 ' + name + ' 无法判定')
  }
}

function callValues(callee, argNodes) {
  let name
  if (typeof callee === 'string') {
    // $t / $tc 等函数不可枚举
    unresolved('调用函数 ' + callee)
  } else if (
    Array.isArray(callee) &&
    callee[0] === '$' &&
    ENUMERABLE_FUNCTIONS.indexOf(callee[1]) > -1
  ) {
    name = callee[1]
  } else {
    unresolved('调用函数无法判定')
  }
  const argSets = argNodes.map((item) => evaluate(item))
  try {
    return cartesian(argSets).map((args) => applyEnumerableFunction(name, args))
  } catch (err) {
    if (err instanceof UnresolvedError) {
      throw err
    }
    return unresolved('调用函数 ' + name + ' 无法判定')
  }
}

function memberValues(objectNode, propertyNode) {
  const objects = evaluate(objectNode)
  const properties = evaluate(propertyNode)
  return cartesian([objects, properties]).map((pair) => {
    const object = pair[0]
    const property = pair[1]
    if (object === null || object === undefined) {
      return undefined
    }
    try {
      return object[property]
    } catch (err) {
      return unresolved('成员取值无法判定')
    }
  })
}

function objectValues(properties) {
  const keys = Object.keys(properties || {})
  const valueSets = keys.map((key) => evaluate(properties[key]))
  return cartesian(valueSets).map((values) => {
    const result = {}
    keys.forEach((key, index) => {
      result[key] = values[index]
    })
    return result
  })
}

function evaluate(node) {
  if (isPrimitive(node)) {
    return [node]
  }
  if (!Array.isArray(node) || typeof node[0] !== 'string') {
    unresolved('表达式结构无法判定')
  }
  const op = node[0]
  switch (op) {
    case '$':
      // 标识符（数据路径）；undefined 按字面量处理
      if (node[1] === 'undefined') {
        return [undefined]
      }
      throw new UnresolvedError('访问数据路径 ' + String(node[1]))
    case 'neg':
      return evaluate(node[1]).map((value) => -value)
    case '!':
      return evaluate(node[1]).map((value) => !value)
    case '+':
      if (node.length === 2) {
        // 一元 +
        return evaluate(node[1]).map((value) => +value)
      }
      return binaryValues(op, node[1], node[2])
    case '-':
    case '*':
    case '/':
    case '%':
    case '**':
    case '===':
    case '!==':
    case '==':
    case '!=':
    case '>':
    case '<':
    case '>=':
    case '<=':
      return binaryValues(op, node[1], node[2])
    case '&&':
    case '||':
      return logicalValues(op, node[1], node[2])
    case '?:':
      return conditionalValues(node[1], node[2], node[3])
    case '()':
      return callValues(node[1], node.slice(2))
    case '~':
      return cartesian(node.slice(1).map((item) => evaluate(item)))
    case '{}':
      return objectValues(node[1])
    case '.':
    case '[]':
      return memberValues(node[1], node[2])
    default:
      return unresolved('不支持的表达式运算 ' + op)
  }
}

/**
 * 展开模板值中的 {{expr}} 为所有可能取值集合
 *
 * @param {String} rawValue - 原始值（纯表达式 / 与字面量混排 / 静态值均可）
 * @returns {{enumerable: Boolean, values: Array|undefined, reason: String|undefined}}
 *   - enumerable 为 true 时 values 为可能取值集合（静态值为退化集合，单元素）
 *   - enumerable 为 false 时 reason 说明不可判定的原因
 */
export function expandTemplateValue(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.indexOf('{{') === -1) {
    return { enumerable: true, values: [rawValue] }
  }
  let astString
  try {
    astString = templateValueToCardCode(rawValue)
  } catch (err) {
    return { enumerable: false, reason: '表达式无法解析' }
  }
  let ast
  try {
    ast = JSON.parse(astString)
  } catch (err) {
    return { enumerable: false, reason: '表达式无法解析' }
  }
  try {
    return { enumerable: true, values: dedupe(evaluate(ast)) }
  } catch (err) {
    if (err instanceof UnresolvedError) {
      return { enumerable: false, reason: err.reason }
    }
    return { enumerable: false, reason: '表达式无法判定' }
  }
}
