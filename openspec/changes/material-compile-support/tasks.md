## 1. prefers-material 媒体特征

- [x] 1.1 在 `packages/hap-compiler/src/style/mediaquery.js` 注册 `prefers-material` 映射与 `none | frosted | glass` 取值校验（小写精确匹配）
- [x] 1.2 新增 `packages/hap-compiler/test/unit/style/mediaquery.test.js`：合法值编出、非法值告警丢弃、大小写严格匹配、与 `prefers-color-scheme` 组合、未知特征回归

## 2. 轻卡材质校验核心

- [x] 2.1 新增 `packages/hap-packager/src/validators/material.js`：颜色解析（hex/rgb/rgba/transparent/动态值）、根节点选择器匹配、上下文构建（内联优先、`backgroundImage` 与 `background` 简写渐变识别、全部 `@MEDIA` 条目提取）
- [x] 2.2 在 `material.js` 实现 `DEFAULT_MATERIAL_RULES`（声明检查、solid 背景/图片与简写渐变/浅色/深色全规则、透明度全媒体覆盖）与 `validateMaterialCard` 运行器（诊断结构、规则异常兜底）
- [x] 2.3 新增 `packages/hap-packager/test/unit/func/material.test.js`：工具函数、默认规则逐条、边界（动态值、子节点选择器、`background` 简写、多深色规则、媒体内透明、custom 渐变放行）、规则可插拔

## 3. 插件与接入

- [x] 3.1 新增 `packages/hap-packager/src/plugins/material-validate-plugin.js`：`PROCESS_ASSETS_STAGE_ANALYSE` 阶段读取 manifest 与产物，输出带卡片定位的 warnings
- [x] 3.2 在 `packages/hap-packager/src/plugins/index.js` 导出插件，并在 `webpack.post.js` 的 `CardPlugin` 之后注册
- [x] 3.3 补充插件层测试：`disabledRules` / `silentInfo` / 非 lite 卡片跳过

## 4. 构建与冒烟验证

- [x] 4.1 `npm run build` 后运行定向单测（compiler + packager 新增用例全部通过）
- [x] 4.2 冒烟：复制 fixtures 工程为 lite + `solid` + 违规背景，编译后确认 warnings 含 `[卡片高级材质]` 且 rpk 照常产出
- [x] 4.3 `npm run prettier-check` 与 `npm run lint` 通过（仓库既有 2 处无关文件偏差除外）
- [x] 4.4 新增 `packages/hap-toolkit/__tests__/material.test.js` 集成测试：低版本目标仍编出 `prefers-material`、违规卡片仍出包

## 5. 交付

- [x] 5.1 按功能拆分提交（媒体特征 / 校验插件 + 测试），不夹带版本号改动
- [x] 5.2 推送 fork/beta 分支并整理交付说明（OpenSpec 产物仅随 beta 分支，不进上游 PR）
- [ ] 5.3 交付后执行 `openspec archive material-compile-support`，沉淀能力规格
