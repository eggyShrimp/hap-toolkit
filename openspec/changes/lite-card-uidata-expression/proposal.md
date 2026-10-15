## Why

轻卡 `<data>` 块中的 `uiData` 目前只支持静态 JSON：工具链不对其做表达式编译，`{{expr}}` 会原样写入 `<卡片>.template.json` 的 `#entry.data`（2026-10-12 实测确认：`"des": "{{ system.device.DEVICE_TYPE }}"` 连同花括号输出为字符串）。卡片默认数据因此无法动态化。

同时，《意图参数传参方案对比（三种标准）》确认采用**方案二（系统变量 + uiData 表达式引用）**：意图数据落在系统变量 `system.env.intentInfo`，开发者在 `uiData` 中写表达式把它映射到自有变量（可做拼接、三元等简单变换），且表达式**仅在卡片创建时求值一次**；2026-09-14 方案二次 review 共识：uiData 表达式需支持非耗时（同步）调用，耗时（异步）Feature 由编译工具链校验拦截。本次修复基于 `2.0.9-alpha.3` 口径最小放宽：**放行非耗时 Feature 调用（`system.*` / `service.*`）**，普通函数 / 方法调用（`Math.max()` 等）仍编译报错；耗时 Feature 与模板共用同一份黑名单。

`#entry.data` 在卡片引擎中身兼两职——「模板默认值」与「数据 schema」：URI uiData / 缓存 / Provider 数据按一级 key 覆盖，且只覆盖模板中已声明的 key；Provider 数据返回前先用默认值渲染首屏。让默认值支持表达式，可以在数据返回前渲染动态首屏（意图参数、时间、设备类型、主题、多设备形态、i18n 等），也是轻卡表达式能力（模板 / `actions.params` / `create`、`update` params 均已支持）补齐的最后一块。

来源：官方轻卡文档《数据 `<data>`》；《意图参数传参方案对比（三种标准）》（方案二）；卡片引擎数据模型（默认值 ← URI uiData ← 缓存 ← Provider，一级 key 合并）；《轻卡 Feature 方案》（表达式求值时机）。

## What Changes

- **`uiData` 表达式编译**：`<data>.uiData` 任意层级（对象 / 数组）的字符串值支持 `{{expr}}`（纯表达式与字符串混排），编译产物按位置输出标记：对象 key 追加 `#key`（AST）+ `$key`（原文/快捷值）并保留 `key` 原字面量（旧引擎降级）；数组元素替换为 `{ "#": AST, "$": 原文/快捷值 }` 标记对象；编译规则与 actions / create / update params 一致（复用 `@aiot-toolkit/card-expression`）
- **编译期校验**：任意层级的保留前缀 key（`$` / `#` 开头）与动态 key 禁止；表达式支持静态系统变量引用（如 `system.env.intentInfo`）、表达式计算与**非耗时 Feature 调用**（`system.*` / `service.*`，如 `system.package.hasInstalled(...)`），**耗时 Feature（`system.geolocation.getLocation` / `service.push.subscribe`，与模板共用同一份黑名单）与普通函数 / 方法调用（`Math.max()`、`.split()` 等，`$t` / `$tc` 除外）编译失败**；表达式无法解析报错（含卡片/文件/数据路径/表达式）
- **范围与兼容**：仅轻卡（`lite=1`）；不含表达式的卡片产物与改造前一致；JS 卡不受影响；表达式编译由编译开关控制（引擎契约确认前默认关闭）
- **引擎契约**：与 Java / Rust 卡片引擎对齐 data 表达式求值契约（产物形态、任意层级求值规则、与数据合并的顺序、标记键剔除、失败兜底）；表达式**仅在卡片创建时求值一次，不随数据刷新重算**；并以真机用例验收
- **测试补齐**：编译转换单测（含嵌套对象 / 数组 / 数组内对象）、校验单测、静态回归快照、fixtures 集成测试、真机验收

## Capabilities

### New Capabilities

- `lite-card-uidata-expression`: 轻卡 `<data>.uiData` 的表达式编译与校验能力——把任意层级（对象 / 数组）字符串值中的 `{{expr}}` 编译为卡片表达式标记，给出可定位的编译期诊断，并保持与引擎求值契约、数据合并语义、旧引擎降级的一致性

### Modified Capabilities

（无。本变更为既有轻卡表达式能力体系新增一类表达式载体，不修改已有 capability。）

## Impact

- **代码**：`packages/hap-compiler`（新增 `src/data` 校验模块与 `parseData` 导出、抽取共享耗时 Feature 名单）、`packages/hap-dsl-xvm`（`data-loader` 接入校验）、`packages/hap-packager`（`post-handler/lite-card-post.js` 增加 `postHandleData`）、`packages/hap-shared-utils`（编译开关默认值）
- **产物**：仅当 `uiData` 含表达式且开关开启时，`#entry.data` 增加 `#key` / `$key` 标记字段（对象 key 保留原字面量）或 `{ "#", "$" }` 标记对象（数组元素）；无表达式时产物字节级不变
- **兼容性**：编译产物新增标记字段依赖引擎契约；旧引擎按保留的字面量降级（不劣化）；开关可完全回退到改造前行为
- **交付**：变更起点 `2.0.9-alpha.1`（源码基线 `feat/material-compile-support@4d497c0`），编译端已随 `2.0.9-alpha.2 / alpha.3` 交付；本次修复基于 `2.0.9-alpha.3` 构建 `2.0.9-alpha.4`；OpenSpec 产物仅随分支管理，不进上游 PR
