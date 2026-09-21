/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import Compilation from 'webpack/lib/Compilation'
import { readJson, getStyleObjectId } from '@hap-toolkit/shared-utils'

import {
  DEFAULT_MATERIAL_RULES,
  MATERIAL_LEVEL,
  validateMaterialCard
} from '../validators/material'

const LEVEL_LABEL = {
  [MATERIAL_LEVEL.ERROR]: 'ERROR',
  [MATERIAL_LEVEL.WARN]: 'WARN',
  [MATERIAL_LEVEL.INFO]: 'INFO'
}

const CARD_ENTRY = '#entry'
const SUFFIX_UX = '.ux'

/**
 * 轻卡高级材质规范校验插件
 *
 * 在卡片编译产物（template.json / css.json）组装完成后校验背景色规范，
 * 违规项以 warnings 形式输出：报错但不阻塞打包（zip-plugin 仅在编译 errors 时跳过出包）。
 *
 * 规则可插拔：
 *   new MaterialValidatePlugin({
 *     pathSrc,
 *     rules: [...DEFAULT_MATERIAL_RULES, myRule], // 扩展或替换默认规则
 *     disabledRules: ['material/background-type-declared'],
 *     onlyLite: true,
 *     silentInfo: false
 *   })
 */
class MaterialValidatePlugin {
  constructor(options = {}) {
    const {
      pathSrc,
      rules = DEFAULT_MATERIAL_RULES,
      disabledRules = [],
      onlyLite = true,
      silentInfo = false
    } = options
    this.options = { pathSrc, rules, disabledRules, onlyLite, silentInfo }
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('MaterialValidatePlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'MaterialValidatePlugin',
          // 需晚于 CardPlugin（PROCESS_ASSETS_STAGE_ADDITIONAL）产出卡片产物
          stage: Compilation.PROCESS_ASSETS_STAGE_ANALYSE
        },
        () => {
          this.validate(compilation)
        }
      )
    })
  }

  getWidgets() {
    try {
      const manifest = readJson(path.join(this.options.pathSrc, 'manifest.json'))
      return (manifest && manifest.router && manifest.router.widgets) || {}
    } catch (err) {
      // manifest 缺失/异常由上游校验负责，这里静默跳过
      return {}
    }
  }

  getActiveRules() {
    const { rules, disabledRules } = this.options
    if (!Array.isArray(rules)) {
      return []
    }
    return rules.filter((rule) => rule && disabledRules.indexOf(rule.id) === -1)
  }

  validate(compilation) {
    const rules = this.getActiveRules()
    if (!rules.length) {
      return
    }
    const { onlyLite, silentInfo } = this.options
    const widgets = this.getWidgets()

    Object.keys(widgets).forEach((widgetKey) => {
      const widgetConf = widgets[widgetKey] || {}
      if (onlyLite && widgetConf.type !== 'lite') {
        return
      }
      const routePath = widgetKey.replace(/^\/+/, '')
      const bundleFilePath = path
        .join(routePath, widgetConf.component || 'index')
        .replace(/\\/g, '/')

      const templateAsset = compilation.getAsset(`${bundleFilePath}.template.json`)
      const styleAsset = compilation.getAsset(`${bundleFilePath}.css.json`)
      if (!templateAsset || !styleAsset) {
        // 当前构建未包含该卡片（如 --target=app）
        return
      }

      let templateRes
      let styleRes
      try {
        templateRes = JSON.parse(templateAsset.source.source().toString())
        styleRes = JSON.parse(styleAsset.source.source().toString())
      } catch (err) {
        return
      }

      const templateRoot =
        templateRes && templateRes[CARD_ENTRY] && templateRes[CARD_ENTRY].template
      if (!templateRoot) {
        return
      }
      const styles = styleRes[getStyleObjectId(bundleFilePath)] || {}

      const diagnostics = validateMaterialCard(
        {
          widgetKey,
          widgetConf,
          templateRoot,
          styles,
          bundleFilePath
        },
        rules
      )

      diagnostics
        .filter((diagnosticItem) => !(silentInfo && diagnosticItem.level === MATERIAL_LEVEL.INFO))
        .forEach((diagnosticItem) => {
          const label = LEVEL_LABEL[diagnosticItem.level] || 'WARN'
          const message =
            `### Material Validate ### [卡片高级材质] ${label}: ` +
            `${diagnosticItem.message}（卡片 ${widgetKey}，${bundleFilePath}${SUFFIX_UX}）`
          compilation.warnings.push(new Error(message))
        })
    })
  }
}

export { MaterialValidatePlugin }
