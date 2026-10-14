/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { sync as resolveSync } from 'resolve'
import path from 'path'
import { globalConfig, compileOptionsObject } from '@hap-toolkit/shared-utils'
import { getBabelConfigJsPath } from '@hap-toolkit/packager'
import { ENTRY_TYPE, templater } from '@hap-toolkit/compiler'

import {
  stringifyLoaders,
  makeRequireString,
  getNameByPath,
  print,
  getFragmentContentLine,
  FRAG_TYPE,
  isUXRender
} from './common/utils'

const { validator } = templater
// 项目目录
const cwd = path.resolve(globalConfig.projectPath)

/**
 * 生成片段请求的公共资源查询参数（单一构造器的一部分：新增上下文参数只需改这里，
 * 各片段自动携带，避免重复拼参时漏参静默失效）
 *
 * @param {Object} queryOptions - ux-loader 透传的查询上下文（含 cardCtx）
 * @returns {String[]} 公共参数片段数组
 */
function buildCommonQueryParts(queryOptions = {}) {
  const { newJSCard, lite, cardEntry, minCardRuntimeVersion, isTargetVivo, cardCtx } = queryOptions
  const parts = []
  if (newJSCard) {
    parts.push(`newJSCard=${newJSCard}`)
  }
  if (lite) {
    parts.push(`lite=${lite}`)
  }
  if (cardEntry) {
    parts.push(`cardEntry=${encodeURIComponent(cardEntry)}`)
  }
  if (minCardRuntimeVersion) {
    parts.push(`minCardRuntimeVersion=${minCardRuntimeVersion}`)
  }
  if (isTargetVivo) {
    parts.push(`isTargetVivo=${isTargetVivo}`)
  }
  if (cardCtx) {
    // 单一版本化上下文参数（轻卡材质校验用），取值随片段请求透传
    parts.push(`cardCtx=${encodeURIComponent(JSON.stringify(cardCtx))}`)
  }
  return parts
}

/**
 * 生成片段请求的资源查询串（不含前导 `?`）
 *
 * @param {String} uxType - 文件类型
 * @param {String[]} extraParts - 片段专属参数（如 importNames、uxPath、styleLine）
 * @param {Object} queryOptions - ux-loader 透传的查询上下文
 * @returns {String}
 */
function buildFragmentQuery(uxType, extraParts, queryOptions) {
  const parts = []
  if (uxType) {
    parts.push(`uxType=${uxType}`)
  }
  ;(extraParts || []).forEach((part) => {
    if (part) {
      parts.push(part)
    }
  })
  parts.push(...buildCommonQueryParts(queryOptions))
  return parts.join('&')
}

const defaultLoaders = {
  // common
  sass: resolveSync('sass-loader'),
  scss: resolveSync('sass-loader'),
  less: resolveSync('less-loader'),
  component: resolveSync('./ux-loader.js'),
  data: resolveSync('./data-loader.js'),
  action: resolveSync('./action-loader.js'),
  create: resolveSync('./create-loader.js'),
  update: resolveSync('./update-loader.js'),
  props: resolveSync('./props-loader.js'),
  fragment: resolveSync('./fragment-loader.js'),
  template: resolveSync('./template-loader.js'),
  style: resolveSync('./style-loader.js'),
  script: resolveSync('./script-loader.js'),
  module: resolveSync('@hap-toolkit/packager/lib/loaders/module-loader.js'),
  babel: resolveSync('babel-loader'),
  // app
  mainfest: resolveSync('@hap-toolkit/packager/lib/loaders/manifest-loader.js'),
  // page
  access: resolveSync('./access-loader.js'),
  'extract-css': resolveSync('./extract-css-loader.js'),
  // honor loader
  datapp: resolveSync('./datapp-loader.js'),
  command: resolveSync('./command-loader.js')
  // end honor loader
}

/**
 * 生成loader请求代码
 * @param type
 * @param config
 * @param uxType
 * @returns {*}
 */
