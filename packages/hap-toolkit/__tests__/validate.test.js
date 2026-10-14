/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const { validateJson } = require('../lib/gen-webpack-conf/validate')

const manifestJson = {
  package: 'com.application.demo',
  name: '{{appName}}',
  versionName: '1.0.0',
  versionCode: 1,
  minPlatformVersion: 1070,
  icon: '/Common/logo.png',
  banner: '/Common/banner.png',
  deviceTypeList: ['phone'],
  features: [{ name: 'system.prompt' }, { name: 'system.router' }, { name: 'system.shortcut' }],
  permissions: [{ origin: '*' }],
  config: {
    logLevel: 'log',
    dsl: {
      name: 'vue'
    }
  },
  router: {
    entry: 'Demo',
    pages: {
      Demo: {
        component: 'index'
      },
      DemoDetail: {
        component: 'index'
      },
      About: {
        component: 'index'
      }
    }
  },
  display: {
    titleBarBackgroundColor: '#f2f2f2',
    titleBarTextColor: '#414141',
    pages: {
      Demo: {
        titleBarText: '示例页',
        menu: false
      },
      DemoDetail: {
        titleBarText: '详情页'
      },
      About: {
        menu: false
      }
    }
  },
  menuBarData: {
    menuBar: true,
    menuBarStyle: 'light',
    shareTitle: 'this is menuBar',
    shareDescription: 'this is shareDescription'
  }
}

const wrongJson = {
  package: 123,
  versionName: '1.0.0',
  versionCode: '1',
  minPlatformVersion: 1050,
  icon: 123,
  banner: 456,
  deviceTypeList: ['phone', 123],
  features: [{ name: 'system.prompt' }, { name: 'system.router' }, { name: 123 }],
  // TODO 校验 permissions
  permissions: [{ origin: '*' }],
  config: {
    logLevel: 'not enum',
    // TODO 校验 dsl
    dsl: {
      name: 'vue'
    }
  },
  router: {
    pages: '/path/to/page'
  },
  display: {
    titleBarBackgroundColor: 123123,
    titleBarTextColor: 123123,
    pages: 'should be object'
  },
  menuBarData: {
    menuBar: 'true',
    menuBarStyle: '123',
    shareTitle: 123,
    shareDescription: 'this is shareDescription'
  }
}

it('validateJson', () => {
  let errors = validateJson(manifestJson, 'manifest.json').map((err) => err.message)
  expect(errors.join('\n\n')).toMatchSnapshot()
  errors = validateJson(wrongJson, 'manifest.json').map((err) => err.message)
  expect(errors.join('\n\n')).toMatchSnapshot()
})

it('backgroundType 取值收敛到 schema 枚举（存在性不强制）', () => {
  const clone = (widgets) =>
    Object.assign({}, manifestJson, {
      router: Object.assign({}, manifestJson.router, { widgets })
    })

  const valid = validateJson(
    clone({
      CardDemo: { path: 'CardDemo', component: 'index', type: 'lite', backgroundType: 'solid' },
      CardCustom: {
        path: 'CardCustom',
        component: 'index',
        type: 'lite',
        backgroundType: 'custom'
      },
      CardDefault: { path: 'CardDefault', component: 'index', type: 'lite' }
    }),
    'manifest.json'
  ).map((err) => err.message)
  expect(valid.join('\n')).not.toContain('backgroundType')

  const invalid = validateJson(
    clone({
      CardBad: { path: 'CardBad', component: 'index', type: 'lite', backgroundType: 'glossy' }
    }),
    'manifest.json'
  ).map((err) => err.message)
  expect(invalid.join('\n')).toContain('router.widgets.CardBad.backgroundType')
  expect(invalid.join('\n')).toContain('solid 或 custom')
  expect(invalid.join('\n')).toContain('参考:')
})
