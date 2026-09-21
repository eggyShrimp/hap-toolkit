/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const { validateMediaCondition } = require('../../../lib/style/mediaquery')

describe('style/mediaquery prefers-material', () => {
  it('合法取值编出媒体条件', () => {
    ;['none', 'frosted', 'glass'].forEach((value) => {
      const result = validateMediaCondition(`screen and (prefers-material: ${value})`)
      expect(result.value).toBe(`screen and (prefers-material: ${value})`)
      expect(result.reason).toEqual([])
    })
  })

  it('与 prefers-color-scheme 组合时两个条件都保留', () => {
    const result = validateMediaCondition(
      'screen and (prefers-color-scheme: dark) and (prefers-material: glass)'
    )
    expect(result.value).toBe(
      'screen and (prefers-color-scheme: dark) and (prefers-material: glass)'
    )
    expect(result.reason).toEqual([])
  })

  it('非法取值输出 WARN 并丢弃整条规则', () => {
    const result = validateMediaCondition('screen and (prefers-material: glossy)')
    expect(result.value).toBe('')
    expect(result.reason.join('\n')).toContain('必须为 `none | frosted | glass`')
  })

  it('取值大小写严格匹配', () => {
    const result = validateMediaCondition('screen and (prefers-material: Glass)')
    expect(result.value).toBe('')
    expect(result.reason.join('\n')).toContain('必须为 `none | frosted | glass`')
  })

  it('未知媒体特征仍按既有逻辑丢弃', () => {
    const result = validateMediaCondition('screen and (prefers-unknown: glass)')
    expect(result.value).toBe('')
    expect(result.reason.join('\n')).toContain('不支持')
  })
})