function makeLoaderString(type, config, newJSCard, uxType) {
  config = config || {}
  let loaders

  if (type === FRAG_TYPE.IMPORT) {
    loaders = [
      {
        name: defaultLoaders.component,
        query: {
          cwd,
          type: FRAG_TYPE.IMPORT
        }
      }
    ]
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.TEMPLATE) {
    loaders = [
      {
        name: defaultLoaders.template
      }
    ]
    if (!config.alone) {
      // 如果<template>不是单独文件，则需要提取
      loaders.push({
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.TEMPLATE
        }
      })
    }
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.DATA) {
    loaders = [
      {
        name: defaultLoaders.data
      },
      {
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.DATA
        }
      }
    ]
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.ACTIONS) {
    loaders = [
      {
        name: defaultLoaders.action
      },
      {
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.DATA
        }
      }
    ]
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.CREATE) {
    loaders = [
      {
        name: defaultLoaders.create
      },
      {
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.DATA
        }
      }
    ]
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.UPDATE) {
    loaders = [
      {
        name: defaultLoaders.update
      },
      {
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.DATA
        }
      }
    ]
    return stringifyLoaders(loaders)
  }

  // honor loader
  if (type === FRAG_TYPE.DATAPP) {
    loaders = [
      {
        name: defaultLoaders.datapp
      },
      {
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.DATA
        }
      }
    ]
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.COMMANDS) {
    loaders = [
      {
        name: defaultLoaders.command
      },
      {
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.DATA
        }
      }
    ]
    return stringifyLoaders(loaders)
  }
  // end honor loader

  if (type === FRAG_TYPE.PROPS) {
    loaders = [
      {
        name: defaultLoaders.props
      },
      {
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.DATA
        }
      }
    ]
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.STYLE) {
    loaders = [
      {
        name: defaultLoaders.style,
        query: {
          index: 0,
          type: FRAG_TYPE.STYLE
        }
      }
    ]

    if (compileOptionsObject.enableExtractCss && !newJSCard) {
      loaders.unshift({
        name: defaultLoaders['extract-css']
      })
    }

    let lang = config.lang
    if (lang && lang !== 'css') {
      loaders.push({
        name: defaultLoaders[lang],
        // 预处理样式（sass/less）与 devtool 解耦：始终生成 source map，
        // 供轻卡材质校验把位置映射回源码（默认仅在 devtool 开启时生成）
        query: {
          sourceMap: true
        }
      })
    }

    if (!config.alone) {
      // 如果<style>不是单独文件，则需要提取
      loaders.push({
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.STYLE
        }
      })
    }
    return stringifyLoaders(loaders)
  }

  if (type === FRAG_TYPE.SCRIPT) {
    const configFile = getBabelConfigJsPath(cwd, !!globalConfig.useTreeShaking)
    loaders = []

    if (compileOptionsObject.enableIstanbul) {
      loaders.push({
        name: 'istanbul-instrumenter-loader',
        query: {}
      })
    }

    loaders.push(
      {
        name: defaultLoaders.script
      },
      {
        name: defaultLoaders.module
      }
    )
    if (uxType === ENTRY_TYPE.APP) {
      loaders.push(
        {
          name: defaultLoaders.mainfest,
          query: {
            path: path.dirname(config.path)
          }
        },
        {
          name: defaultLoaders.babel,
          query: {
            cwd,
            cacheDirectory: true,
            comments: false,
            configFile
          }
        }
      )
      compileOptionsObject.enableDiagnosis &&
        loaders.push({
          name: resolveSync('@hap-toolkit/packager/lib/loaders/diagnosis-loader.js'),
          query: {
            pureScript: true,
            hookName: 'onCreate',
            hostName: compileOptionsObject.enableDiagnosis
          }
        })
    } else {
      loaders.push({
        name: defaultLoaders.babel,
        query: {
          cwd,
          cacheDirectory: true,
          plugins: [resolveSync('./babel-plugin-jsx.js')],
          comments: false,
          configFile
        }
      })
      if (isUXRender(uxType)) {
        loaders.push({
          name: defaultLoaders.access
        })
      }
    }

    if (!config.alone) {
      // 如果<script>不是单独文件，则需要提取
      loaders.push({
        name: defaultLoaders.fragment,
        query: {
          index: 0,
          type: FRAG_TYPE.SCRIPT
        }
      })
    }

    compileOptionsObject.enableE2e &&
      loaders.push({
        name: resolveSync('@hap-toolkit/packager/lib/loaders/inject-suite-loader.js'),
        query: {
          hookName: 'onCreate'
        }
      })

    return stringifyLoaders(loaders)
  }
}

/**
 * 处理import片段
 * @param $loader
 * @param imports - 外部导入的组件列表
 * @param importNames - 外部导入的组件名列表
 * @param {number} newJSCard 新打包格式JS卡
 * @param {number} lite 轻卡
 * @returns {string}
 */
