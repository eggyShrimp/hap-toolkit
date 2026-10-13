/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { templateValueToCardCode } from '@aiot-toolkit/card-expression'
import { compileOptionsObject } from '@hap-toolkit/shared-utils'
import { isExpr, isObject, isConstObjOrArray, isSimpleArr, isSimplePath } from './utils'
import { templater } from '@hap-toolkit/compiler'
const { validator } = templater

const TYPE_IMPORT = 'import'
// 需要进行后处理的模块key
const TEMPLATE_KEY = 'template'
const ACTIONS_KEY = 'actions'
// uiData（模板默认值 / 数据 schema）
const DATA_KEY = 'data'
// 生命周期钩子（编译产物中为 #entry 顶层字段）
const LIFECYCLE_HOOK_KEYS = ['create', 'update']

// 节点标记，同一节点可能同时符合多个kind定义，按priority高的进行标记
const ENUM_KIND_TYPE = {
  ELEMENT: {
    // 普通动态节点、事件节点、带id属性的节点
    kind: 1,
    priority: 1
  },
  COMPONENT: {
    // 自定义组件节点
    kind: 3,
    priority: 2
  },
  FRAGMENT: {
    // if/for 动态节点
    kind: 2,
    priority: 3
  }
}

// 处理 actions 中的字段，增加标记和处理表达式
function postHandleActions(actions) {
  if (!isObject(actions)) return

  markType(actions)
  markUrl(actions)
  markMethod(actions)
  markParams(actions)
}

function markType(actions) {
  if (isExpr(actions.type)) {
    let { rawExpr, prefixExpr } = getPrefixExpr(actions.type)
    delete actions.type
    actions['$type'] = rawExpr
    actions['#type'] = prefixExpr
  }
}

function markUrl(actions) {
  // url 可能为字符串，也可能为数组
  // 如为数组，则遍历数组进行表达式处理
  if (typeof actions.url === 'string') {
    if (isExpr(actions.url)) {
      let { rawExpr, prefixExpr } = getPrefixExpr(actions.url)
      delete actions.url
      actions['$url'] = rawExpr
      actions['#url'] = prefixExpr
    }
  } else if (Array.isArray(actions.url)) {
    let hasBinding = false
    const rawUrlList = actions.url.map((url) => {
      if (isExpr(url)) {
        hasBinding = true
        let { rawExpr } = getPrefixExpr(url)
        return `{{${rawExpr}}}`
      }
      return url
    })

    const prefixUrlList = actions.url.map((url) => {
      if (isExpr(url)) {
        hasBinding = true
        let { prefixExpr } = getPrefixExpr(url)
        return prefixExpr
      }
      return url
    })

    if (hasBinding) {
      delete actions.url
      actions['$url'] = rawUrlList
      actions['#url'] = prefixUrlList
    }
  }
}
function markMethod(actions) {
  if (isExpr(actions.method)) {
    let { rawExpr, prefixExpr } = getPrefixExpr(actions.method)
    delete actions.method
    actions['$method'] = rawExpr
    actions['#method'] = prefixExpr
  }
}

function markParams(actions) {
  if (!isObject(actions.params)) return

  // 标准只支持一级结构中绑定变量，做一级结构的key遍历即可
  Object.keys(actions.params).forEach((key) => {
    const value = actions.params[key]
    if (isExpr(value)) {
      let { rawExpr, prefixExpr } = getPrefixExpr(value)
      delete actions.params[key]
      actions.params['$' + key] = rawExpr
      actions.params['#' + key] = prefixExpr
    }
  })
}

// 处理 uiData（#entry 顶层 data 字段）中的表达式，支持任意层级结构
// - 对象 key：保留原字面量，追加 $key（原文/快捷值）与 #key（AST），与 actions/create params 同构
// - 数组元素：无法追加兄弟字段，表达式元素替换为标记对象 { "#": AST, "$": 原文 }
function postHandleData(data, compName) {
  if (!isObject(data)) return

  const descPrefix = `卡片 ${compName} 的 <data> uiData 中`
  markDataObject(data, '', descPrefix)
}

// 对象层级：字符串表达式值追加 $key / #key 兄弟字段（保留原字面量，供旧引擎降级）
function markDataObject(obj, parentPath, descPrefix) {
  Object.keys(obj).forEach((key) => {
    const path = parentPath ? `${parentPath}.${key}` : key
    const value = obj[key]

    if (typeof value === 'string' && isExpr(value)) {
      const { rawExpr, prefixExpr } = compileDataExpr(value, `${descPrefix} "${path}"`)
      obj['$' + key] = rawExpr
      obj['#' + key] = prefixExpr
      return
    }

    obj[key] = markDataValue(value, path, descPrefix)
  })
}

