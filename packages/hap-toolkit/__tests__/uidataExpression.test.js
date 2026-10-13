/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')
const { copyApp } = require('hap-dev-utils')
const { compile } = require('../lib')

const LITE_CARD_UX = `<!-- 
  Copyright (c) 2021-present, the hapjs-platform Project Contributors
  SPDX-License-Identifier: Apache-2.0
-->

<template>
  <div class="demo-page">
    <text>{{text}}</text>
    <text>{{des}}</text>
    <text>{{title}}</text>
  </div>
</template>

<style>
  .demo-page {
    flex: 1;
    flex-direction: column;
    align-items: center;
  }
</style>

<data>
{
  "uiData": {
    "text": "欢迎使用快应用卡片",
    "des": "{{ system.device.DEVICE_TYPE }}",
    "title": "今日 {{ count }} 条",
    "count": 3,
    "nested": {
      "name": "静态对象",
      "deep": "{{ 1 + 2 }}",
      "list": ["a", "{{ count }}"],
      "objs": [{ "label": "{{ system.device.DEVICE_TYPE }}" }]
    },
    "intentName": "{{ system.env.intentInfo.intentionProperty.name }}",
    "balanceText": "余额 {{ system.env.intentInfo.slots.amount }} 元"
  },
  "actions": {
    "onTap": {
      "type": "message",
      "params": {
        "d": "{{ system.device.DEVICE_TYPE }}"
      }
    }
  }
}
</data>
`