function processImportFrag($loader, imports, importNames, queryOptions = {}) {
  const { newJSCard } = queryOptions
  let retStr = ''
  if (imports.length) {
    for (let i = 0; i < imports.length; i++) {
      const imp = imports[i]
      let importSrc = imp.attrs.src
      let importName = imp.attrs.name
      if (!importSrc) {
        $loader.emitWarning(new Error('导入组件需要设置属性 `src` '))
        return ''
      }

      if (!imp.isValid) {
        $loader.emitError(new Error(`导入组件resolve 出错 ${imp.err}`))
        return ''
      }

      // 合法并赋值最终路径
      importSrc = imp.srcPath

      // 如果没有指定name，则从src中提取
      if (!importName) {
        importName = getNameByPath(importSrc)
      }
      // 全部转化为小写
      importName = importName.toLowerCase()
      if (validator.isReservedTag(importName)) {
        $loader.emitWarning(new Error('导入组件的属性 `name` 不能使用保留字: ' + importName))
      }

      importNames.push(importName)

      print({
        name: importName,
        src: importSrc
      })
      const query = buildFragmentQuery(ENTRY_TYPE.COMP, [`name=${importName}`], queryOptions)
      let reqStr = makeRequireString(
        $loader,
        makeLoaderString(FRAG_TYPE.IMPORT, null, newJSCard),
        `${importSrc}?${query}`
      )

      if (compileOptionsObject.stats) {
        // 分析require组件所需时间
        reqStr = `console.time(\`PERF: require @app-component/${importName}\`)\n${reqStr}`
        reqStr += `console.timeEnd(\`PERF: require @app-component/${importName}\`)\n\n`
      }
      retStr += reqStr
    }
  }
  return retStr
}

/**
 * 处理模板片段
 * @param $loader
 * @param templates
 * @param uxType
 * @param importNames
 * @param {number} newJSCard 新打包格式JS卡
 * @param {number} lite 轻卡
 */
function processTemplateFrag($loader, templates, importNames, queryOptions = {}) {
  const { uxType, newJSCard } = queryOptions
  let retStr = '{}'
  if (!templates.length) {
    $loader.emitError(new Error('需要模板 <template> 片段'))
  } else {
    // 有且仅有一个模板片段
    const template = templates[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = template.attrs.src
    // 如果是外部导入
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }

    // 解析成类似url中key[]=xxx 的形式，便于loader-utils解析
    importNames = importNames.map((item) => 'importNames[]=' + item)
    const extraParts = [importNames.join(','), newJSCard ? `uxPath=${encodeURIComponent(src)}` : '']
    retStr = makeRequireString(
      $loader,
      makeLoaderString(
        FRAG_TYPE.TEMPLATE,
        {
          alone: !!fragAttrsSrc
        },
        newJSCard
      ),
      `${src}?${buildFragmentQuery(uxType, extraParts, queryOptions)}`
    )
  }
  return retStr
}

/**
 * 处理style片段
 * @param $loader
 * @param styles
 * @param uxType
 * @param {number} newJSCard 1:卡片
 * @param {number} lite 1:轻卡
 * @param {String} source - .ux 源码（用于计算内联片段起始行）
 */
function processStyleFrag($loader, styles, queryOptions = {}, source) {
  const { uxType, newJSCard } = queryOptions
  let code = '{}'
  if (styles.length) {
    // 有且仅有一个<style>片段
    const style = styles[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = style.attrs.src
    const fragAttrsLang = style.attrs.lang
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }

    print({
      style: src
    })
    const extraParts = []
    if (newJSCard) {
      extraParts.push(`uxPath=${encodeURIComponent(src)}`)
    }
    if (queryOptions.cardCtx && !fragAttrsSrc && fragAttrsLang && fragAttrsLang !== 'css') {
      // 轻卡材质校验：内联预处理样式透传片段内容起始行与语言，
      // 供 styleLoader 把预处理 map 的位置叠加回 .ux 源码行
      const styleLine = source ? getFragmentContentLine(source, style) : 0
      if (styleLine) {
        extraParts.push(`styleLine=${styleLine}`)
      }
      extraParts.push(`styleLang=${fragAttrsLang}`)
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(
        FRAG_TYPE.STYLE,
        {
          alone: !!fragAttrsSrc,
          lang: fragAttrsLang
        },
        newJSCard
      ),
      `${src}?${buildFragmentQuery(uxType, extraParts, queryOptions)}`
    )
  }
  return code
}

/**
 * 处理script片段
 * @param $loader
 * @param scripts
 * @param uxType
 * @returns {string}
 */
function processScriptFrag($loader, scripts, queryOptions = {}) {
  const { uxType, newJSCard } = queryOptions
  let code = 'null'
  if (scripts.length) {
    // 有且仅有一个<script>节点
    const script = scripts[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = script.attrs.src
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(
        FRAG_TYPE.SCRIPT,
        {
          alone: !!fragAttrsSrc,
          path: $loader.resourcePath
        },
        newJSCard,
        uxType
      ),
      `${src}?${buildFragmentQuery(uxType, [], queryOptions)}`
    )
  }
  return code
}

/**
 * 轻卡 <data> 片段的资源查询串：固定参数 + 公共透传（统一构造器）
 */
function buildDataFragQuery(queryOptions) {
  return buildFragmentQuery(null, ['index=0'], queryOptions)
}

/**
 * 处理轻卡<data>片段中data
 * @param $loader
 * @param datas
 * @param queryOptions
 * @returns {string}
 */
