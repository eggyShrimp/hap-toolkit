## Context

- 目标：让 hap-toolkit（alpha 分支，基线 `2.0.9-alpha.1`，源码 = `feat/material-compile-support@4d497c0`）支持轻卡 `<data>.uiData` 值中的 `{{expr}}` 表达式编译
- 现状（2026-10-12 实测）：
  - 编译链路：`<data>` 片段 → `fragment-loader` 按 key 分发给 `data-loader`（`uiData`）/ `action-loader`（`actions`）/ `create-loader`、`update-loader`（`create` / `update`）→ `ux-loader` 导出 `uidata` → `CardPlugin` 收集为 `#entry.data` → `postHandleLiteCardRes` 后处理
  - `actions` / `create` / `update` 的 params 已编译为 `#key`（AST）+ `$key`（原文），`uiData` 未编译：`{{ system.device.DEVICE_TYPE }}` 原样输出
  - 引擎数据模型：`#entry.data` = 模板默认值 + 数据 schema（一级 key 合并，覆盖优先级：默认值 ← URI uiData ← 缓存 ← Provider）；默认值在 Provider 数据返回前渲染首屏
- 约束：
  - 表达式由卡片引擎求值（轻卡无 JS 运行时，Rust / Java 引擎各自实现求值器），工具链只负责编译产物与校验——产物契约必须与引擎侧对齐
  - 工具链不能凭空引入运行时行为，未对齐契约前能力默认关闭（编译开关），避免存量卡片受影响
  - `uiData` 是数据 schema，标记字段不得破坏既有合并语义（Provider 覆盖必须仍然生效）
  - 本改动不一定合入上游 main（契约与引擎版本相关），架构上可裁剪、可回退

## Goals / Non-Goals

**Goals:**

- `uiData` 顶层字符串值中的 `{{expr}}` 能编译为卡片表达式标记，产物形态与引擎求值契约一致
- 不含表达式的卡片产物与改造前完全一致（回归可证、字节级）
- 非法写法（保留前缀 key、语法错误、耗时 Feature、超范围嵌套）在编译期被发现并给出可定位诊断
- 能力可开关、可回滚；不影响 JS 卡
- 与引擎对齐契约，并有真机验收用例

**Non-Goals:**

- 不实现引擎侧求值（Java / Rust 引擎各自实现；本变更只定义契约并消费）
- 不支持 uiData key 的动态化（key 必须静态）
- 不改变数据合并优先级与刷新机制；不改变 Provider 协议
- 不做表达式编译期常量折叠（纯常量表达式仍按 AST 输出）
- 不支持 JS 卡（`<script>` 数据本就是运行时代码）

## Decisions

### D1. 校验在编译器、编译在打包器（与 actions / create / update 同一分工）

- **选择**：`hap-compiler` 新增 `src/data`（对外导出 `parseData`，对齐 `parseActions` / `parseLifecycle`）；`hap-dsl-xvm` 的 `data-loader` 调用校验（错误信息带上 `<data>` 所在文件）；`hap-packager` 的 `postHandleLiteCardRes` 增加 `postHandleData` 做 AST 编译（复用 `getPrefixExpr` / `getExprRes`，与 template / actions / create 完全同规则）
- **理由**：
  - AST 编译依赖 `@aiot-toolkit/card-expression`，该依赖只在 packager 侧（现有 template / actions / create 均如此），compiler 保持零新增依赖
  - 校验前置到 loader，能在源码阶段给出文件级错误；编译在后处理阶段与其它表达式载体共用转换规则，行为自然一致
- **备选**：全部放进 `data-loader`——需要给 dsl-xvm 增加 card-expression 依赖，且与既有分工不一致，不采用

### D2. 产物契约：对象 key 用 `#key`/`$key`，数组元素用 `{ "#", "$" }` 标记对象（推荐，待引擎评审）

- **选择**（推荐给引擎的契约，任意层级递归）：
  1. **对象 key** `k`：保留 `k` 原字面量，追加 `#k`（AST）与 `$k`（原文 / 快捷值）
  2. **数组元素**：无法追加兄弟字段，表达式元素替换为 `{ "#": AST, "$": 原文 / 快捷值 }` 标记对象（用户数据禁止 `$`/`#` 前缀 key，标记对象与用户对象不会歧义）
  3. 引擎加载 `#entry.data` 时按以下 walker 求值（求值发生在数据合并之前）：
     - 数组 → 逐元素递归
     - 对象 → 若对象仅含 `#`、`$` 两个 key 则为标记对象，按 `#`（AST）求值（失败回退 `$`）；否则先递归普通值，再对 `#k` 求值写入 `k`，最后剔除 `#k` / `$k`
     - 其余值原样
  4. 合并优先级与既有完全一致：默认值（求值后）← URI uiData ← 缓存 ← Provider
  5. 旧引擎：对象内的 `#k` / `$k` 被忽略、按 `k` 字面量降级；数组元素为标记对象（无法保留字面量），旧引擎不保证正确渲染——表达式能力本身面向支持该契约的引擎
