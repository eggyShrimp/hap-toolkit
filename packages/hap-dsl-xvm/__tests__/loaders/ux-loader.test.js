/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('path')
const { rowify } = require('hap-dev-utils')
const uxLoader = require('../../lib/loaders/ux-loader').default
const { globalConfig } = require('@hap-toolkit/shared-utils')

globalConfig.SRC_DIR = __dirname
const LITE_FIXTURE_SRC_DIR = path.resolve(__dirname, 'fixture-lite')

describe('ux-loader', () => {
  const mockLoader = {
    context: __dirname,
    rootContext: __dirname
  }
  const samples = [
    [
      'normal page',
      `
    <template>
      <div>{{ val }}</div>
    </template>
      `,
      'page',
      'page.ux'
    ],
    [
      'normal page with style',
      `
      <template>
        <div>{{ val }}</div>
      </template>
      <style>
      div {
        color: blue;
      }
      </style>
      `,
      'page',
      'page.ux'
    ],
    [
      'normal page, enablePerformanceCheck',
      `
    <template>
      <div>{{ val }}</div>
    </template>
      `,
      'page',
      'page.ux',
      {
        compileOptionsObject: {
          // 删除 enablePerformanceCheck 相关，此处仅保留 compileOptionsObject 使用示例
          // enablePerformanceCheck: true
        }
      }
    ],
    [
      'without <template /> tag',
      `
      <div> without template tag </div>
      `,
      'page',
      'page.ux'
    ],
    [
      'lite card, no static root class',
      `
<template>
  <div class="{{ klass }}">x</div>
</template>
<style>
.card {
  background-color: #FFFFFF;
}
</style>
<data>
{
  "klass": "card"
}
</data>
      `,
      'card',
      'lite-dynamic.ux',
      {
        query: '?uxType=card&lite=1&cardEntry=/Lite1',
        srcDir: LITE_FIXTURE_SRC_DIR
      }
    ],
    [
      'lite card with scss style',
      `
<template>
  <div class="card-wrapper">x</div>
</template>
<style lang="scss">
$bg: #FFFFFF;
.card-wrapper {
  background-color: $bg;
}
</style>
<data>
{
  "val": 1
}
</data>
      `,
      'card',
      'lite-scss.ux',
      {
        query: '?uxType=card&lite=1&cardEntry=/Lite1',
        srcDir: LITE_FIXTURE_SRC_DIR
      }
    ]
  ]
  beforeEach(() => {
    Object.assign(mockLoader, {
      emitError: jest.fn(),
      emitWarning: jest.fn()
    })
  })

  // exports 扩展的参数
  it.each(samples)('%s', async (_, source, type, fileName, extopts = {}) => {
    let resolver
    const promise = new Promise((resolve, reject) => {
      resolver = resolve
    })

    // if (extopts.compileOptionsObject && extopts.compileOptionsObject.enablePerformanceCheck) {
    //   compileOptionsObject.enablePerformanceCheck =
    //     extopts.compileOptionsObject.enablePerformanceCheck
    // }
    const loader = Object.assign({}, mockLoader, {
      resourcePath: path.resolve(__dirname, fileName),
      resourceQuery: extopts.query || `?uxType=${type}`,
      callback(err, result) {
        resolver([err, result])
      },
      async: function () {
        return this.callback
      }
    })

    const prevSrcDir = globalConfig.SRC_DIR
    if (extopts.srcDir) {
      globalConfig.SRC_DIR = extopts.srcDir
    }
    try {
      uxLoader.call(loader, source)
      const [error, result] = await promise
      // compileOptionsObject.enablePerformanceCheck = false

      expect(error).toMatchSnapshot('error')
      expect(rowify([source, result])).toMatchSnapshot('source-vs-result')
      expect(loader.emitError.mock.calls).toMatchSnapshot('emitted errors')
      expect(loader.emitWarning.mock.calls).toMatchSnapshot('emitted warnings')
    } finally {
      globalConfig.SRC_DIR = prevSrcDir
    }
  })

  it('lite card 透传 cardCtx（manifest.backgroundType + 根节点 class/内联样式位置）', async () => {
    const source = `<template>
  <div class="card-wrapper" style="background-color: #FFFFFF;">
    <text>hello</text>
  </div>
</template>
<style>
.card-wrapper {
  background-color: #FF0000;
}
</style>
<data>
{
  "val": 1
}
</data>
`

    let resolver
    const promise = new Promise((resolve) => {
      resolver = resolve
    })
    const loader = Object.assign({}, mockLoader, {
      resourcePath: path.resolve(__dirname, 'lite1.ux'),
      resourceQuery: '?uxType=card&lite=1&cardEntry=/Lite1',
      callback(err, result) {
        resolver([err, result])
      },
      async: function () {
        return this.callback
      }
    })

    const prevSrcDir = globalConfig.SRC_DIR
    globalConfig.SRC_DIR = LITE_FIXTURE_SRC_DIR
    try {
      uxLoader.call(loader, source)
      const [error, result] = await promise
      expect(error).toBeFalsy()

      const match = result.match(/cardCtx=([^&"']+)/)
      expect(match).toBeTruthy()
      const cardCtx = JSON.parse(decodeURIComponent(match[1]))
      expect(cardCtx.version).toBe(1)
      expect(cardCtx.backgroundType).toBe('solid')
      expect(cardCtx.rootMeta.classes).toEqual(['card-wrapper'])
      expect(cardCtx.rootStyle.backgroundColor).toBe('#FFFFFF')
      expect(cardCtx.rootStyleLocation.line).toBe(2)

      // 上下文透传到样式 / 模板 / data 片段请求
      expect((result.match(/cardCtx=/g) || []).length).toBeGreaterThan(1)
      expect(result).toContain('style-loader.js')
    } finally {
      globalConfig.SRC_DIR = prevSrcDir
    }
  })
})
