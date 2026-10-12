/*
 * Copyright (c) 2024-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const { parseData } = require('../../../lib')

describe('compiler data uiData 校验', () => {
  it('静态值与任意层级的字符串表达式均通过', () => {
    const uiData = {
      text: '欢迎使用快应用卡片',
      des: '{{ system.device.DEVICE_TYPE }}',
      title: '今日 {{ count }} 条',
      count: 1,
      flag: true,
      empty: null,
      nested: {
        name: 'a',
        deep: '{{ 1 + 2 }}',
        list: [1, 2, '{{ count }}'],
        objs: [{ label: '{{ system.device.DEVICE_TYPE }}' }]
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

  it('耗时 Feature 不允许出现在 uiData 表达式中，任意层级生效', () => {
    expect(() => parseData({ lat: '{{ system.geolocation.getLocation().latitude }}' })).toThrow(
      '耗时 Feature "system.geolocation.getLocation"'
    )
    expect(() => parseData({ token: '{{ service.push.subscribe() }}' })).toThrow(
      'service.push.subscribe'
    )
    expect(() => parseData({ nested: { deep: '{{ system.geolocation.getLocation() }}' } })).toThrow(
      'nested.deep'
    )
    expect(() => parseData({ list: ['a', '{{ service.push.subscribe() }}'] })).toThrow('list[1]')
  })

  it('非耗时 Feature 与 $t / $tc 放行', () => {
    expect(() =>
      parseData({
        device: '{{ system.device.DEVICE_TYPE }}',
        name: "{{ $t('card.title') }}",
        count: "{{ $tc('card.count', 2) }}",
        nested: { deep: '{{ system.package.hasInstalled({ package: "com.meituan" }).result }}' }
      })
    ).not.toThrow()
  })

  it('相似但不同路径（foo.system.geolocation.getLocation）不误报', () => {
    expect(() => parseData({ a: '{{ foo.system.geolocation.getLocation() }}' })).not.toThrow()
  })
})
