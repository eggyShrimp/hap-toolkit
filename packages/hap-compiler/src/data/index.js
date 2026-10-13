/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { checkUiData } from './validator'

/**
 * 解析并校验轻卡 <data> 块中的 uiData
 * @param {Object} uiData - uiData 对象
 * @returns {Object}
 */
function parse(uiData) {
  checkUiData(uiData)

  return {
    jsonData: uiData
  }
}

export default {
  parse
}
