/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const { parseData } = require('../../../lib')

describe('compiler data uiData 校验', () => {
  it('静态值、静态系统变量引用与表达式计算均通过（任意层级）', () => {
    const uiData = {
      text: '欢迎使用快应用卡片',
      intentName: '{{ system.env.intentInfo.intentionProperty.name }}',
      company: '{{ system.env.intentInfo.slots.communicationCompanyName }}',
      balance: '{{ system.env.intentInfo.slots.amount }}',
      balanceText: '余额 {{ system.env.intentInfo.slots.amount }} 元',
      device: '{{ system.device.DEVICE_TYPE }}',
      tip: "{{ system.env.intentInfo.slots.amount > 0 ? '有余额' : '无余额' }}",
      title: "{{ $t('card.title') }}",
      countText: "{{ $tc('card.count', 2) }}",
      count: 1,
      flag: true,
      empty: null,
      nested: {
        name: 'a',
        deep: '{{ 1 + 2 }}',
        list: [1, 2, '{{ system.env.intentInfo.slots.amount }}'],
        objs: [{ label: '{{ system.env.intentInfo.intentionProperty.name }}' }]
      }
    }

    const { parsed } = parseData(uiData)
    expect(JSON.parse(parsed)).toEqual(uiData)
  })

  it('uiData 必须为 Object 对象', () => {
    expect(() => parseData('abc')).toThrow('uiData 必须为 Object 对象')
    expect(() => parseData([1, 2])).toThrow('uiData 必须为 Object 对象')
  })

  it('key 不能以 $ / # 开头（保留前缀），任意层级生效', () => {
    expect(() => parseData({ $text: 'x' })).toThrow('不能以 “$” 或 “#” 开头')
    expect(() => parseData({ '#text': 'x' })).toThrow('不能以 “$” 或 “#” 开头')
    expect(() => parseData({ nested: { $bad: 'x' } })).toThrow('nested.$bad')
    expect(() => parseData({ list: [{ '#bad': 'x' }] })).toThrow('list[0].#bad')
  })

  it('key 必须为静态字符串，不支持表达式，任意层级生效', () => {
    expect(() => parseData({ '{{ text }}': 'x' })).toThrow('key 必须为静态字符串')
    expect(() => parseData({ nested: { '{{ text }}': 'x' } })).toThrow('nested.{{ text }}')
  })

  it('非耗时 Feature 调用放行（普通函数 / 方法调用仍禁止）', () => {
    expect(() =>
      parseData({ a: '{{ system.package.hasInstalled({ package: "com.meituan" }).result }}' })
    ).not.toThrow()
    expect(() => parseData({ nested: { deep: '{{ system.device.getInfo() }}' } })).not.toThrow()

    // 非 Feature 命名空间的函数 / 方法调用保持禁止
    expect(() => parseData({ a: '{{ Math.max(1, 2) }}' })).toThrow('禁止调用其他函数 / 方法')
    expect(() => parseData({ a: '{{ "1.00".split(".")[0] }}' })).toThrow('禁止调用其他函数 / 方法')
    expect(() => parseData({ nested: { deep: '{{ foo() }}' } })).toThrow('仅支持静态系统变量引用')
  })

  it('耗时 Feature 调用被拒绝（与模板共用同一份黑名单），任意层级生效', () => {
    expect(() => parseData({ lat: '{{ system.geolocation.getLocation().latitude }}' })).toThrow(
      '耗时 Feature'
    )
    expect(() => parseData({ lat: '{{ system.geolocation.getLocation().latitude }}' })).toThrow(
      'system.geolocation.getLocation'
    )
    // 计算属性访问同样归一化到点号路径，黑名单可命中
    expect(() => parseData({ lat: '{{ system["geolocation"].getLocation() }}' })).toThrow(
      '耗时 Feature'
    )
    expect(() => parseData({ nested: { deep: '{{ service.push.subscribe() }}' } })).toThrow(
      'nested.deep'
    )
    expect(() => parseData({ list: ['a', '{{ service.push.subscribe() }}'] })).toThrow('list[1]')
  })

  it('$t / $tc 国际化函数放行', () => {
    expect(() =>
      parseData({
        name: "{{ $t('card.intentName') }}",
        count: "{{ $tc('card.count', 2) }}"
      })
    ).not.toThrow()
  })

  it('表达式无法解析时报错，且包含数据路径', () => {
    expect(() => parseData({ a: '{{ 1 + }}' })).toThrow('表达式无法解析')
    expect(() => parseData({ nested: { deep: '{{ 1 + }}' } })).toThrow('nested.deep')
  })
})
