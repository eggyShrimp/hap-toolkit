/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const { SourceMapConsumer } = require('source-map')
const { parseFragmentsWithCache } = require('@hap-toolkit/compiler')
const fragmentLoader = require('../../lib/loaders/fragment-loader').default
const { getFragmentContentLine } = require('../../lib/loaders/common/utils')

function runFragmentLoader(source, query, resourcePath, sourceMap) {
  return new Promise((resolve, reject) => {
    const loader = {
      query,
      resourcePath,
      resourceQuery: '',
      sourceMap: sourceMap === undefined ? false : sourceMap,
      async() {
        return (err, content, map) => (err ? reject(err) : resolve([content, map]))
      }
    }
    fragmentLoader.call(loader, source)
  })
}

describe('fragment-loader', () => {
  const source = [
    '<template>',
    '  <div class="card">x</div>',
    '</template>',
    '<style>',
    '',
    '  .card {',
    '    background-color: #FFFFFF;',
    '  }',
    '</style>'
  ].join('\n')

  it('STYLE 片段生成行级 map（片段内容 → .ux 源码行），与 devtool 解耦', async () => {
    const [content, map] = await runFragmentLoader(source, '?index=0&type=style', '/mock/index.ux')
    expect(content).toBe('.card {\n    background-color: #FFFFFF;\n  }')
    expect(map).toBeTruthy()

    const consumer = new SourceMapConsumer(map)
    // <style> 在第 4 行、内容 trim 掉两个空行后，首行对应源码第 6 行
    expect(consumer.originalPositionFor({ line: 1, column: 0 }).line).toBe(6)
    expect(consumer.originalPositionFor({ line: 2, column: 0 }).line).toBe(7)
    expect(consumer.originalPositionFor({ line: 3, column: 0 }).line).toBe(8)
  })

  it('SCRIPT 片段保持原有行为（this.sourceMap 关闭时不生成 map）', async () => {
    const scriptSource =
      '<template>\n  <div>x</div>\n</template>\n<script>\n  export default {}\n</script>'
    const [content, map] = await runFragmentLoader(
      scriptSource,
      '?index=0&type=script',
      '/mock/index.ux'
    )
    expect(content).toContain('export default {}')
    expect(map).toBeFalsy()
  })

  it('getFragmentContentLine 计算 trim 后内容首行', () => {
    const src = '<template>\n  <div>x</div>\n</template>\n<style>\n\n  .card {}\n</style>'
    const frags = parseFragmentsWithCache(src, '/mock/content-line.ux')
    expect(getFragmentContentLine(src, frags.style[0])).toBe(6)
  })
})
