/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import loaderUtils from 'loader-utils'
import { parseFragmentsWithCache, ENTRY_TYPE, templater } from '@hap-toolkit/compiler'
import { globalConfig, compileOptionsObject } from '@hap-toolkit/shared-utils'

import {
  processImportFrag,
  processTemplateFrag,
  processStyleFrag,
  processScriptFrag,
  processDataFrag,
  processActionFrag,
  processCreateFrag,
  processUpdateFrag,
  processPropsFrag,
  parseImportList,
  // honor process frag
  processCommandFrag,
  processDataAppFrag
  // end honor process frag
} from './ux-fragment-utils'
import { buildCardContext } from './card-context'
import { getNameByPath, print, isUXRender } from './common/utils'

const { validator } = templater

/**
 * 收集结果
 * @param $loader
 * @param frags
 * @param name
 * @param uxType
 * @param lite 1: 轻卡; 0: 普通卡
 * @param source - .ux 源码（片段起始行计算用）
 * @return {String}
 */
function assemble($loader, frags, name, queryOptions, source) {
  const { uxType, lite } = queryOptions
  const isUseTreeShaking = !!globalConfig.useTreeShaking
  // 外部导入的组件列表
  const importNames = []
  // 处理导入的组件
  const importFrag = processImportFrag($loader, frags.import, importNames, queryOptions)

  let moduleExports = `     $app_script$($app_module$, $app_exports$, $app_require$)
        if ($app_exports$.__esModule && $app_exports$.default) {
          $app_module$.exports = $app_exports$.default
        }`
  if (isUseTreeShaking) {
    moduleExports = `
        if($app_script$.default) {
          $app_module$.exports = $app_script$.default
        }`
  }
  if (frags.script.length <= 0) {
    moduleExports = ''
  }

  // prettier-ignore
  let content = `${importFrag}\n`
  if (!lite) {
    // process script for JS card
    content += `var $app_script$ = ${processScriptFrag($loader, frags.script, queryOptions)}\n`
  }
  content +=
    `$app_define$('@app-component/${name}', [], function($app_require$, $app_exports$, $app_module$) {\n` +
    `${moduleExports}\n` +
    `    $app_module$.exports.template = ${processTemplateFrag(
      $loader,
      frags.template,
      importNames,
      queryOptions
    )}\n`
  // $app_define$ function content
  if (frags.style.length > 0) {
    content += `    $app_module$.exports.style = ${processStyleFrag(
      $loader,
      frags.style,
      queryOptions,
      source
    )}\n`
  }
  if (lite) {
    // process <data> for lite card
    content += `    $app_module$.exports.uidata = ${processDataFrag(
      $loader,
      frags.data,
      queryOptions
    )}\n`
    content += `    $app_module$.exports.actions = ${processActionFrag(
      $loader,
      frags.data,
      queryOptions
    )}\n`
    content += `    $app_module$.exports.create = ${processCreateFrag(
      $loader,
      frags.data,
      queryOptions
    )}\n`
    content += `    $app_module$.exports.update = ${processUpdateFrag(
      $loader,
      frags.data,
      queryOptions
    )}\n`
    content += `    $app_module$.exports.props = ${processPropsFrag(
      $loader,
      frags.data,
      queryOptions
    )}\n`
    // process honor frag
    content += `    $app_module$.exports.app = ${processDataAppFrag(
      $loader,
      frags.data,
      queryOptions
    )}\n`
    content += `    $app_module$.exports.commands = ${processCommandFrag(
      $loader,
      frags.data,
      queryOptions
    )}\n`
    // end process honor frag
    content += `    $app_data$($app_module$, $app_require$)\n`
  }
  content +=
    `});\n` +
    `${
      isUXRender(uxType)
        ? `$app_bootstrap$('@app-component/${name}',{ packagerVersion: QUICKAPP_TOOLKIT_VERSION })`
        : ''
    };`

  if (uxType === ENTRY_TYPE.COMP && compileOptionsObject.enableLazyComponent) {
    content += `$app_define_wrap$('@app-component/${name}', function () {
    })`
  }
  content = content.replace(/\n[ \n]*\n/gm, '\n')
  return content
}

/**
 * ux文件解析总入口
 * @param source
 */
export default function uxLoader(source) {
  const callback = this.async()

  // /root/sample/src/component/basic/image/index.ux
  const resourcePath = this.resourcePath // 当前文件绝对路径
  const key = path.relative(globalConfig.SRC_DIR, resourcePath.replace(/\.ux$/, '.js'))
  globalConfig.changedJS[key] = true

  const { ext } = path.parse(resourcePath)

  if (['.mix', '.ux'].indexOf(ext) === -1) {
    callback(new Error(`未知文件格式：${ext}`))
    return
  }
  const resourceQuery = loaderUtils.parseQuery(this.resourceQuery || '?') // 在文件url中传入的参数'path?xxx'

  const queryOptions = {
    uxType: resourceQuery.uxType, // 文件类型
    newJSCard: resourceQuery.newJSCard, // 新打包格式的 JS卡
    lite: resourceQuery.lite, // 轻卡
    cardEntry: resourceQuery.cardEntry, // 卡片入口
    minCardRuntimeVersion: resourceQuery.minCardRuntimeVersion, // 卡片配置的最小平台版本
    isTargetVivo: resourceQuery.isTargetVivo // 厂商是否包含vivo
  }
  // 使用原有文件名（不包含扩展名）
  const name = resourceQuery.name || getNameByPath(resourcePath)

  if (validator.isReservedTag(name)) {
    this.emitWarning(new Error('脚本文件名不能使用保留字:' + name))
  }

  print({
    resourceQuery: this.resourceQuery,
    resourcePath: resourcePath,
    name: name
  })

  // 解析模板，提取各个类型的节点和依赖组件列表
  const frags = parseFragmentsWithCache(source, resourcePath)
  print(frags)

  // 轻卡高级材质：读取 manifest.backgroundType 与模板根节点信息，合成单一上下文随片段透传；
  // 取不到（非轻卡 / 模板缺失 / 动态 class 等）时静默降级，不携带上下文
  if (
    queryOptions.uxType === ENTRY_TYPE.CARD &&
    queryOptions.lite &&
    queryOptions.cardEntry &&
    frags.template.length
  ) {
    const cardCtx = buildCardContext({
      source,
      template: frags.template[0],
      cardEntry: queryOptions.cardEntry
    })
    if (cardCtx) {
      queryOptions.cardCtx = cardCtx
    }
  }

  parseImportList(this, frags.import)
    .then(() => {
      return assemble(this, frags, name, queryOptions, source)
    })
    .then((result) => {
      callback(null, result)
    })
    .catch((err) => {
      callback(err, '')
    })
}
