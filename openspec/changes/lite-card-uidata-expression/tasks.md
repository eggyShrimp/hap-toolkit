## 1. 契约与决策（前置）

- [ ] 1.1 与卡片引擎（Java / Rust）对齐 data 表达式契约：产物形态（D2 推荐 / 备选）、求值时机、与数据合并的顺序、标记键剔除、失败兜底
- [ ] 1.2 结论回写 design.md 与 spec（如范围变化），冻结产物契约与支持范围（D2 / D3）
- [ ] 1.3 确认开关默认值策略（契约确认前默认关闭）

## 2. 编译实现

- [x] 2.1 `hap-compiler`：新增 `src/data/{index.js,validator.js}` 与 `parseData` 导出（任意层级的保留前缀 / 动态 key / 耗时 Feature 校验）；抽取与模板共享的耗时 Feature 名单
- [x] 2.2 `hap-dsl-xvm`：`data-loader` 接入 `parseData`，错误信息包含 `<data>` 所在文件
- [x] 2.3 `hap-packager`：`lite-card-post.js` 增加 `DATA_KEY` 与 `postHandleData`（复用 `getPrefixExpr` / `getExprRes`，任意层级递归：对象 `#key`/`$key`、数组元素标记对象），接入 `enableUiDataExpression` 开关
- [x] 2.4 `hap-shared-utils`：`compileOptionsObject` 增加 `enableUiDataExpression`（默认关闭）
- [x] 2.5 单测：转换（纯表达式 / 混排 / 常量对象数组 / 嵌套对象 / 数组元素 / 数组内对象 / 静态原样 / 保留字面量）、校验（任意层级前缀 / 动态 key / 黑名单 / 放行 `$t`）、开关、快照

## 3. 集成与验证

- [x] 3.1 fixtures 轻卡工程补充 `uiData` 表达式样例（含嵌套对象 / 数组）；断言 `build/<卡片>/index.template.json` 的 `#entry.data` 结构
- [x] 3.2 `hap build -t card` 冒烟：开关开 / 关两种产物对比；rpk 照常产出
- [ ] 3.3 真机验收：动态默认值首屏（time / device）、Provider 覆盖、旧引擎降级
- [x] 3.4 回归：存量用例（compiler / packager / dsl-xvm / toolkit）编译产物快照无差异（开关默认关闭）

## 4. 交付

- [x] 4.1 `openspec validate` / prettier / lint 通过（本次改动文件）
- [x] 4.2 按功能拆分提交（编译端 / 校验与测试 / 文档），不夹带版本号
- [ ] 4.3 alpha 渠道发布与验证；引擎支持就绪后翻转开关默认值
- [ ] 4.4 交付后 `openspec archive` 沉淀能力规格