// 值层级：数组递归；数组内的表达式元素替换为 { "#", "$" } 标记对象
function markDataValue(value, path, descPrefix) {
  if (Array.isArray(value)) {
    return value.map((item, index) => markDataValue(item, `${path}[${index}]`, descPrefix))
  }

  if (isObject(value)) {
    markDataObject(value, path, descPrefix)
    return value
  }

  if (typeof value === 'string' && isExpr(value)) {
    const { rawExpr, prefixExpr } = compileDataExpr(value, `${descPrefix} "${path}"`)
    return { '#': prefixExpr, $: rawExpr }
  }

  return value
}

function compileDataExpr(value, desc) {
  try {
    return getPrefixExpr(value)
  } catch (e) {
    throw new Error(`${desc} 的表达式编译失败：${e.message}`)
  }
}

// 处理 template 中的字段，增加标记和处理表达式
function postHandleCompTemplate(template, liteCardRes, compName) {
  if (!isObject(template)) return

  markStyle(template)
  markClass(template)
  markClassList(template)
  markAttr(template)
  markEvents(template)
  markId(template)
  markIs(template)
  markIf(template)
  markFor(template)
  markCustomComp(template, liteCardRes, compName)

  const children = template.children
  if (children && Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      postHandleCompTemplate(child, liteCardRes, compName)
    }
  }
}

// 获取kind值对应的优先级
function getPriority(kind) {
  let prioity = kind
  Object.keys(ENUM_KIND_TYPE).some((key) => {
    const item = ENUM_KIND_TYPE[key]
    if (item.kind === kind) {
      prioity = item.priority
      return true
    }
  })
  return prioity
}

// 根据优先级标记节点的 kind 值
function markKind(oldKind, newKind) {
  if (!oldKind) return newKind

  const oldPriority = getPriority(oldKind)
  const newPriority = getPriority(newKind)
  if (oldPriority < newPriority) return newKind

  return oldKind
}

function markCustomComp(template, liteCardRes, compName) {
  if (!isObject(liteCardRes[compName][TYPE_IMPORT])) return

  const importList = Object.keys(liteCardRes[compName][TYPE_IMPORT])

  if (importList.includes(template.type)) {
    template.import = liteCardRes[compName][TYPE_IMPORT][template.type]
    template.kind = markKind(template.kind, ENUM_KIND_TYPE.COMPONENT.kind)
  }
}

function markIf(template) {
  if (!template.shown) return

  if (isExpr(template.shown)) {
    let { rawExpr, prefixExpr } = getPrefixExpr(template.shown)
    delete template.shown
    template['$shown'] = rawExpr
    template['#shown'] = prefixExpr
  }
  template.kind = markKind(template.kind, ENUM_KIND_TYPE.FRAGMENT.kind)
}

function markIs(template) {
  if (!template.is) return

  if (isExpr(template.is)) {
    let { rawExpr, prefixExpr } = getPrefixExpr(template.is)
    delete template.is
    template['$is'] = rawExpr
    template['#is'] = prefixExpr
    template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT.kind)
  }
}

function markId(template) {
  if (!template.id) return

  if (isExpr(template.id)) {
    let { rawExpr, prefixExpr } = getPrefixExpr(template.id)
    delete template.id
    template['$id'] = rawExpr
    template['#id'] = prefixExpr
  }
  // 节点有id属性，标记为kind 为 1
  template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT.kind)
}

function markFor(template) {
  if (!template.repeat) return

  if (isObject(template.repeat)) {
    if (isExpr(template.repeat.exp)) {
      /**
       * example 1:
        <div for="{{(index, item) in ItemList}}">   ->
        "repeat": {
          "$exp": "ItemList",
          "#exp": ["$", "ItemList"],
          "key": "index",
          "value": "item"
        },

        example 2:
        <div for="{{(index, item) in [1,2,3]}}">   ->
        "repeat": {
          "$exp": "[1, 2, 3]",
          "#exp": "[\"~\",1,2,3]",
          "key": "index",
          "value": "item"
        },
      */
      let { rawExpr, prefixExpr } = getPrefixExpr(template.repeat.exp)
      delete template.repeat.exp
      template.repeat['$exp'] = rawExpr
      template.repeat['#exp'] = prefixExpr
    }
  } else if (isExpr(template.repeat)) {
    /**
      <div for="{{ItemList}}">   ->
      "$repeat": "ItemList",
      "#repeat": ["$", "ItemList"],
    */
    let { rawExpr, prefixExpr } = getPrefixExpr(template.repeat)
    delete template.repeat
    template['$repeat'] = rawExpr
    template['#repeat'] = prefixExpr
  }
  template.kind = markKind(template.kind, ENUM_KIND_TYPE.FRAGMENT.kind)
}

