/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseData } from '@hap-toolkit/compiler'
import { compileOptionsObject } from '@hap-toolkit/shared-utils'

export default function dataLoader(source) {
  let jsonObj = {}
  try {
    const obj = JSON.parse(source)
    jsonObj = obj.uiData || obj.data || {}
  } catch (e) {
    throw new Error(`${this.resourcePath} 中的 <data> 解析失败，请检查是否为标准的 JSON 格式\n${e}`)
  }

  // uiData 表达式编译的源码阶段校验（开关与编译产物一致）
  if (compileOptionsObject.enableUiDataExpression) {
    try {
      parseData(jsonObj)
    } catch (e) {
      throw new Error(`${this.resourcePath} 中的 <data> uiData 校验失败：${e.message}`)
    }
  }

  return `module.exports = ${JSON.stringify(jsonObj)}`
}