- **理由**：对象 key 保留 `k` 使产物的「声明 key 集合」不变（合并语义不破坏），旧引擎可安全降级；标记对象是数组场景唯一不破坏元素类型的编码方式
- **备选**：对象 key 也改用标记对象（形态统一，但旧引擎会看到对象而非字面量，降级性更差）
- **备选**：不保留 `k` 字面量（产物更干净、无重复数据），以 `minCardPlatformVersion` 门槛控制——旧引擎加载会丢失 key，不推荐

### D3. 支持范围：任意层级结构（对象 / 数组递归）

- 编译 `uiData` 中**任意层级**的字符串值：纯表达式（`"{{ expr }}"`）与字符串混排（`"今日 {{ count }} 条"`）
- 对象 key 与数组元素统一按 D2 的标记形态输出；数组内对象、对象内数组等组合结构递归处理
- 数字 / 布尔 / null 等非字符串值保持原样
- **理由**：`uiData` 是卡片的数据模型，列表与嵌套对象是常态；半支持（仅顶层）会让列表项、嵌套字段的表达式静默失效，造成开发者困惑与行为差异，直接全量支持

### D4. 编译期校验规则

| 规则           | 级别  | 说明                                                                                                              |
| -------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| 保留前缀 key   | ERROR | key 以 `$` / `#` 开头会与标记字段冲突，任意层级生效（含数组内对象的 key）                                         |
| 动态 key       | ERROR | key 必须为静态字符串，任意层级生效                                                                                |
| 表达式解析失败 | ERROR | `{{expr}}` 无法编出 AST（语法错误 / 空表达式）；信息含卡片、文件、数据路径、表达式原文                            |
| 耗时 Feature   | ERROR | UI 线程求值，禁止 `system.geolocation.getLocation` / `service.push.subscribe`（复用模板同一份名单，抽取共享常量） |
| `$t` / `$tc`   | 允许  | 与 card-expression 默认及引擎国际化函数一致                                                                       |

### D5. 兼容、开关与回滚

- 编译开关 `enableUiDataExpression`（`compileOptionsObject`，CLI 与 `quickapp.config.js` 均可配置）：引擎契约确认与引擎支持就绪前默认关闭；关闭时行为与改造前完全一致
- 无表达式的卡片：无论开关如何，产物与改造前字节级一致
- 回滚：关闭开关；或移除 `postHandleData` 调用与 `data-loader` 校验调用（2 处）

### D6. 表达式异常与兜底

- 编译期异常：直接报错（不吞掉），与模板表达式的失败模式一致
- 运行时异常（引擎侧）：Feature 未声明 / 求值异常 → 回退 `$`（快捷值）/ 原字面量（对象 key）；单个表达式失败不影响其它 key
- 表达式求值不依赖运行时 Provider 数据，避免「默认值等待数据」的时序歧义

### D7. 分支与交付

- 基线 `2.0.9-alpha.1`（`feat/material-compile-support@4d497c0`）；本变更分支 `feat/lite-card-uidata-expression`
- 不夹带版本号改动；OpenSpec 产物仅随分支
- 契约未闭环前只合入编译端（默认关闭），引擎就绪后翻转默认值并发布 alpha

## Risks / Trade-offs

- [引擎契约未定 / 求值器未支持] → 契约对齐作为任务 1；开关默认关闭，不影响存量；引擎就绪前不开启
- [标记字段与既有合并 / schema 语义冲突] → D2 保留 `k` 字面量 + 引擎剔除标记键；契约测试用例覆盖 Provider 覆盖场景
- [保留 `k` 带来的数据体积增加] → 仅表达式 key 有增量（AST + 快捷值），template.json 编译压缩后可控；如体积敏感评估备选形态
- [数组元素标记对象在旧引擎下变为对象（无法保留字面量）] → 表达式能力面向支持契约的引擎；开关 opt-in + 引擎版本门槛评估
- [表达式引用其它 key / Provider 数据造成时序歧义] → 契约明确「默认值求值不依赖运行时数据」，引用兄弟 key 的求值顺序由引擎契约定义
- [误伤存量卡片] → 保留前缀 key / 动态 key 此前无合法行为，报错面极小；新规则只作用于含 `{{}}` 的值
- [alpha 分支与上游 main 分叉] → OpenSpec 与实现随 alpha 分支管理，向上游提交时剔除流程产物与版本号

## Migration Plan

- 存量卡片无需改造：不含 `{{}}` 的 uiData 产物不变
- 新能力按需使用：`enableUiDataExpression` 开启后，`uiData` 中的 `{{expr}}` 生效
- 引擎版本：与引擎侧约定支持表达式的版本；旧引擎自动按字面量降级
- 交付后通过 `openspec archive` 沉淀能力规格

## Open Questions

- 产物形态最终选择（D2 推荐 vs 备选），待引擎评审
- 求值时机与刷新语义：表达式是否随数据刷新重算（响应式），还是仅作为一次性默认值
- 标记键剔除的契约细节（最终 data context 是否可见 `#key` / `$key` / 标记对象）
- uiData 表达式引用其它 uiData key（含嵌套路径）的求值顺序语义，由引擎契约定义
- 数组元素标记对象在旧引擎上的行为是否需要额外门槛（`minCardPlatformVersion` 或能力声明）
- `uiData` 表达式与 `create` / `update` params 的表达能力是否收敛为同一份「轻卡表达式白名单」并统一文档