function processDataFrag($loader, datas, queryOptions = {}) {
  let code = 'null'
  if (datas.length) {
    // 有且仅有一个<data>节点
    const data = datas[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = data.attrs.src
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(FRAG_TYPE.DATA, {}, true, queryOptions.uxType),
      `${src}?${buildDataFragQuery(queryOptions)}`
    )
  }
  return code
}

/**
 * 处理轻卡<data>片段中action
 * @param $loader
 * @param datas
 * @param queryOptions
 * @returns {string}
 */
function processActionFrag($loader, datas, queryOptions = {}) {
  let code = 'null'
  if (datas.length) {
    // 有且仅有一个<data>节点
    const data = datas[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = data.attrs.src
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(FRAG_TYPE.ACTIONS, {}, true, queryOptions.uxType),
      `${src}?${buildDataFragQuery(queryOptions)}`
    )
  }
  return code
}

/**
 * 处理轻卡<data>片段中生命周期钩子(create/update)
 * @param $loader
 * @param datas
 * @param queryOptions
 * @param {string} fragType - FRAG_TYPE.CREATE 或 FRAG_TYPE.UPDATE
 * @returns {string}
 */
function processLifecycleFrag($loader, datas, queryOptions, fragType) {
  let code = 'null'
  if (datas.length) {
    // 有且仅有一个<data>节点
    const data = datas[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = data.attrs.src
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(fragType, {}, true, queryOptions.uxType),
      `${src}?${buildDataFragQuery(queryOptions)}`
    )
  }
  return code
}

/**
 * 处理轻卡<data>片段中 create 钩子
 */
function processCreateFrag($loader, datas, queryOptions = {}) {
  return processLifecycleFrag($loader, datas, queryOptions, FRAG_TYPE.CREATE)
}

/**
 * 处理轻卡<data>片段中 update 钩子
 */
function processUpdateFrag($loader, datas, queryOptions = {}) {
  return processLifecycleFrag($loader, datas, queryOptions, FRAG_TYPE.UPDATE)
}

/**
 * 处理轻卡自定义组件<data>片段中props
 * @param $loader
 * @param datas
 * @param queryOptions
 * @returns {string}
 */
function processPropsFrag($loader, datas, queryOptions = {}) {
  let code = 'null'
  if (datas.length) {
    // 有且仅有一个<data>节点
    const data = datas[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = data.attrs.src
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(FRAG_TYPE.PROPS, {}, true, queryOptions.uxType),
      `${src}?${buildDataFragQuery(queryOptions)}`
    )
  }
  return code
}

/**
 * 处理轻卡<data>片段中app(only honor)
 * @param $loader
 * @param datas
 * @param queryOptions
 * @returns {string}
 */
function processDataAppFrag($loader, datas, queryOptions = {}) {
  let code = 'null'
  if (datas.length) {
    // 有且仅有一个<data>节点
    const data = datas[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = data.attrs.src
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(FRAG_TYPE.DATAPP, {}, true, queryOptions.uxType),
      `${src}?${buildDataFragQuery(queryOptions)}`
    )
  }
  return code
}

/**
 * 处理轻卡<data>片段中command(only honor)
 * @param $loader
 * @param datas
 * @param queryOptions
 * @returns {string}
 */
function processCommandFrag($loader, datas, queryOptions = {}) {
  let code = 'null'
  if (datas.length) {
    // 有且仅有一个<data>节点
    const data = datas[0]
    // 文件绝对路径
    let src = $loader.resourcePath
    const fragAttrsSrc = data.attrs.src
    if (fragAttrsSrc) {
      src = fragAttrsSrc
    }
    code = makeRequireString(
      $loader,
      makeLoaderString(FRAG_TYPE.COMMANDS, {}, true, queryOptions.uxType),
      `${src}?${buildDataFragQuery(queryOptions)}`
    )
  }
  return code
}

/**
 * 统一解析全部后处理
 * @param $loader
 * @param importList
 * @return {Promise}
 */
function parseImportList($loader, importList) {
  return Promise.all(
    importList.map((importItem) => {
      return resolveImportItemSrc($loader, importItem)
    })
  )
}

/**
 * 利用webpack自身能力解析路径；支持resolve.alias
 * @param $loader
 * @param importItem
 * @return {*}
 */
function resolveImportItemSrc($loader, importItem) {
  if (!importItem.attrs.src) {
    importItem.isValid = false
    return Promise.resolve(importItem)
  } else {
    return new Promise((resolve) => {
      $loader.resolve($loader.context, importItem.attrs.src, function (err, result) {
        if (err) {
          importItem.isValid = false
          importItem.err = err
        } else {
          importItem.isValid = true
          importItem.srcPath = result
        }
        return resolve(importItem)
      })
    })
  }
}

export {
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
  processDataAppFrag,
  processCommandFrag
  // end honor process frag
}