describe('测试轻卡 uiData 表达式编译', () => {
  const platform = 'native'
  let projectRoot
  let buildDir
  let distDir
  let uxPath

  function readCardData() {
    const templatePath = path.join(buildDir, 'CardDemo/index.template.json')
    return JSON.parse(fs.readFileSync(templatePath).toString())['#entry'].data
  }

  async function compileCard(options = {}) {
    const result = await compile(platform, 'prod', false, {
      cwd: projectRoot,
      target: 'card',
      ...options
    })
    return result.stats
  }

  beforeAll(async () => {
    const testAppDir = path.resolve(__dirname, '../fixtures/app')
    projectRoot = await copyApp(testAppDir)
    buildDir = path.resolve(projectRoot, 'build')
    distDir = path.resolve(projectRoot, 'dist')

    const manifestPath = path.join(projectRoot, 'src/manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath).toString())
    manifest.versionCode = 1
    manifest.router.widgets.CardDemo.type = 'lite'
    manifest.router.widgets.CardDemo.minCardPlatformVersion = 1000
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

    uxPath = path.join(projectRoot, 'src/CardDemo/index.ux')
    fs.writeFileSync(uxPath, LITE_CARD_UX)
  }, 5 * 60 * 1000)

  it(
    '开关关闭：uiData 表达式不编译，产物与改造前一致',
    async () => {
      const stats = await compileCard()
      expect(stats.hasErrors()).toBe(false)

      const data = readCardData()
      expect(data.des).toBe('{{ system.device.DEVICE_TYPE }}')
      expect(data.title).toBe('今日 {{ count }} 条')
      expect(data.nested.deep).toBe('{{ 1 + 2 }}')
      expect(data.nested.list[1]).toBe('{{ count }}')
      expect(data.intentName).toBe('{{ system.env.intentInfo.intentionProperty.name }}')
      expect(data['#des']).toBeUndefined()
      expect(data['$des']).toBeUndefined()
      expect(data.nested['#deep']).toBeUndefined()
    },
    5 * 60 * 1000
  )

  it(
    '开关开启：任意层级表达式编译为标记且保留原字面量',
    async () => {
      const stats = await compileCard({ enableUiDataExpression: true })
      expect(stats.hasErrors()).toBe(false)

      const data = readCardData()
      // 原字面量保留，供旧引擎降级
      expect(data.des).toBe('{{ system.device.DEVICE_TYPE }}')
      // 纯表达式：$key 原文 + #key AST
      expect(data['$des']).toBe('system.device.DEVICE_TYPE')
      expect(Array.isArray(data['#des'])).toBe(true)
      expect(data['#des'][0]).toBe('.')
      // 字符串混排：拼接 AST
      expect(data['#title'][0]).toBe('+')
      expect(data['$title']).toBe('今日 {{ count }} 条')
      // 静态值保持原样，不产生标记字段
      expect(data.text).toBe('欢迎使用快应用卡片')
      expect(data.count).toBe(3)
      expect(data['#text']).toBeUndefined()
      // 嵌套对象：同级追加标记
      expect(data.nested.name).toBe('静态对象')
      expect(data.nested.deep).toBe('{{ 1 + 2 }}')
      expect(data.nested['#deep']).toEqual(['+', 1, 2])
      // $key 为快捷值：常量表达式取求值结果（与 actions params 一致）
      expect(data.nested['$deep']).toBe(3)
      // 数组元素：替换为 { "#", "$" } 标记对象
      expect(data.nested.list[0]).toBe('a')
      expect(data.nested.list[1]['#']).toEqual(['$', 'count'])
      expect(data.nested.list[1]['$']).toBe('count')
      // 数组内对象的表达式同样编译
      expect(data.nested.objs[0].label).toBe('{{ system.device.DEVICE_TYPE }}')
      expect(Array.isArray(data.nested.objs[0]['#label'])).toBe(true)
      // 意图参数（方案2）：静态系统变量 system.env.intentInfo 映射到自有变量
      expect(data.intentName).toBe('{{ system.env.intentInfo.intentionProperty.name }}')
      expect(Array.isArray(data['#intentName'])).toBe(true)
      expect(data['#balanceText'][0]).toBe('+')
      expect(data['$balanceText']).toBe('余额 {{ system.env.intentInfo.slots.amount }} 元')
    },
    5 * 60 * 1000
  )

  it('rpk 产物照常产出', () => {
    const rpkFiles = glob.sync('*.rpk', { cwd: distDir })
    expect(rpkFiles.length).toBeGreaterThan(0)
  })

  it(
    '非法写法：嵌套保留前缀 key 编译失败并提示源码位置与数据路径',
    async () => {
      const source = fs.readFileSync(uxPath, 'utf8')
      fs.writeFileSync(uxPath, source.replace('"name": "静态对象"', '"$name": "静态对象"'))
      try {
        const stats = await compileCard({ enableUiDataExpression: true })
        expect(stats.hasErrors()).toBe(true)

        const errors = (stats.compilation.errors || [])
          .map((item) => item.message || String(item))
          .join('\n')
        expect(errors).toContain('CardDemo/index.ux')
        expect(errors).toContain('nested.$name')
        expect(errors).toContain('不能以 “$” 或 “#” 开头')
      } finally {
        fs.writeFileSync(uxPath, source)
      }
    },
    5 * 60 * 1000
  )

  it(
    '非法写法：Feature / 函数调用编译失败（仅允许静态系统变量引用与计算）',
    async () => {
      const source = fs.readFileSync(uxPath, 'utf8')
      fs.writeFileSync(
        uxPath,
        source.replace(
          '"name": "静态对象"',
          '"name": "{{ system.package.hasInstalled({ package: \'com.meituan\' }).result }}"'
        )
      )
      try {
        const stats = await compileCard({ enableUiDataExpression: true })
        expect(stats.hasErrors()).toBe(true)

        const errors = (stats.compilation.errors || [])
          .map((item) => item.message || String(item))
          .join('\n')
        expect(errors).toContain('CardDemo/index.ux')
        expect(errors).toContain('禁止调用 Feature / 函数')
        expect(errors).toContain('system.env.intentInfo')
      } finally {
        fs.writeFileSync(uxPath, source)
      }
    },
    5 * 60 * 1000
  )
})