function markStyle(template) {
  if (!template.style) return

  const style = template.style
  if (typeof style === 'object') {
    Object.keys(style).forEach((key) => {
      const value = style[key]
      if (isExpr(value)) {
        let { rawExpr, prefixExpr } = getPrefixExpr(value)
        delete template.style[key]
        template.style['$' + key] = rawExpr
        template.style['#' + key] = prefixExpr
        template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT.kind)
      }
    })
  } else {
    if (isExpr(style)) {
      let { rawExpr, prefixExpr } = getPrefixExpr(style)
      delete template.style
      template['$style'] = rawExpr
      template['#style'] = prefixExpr
      template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT.kind)
    }
  }
}

function markClass(template) {
  if (!template.class || template.class.length === 0) return

  if (isExpr(template.class)) {
    let { rawExpr, prefixExpr } = getPrefixExpr(template.class)
    delete template.class
    template['$class'] = rawExpr
    template['#class'] = prefixExpr
    template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT.kind)
  }
}

function markClassList(template) {
  if (!template.classList || template.classList.length === 0) return

  let hasBinding = false
  const prefixExprList = template.classList.map((classEle) => {
    if (isExpr(classEle)) {
      hasBinding = true
      let { prefixExpr } = getPrefixExpr(classEle)
      return prefixExpr
    }
    return classEle
  })

  if (hasBinding) {
    // 如果 classList 元素有表达式
    delete template.classList
    template['#classList'] = prefixExprList
    template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT)
  }
}

function markEvents(template) {
  if (template.events) {
    template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT.kind)
  }
}

function markAttr(template) {
  if (!template.attr) return

  const attr = template.attr
  if (isObject(attr)) {
    Object.keys(attr).forEach((attrKey) => {
      const attrValue = attr[attrKey]
      if (isExpr(attrValue)) {
        let { rawExpr, prefixExpr } = getPrefixExpr(attrValue)
        delete attr[attrKey]
        attr['$' + attrKey] = rawExpr
        attr['#' + attrKey] = prefixExpr
        template.kind = markKind(template.kind, ENUM_KIND_TYPE.ELEMENT.kind)
      }
    })
  }
}

function getExprRes(exprRaw) {
  const tokens = validator.parseText(exprRaw.trim())
  if (tokens.length > 1) {
    return exprRaw
  }

  const parsed = tokens[0].value
  if (isConstObjOrArray(parsed)) {
    // 简单表达式 {{ [1,2,3] }}、{{ {a: 1} }}
    // eslint-disable-next-line no-eval
    return eval(`(${parsed})`)
  } else if (isSimplePath(parsed) && isSimpleArr(parsed)) {
    // 简单表达式 {{name}}、{{title.name}}、{{title['name']}}、{{title[0]}}
    return parsed // {{ name }} -> name
  } else {
    // 复杂表达式，返回function形式的表达式结果
    return exprRaw // {{a + b}} -> function () { return this.a + this.b }
  }
}

function getPrefixExpr(exprRaw) {
  const res = templateValueToCardCode(exprRaw)
  const parsed = JSON.parse(res)
  const rawExpr = getExprRes(exprRaw)
  return {
    rawExpr: rawExpr, // {{ name }} -> name
    prefixExpr: parsed // {{ name }} -> ['$', 'name']
  }
}

export function postHandleLiteCardRes(liteCardRes) {
  const uxList = Object.keys(liteCardRes)

  // template
  for (let i = 0; i < uxList.length; i++) {
    const compName = uxList[i]
    postHandleCompTemplate(liteCardRes[compName][TEMPLATE_KEY], liteCardRes, compName)
    // delete liteCardRes[compName][TYPE_IMPORT]
  }

  // actions
  for (let i = 0; i < uxList.length; i++) {
    const compName = uxList[i]
    const actionEvents = liteCardRes[compName][ACTIONS_KEY]
    if (actionEvents) {
      Object.keys(actionEvents).forEach((eventName) => {
        postHandleActions(actionEvents[eventName])
      })
    }
  }

  // uiData 表达式编译（开关控制，默认关闭；引擎契约确认后翻转默认值）
  if (compileOptionsObject.enableUiDataExpression) {
    for (let i = 0; i < uxList.length; i++) {
      const compName = uxList[i]
      postHandleData(liteCardRes[compName][DATA_KEY], compName)
    }
  }

  // 生命周期钩子 create / update（#entry 顶层字段），编译其 params 表达式
  // 与 actions params 使用相同的编译规则（复用 markParams）
  for (let i = 0; i < uxList.length; i++) {
    const compName = uxList[i]
    LIFECYCLE_HOOK_KEYS.forEach((hookKey) => {
      const hookObj = liteCardRes[compName][hookKey]
      if (isObject(hookObj)) {
        markParams(hookObj)
      }
    })
  }

  return liteCardRes
}
