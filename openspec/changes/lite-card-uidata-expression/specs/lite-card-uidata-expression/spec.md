## ADDED Requirements

### Requirement: uiData 字符串值的表达式编译（任意层级）

编译器 SHALL 将轻卡 `<data>.uiData` 中任意层级（对象 / 数组递归）字符串值里的 `{{expr}}` 编译为卡片表达式标记：对象 key 保留原字面量并追加 `#key`（AST）与 `$key`（原文 / 快捷值）；数组元素替换为 `{ "#": AST, "$": 原文 / 快捷值 }` 标记对象。编译规则与 actions / create / update params 保持一致（复用 `@aiot-toolkit/card-expression`）。

#### Scenario: 顶层纯表达式编译

- **WHEN** `uiData` 含 `"des": "{{ system.device.DEVICE_TYPE }}"`
- **THEN** 产物中该 key 输出 `#des`（AST 数组）与 `$des`（原文），并保留 `des` 原字面量

#### Scenario: 字符串混排编译

- **WHEN** `uiData` 含 `"title": "今日 {{ count }} 条"`
- **THEN** 产物中 `#title` 为字符串拼接 AST（`["+", ...]`），`$title` 为该混合文本原文

#### Scenario: 嵌套对象表达式编译

- **WHEN** `uiData` 含 `"nested": { "deep": "{{ 1 + 2 }}" }`
- **THEN** 产物中 `nested` 保留 `deep` 原字面量，并输出 `nested["#deep"]`（AST）与 `nested["$deep"]`（快捷值）

#### Scenario: 数组元素表达式编译

- **WHEN** `uiData` 含 `"list": ["a", "{{ count }}"]`
- **THEN** 产物中 `list[1]` 替换为 `{ "#": ["$", "count"], "$": "count" }` 标记对象

#### Scenario: 数组内对象表达式编译

- **WHEN** `uiData` 含 `"objs": [{ "label": "{{ system.device.DEVICE_TYPE }}" }]`
- **THEN** 产物中 `objs[0]` 保留 `label` 原字面量并输出 `#label` / `$label` 标记

#### Scenario: 静态值保持原样

- **WHEN** `uiData` 的值不含 `{{`（字符串 / 数字 / 布尔 / null / 静态对象 / 静态数组）
- **THEN** 产物中该值原样输出，不新增任何标记

#### Scenario: 常量表达式编译

- **WHEN** `uiData` 含 `"list": "{{ [1, 2, 3] }}"`
- **THEN** 按表达式编译（`#list` AST + `$list` 快捷值），不因值为常量而跳过编译

### Requirement: uiData 的 key 与结构约束

编译器 SHALL 在任意层级校验 uiData 结构：key 不能以 `$` / `#` 开头（保留前缀，与标记字段冲突）；key 必须为静态字符串（不支持表达式）。对象与数组可任意嵌套。

#### Scenario: 顶层保留前缀 key

- **WHEN** `uiData` 含 `"$text": "x"` 或 `"#text": "x"`
- **THEN** 编译失败并提示 key 不能以 `$` / `#` 开头

#### Scenario: 嵌套保留前缀 key

- **WHEN** `uiData` 含 `"nested": { "$bad": "x" }` 或 `"list": [{ "#bad": "x" }]`
- **THEN** 编译失败，错误信息包含数据路径（`nested.$bad` / `list[0].#bad`）

#### Scenario: 动态 key

- **WHEN** `uiData` 含 key `"{{ text }}"`（含嵌套层级）
- **THEN** 编译失败并提示 key 必须为静态字符串，错误信息包含数据路径

### Requirement: uiData 表达式的函数 / Feature 调用约束

编译器 SHALL 在源码阶段（loader）校验 `uiData` 表达式：支持**静态系统变量引用**（如 `system.env.intentInfo`）、**表达式计算**（拼接、算术、比较、三元、逻辑、字面量、数组/对象字面量）与**非耗时 Feature 调用**（`system.*` / `service.*`，如 `system.package.hasInstalled(...)`）；**禁止耗时 Feature 调用**（`system.geolocation.getLocation` / `service.push.subscribe`，与模板共用同一份黑名单）与**普通函数 / 方法调用**（`Math.max()`、`'1.00'.split('.')[0]` 等，`$t` / `$tc` 除外）。约束在任意层级生效，错误信息包含文件与数据路径。

#### Scenario: 静态系统变量引用与表达式计算通过

- **WHEN** `uiData` 含 `"intentName": "{{ system.env.intentInfo.intentionProperty.name }}"`、`"balanceText": "余额 {{ system.env.intentInfo.slots.amount }} 元"`、`"tip": "{{ system.env.intentInfo.slots.amount > 0 ? '有余额' : '无余额' }}"`
- **THEN** 正常编译（静态引用 + 拼接 / 比较 / 三元）

#### Scenario: 非耗时 feature 调用通过

- **WHEN** `uiData` 含 `"a": "{{ system.package.hasInstalled({ package: 'x' }).result }}"`
- **THEN** 正常编译（非耗时 Feature 调用放行）

#### Scenario: 耗时 feature 调用被拒绝

- **WHEN** `uiData` 含 `"lat": "{{ system.geolocation.getLocation().latitude }}"` 或 `"a": "{{ service.push.subscribe() }}"`
- **THEN** 编译失败并提示「耗时 Feature」，信息含文件与数据路径

#### Scenario: 嵌套 / 数组内耗时 feature 调用被拒绝

- **WHEN** `uiData` 含 `"nested": { "deep": "{{ system.geolocation.getLocation() }}" }` 或 `"list": ["a", "{{ service.push.subscribe() }}"]`
- **THEN** 编译失败，错误信息包含数据路径 `nested.deep` / `list[1]`

#### Scenario: 普通函数 / 方法调用被拒绝

- **WHEN** `uiData` 含 `"a": "{{ Math.max(1, 2) }}"` 或 `"b": "{{ '1.00'.split('.')[0] }}"`
- **THEN** 编译失败（仅静态系统变量引用、表达式计算与非耗时 Feature 调用允许）

#### Scenario: 国际化函数放行

- **WHEN** `uiData` 含 `"name": "{{ $t('card.intentName') }}"` 或 `"count": "{{ $tc('card.count', 2) }}"`
- **THEN** 正常编译（`$t` / `$tc` 属于允许的调用白名单）

#### Scenario: 表达式无法解析

- **WHEN** `uiData` 含 `"a": "{{ 1 + }}"`
- **THEN** 编译失败并提示表达式无法解析，错误信息包含数据路径

### Requirement: 兼容性与开关

表达式编译 SHALL 受编译开关控制（`enableUiDataExpression`，默认关闭）；开关关闭或值不含表达式时，产物与改造前一致。能力仅作用于轻卡，不影响 JS 卡。

#### Scenario: 开关关闭

- **WHEN** 开关关闭且 `uiData` 含表达式（含嵌套 / 数组）
- **THEN** 产物与改造前完全一致（不编译、不新增标记字段）

#### Scenario: 无表达式卡片回归

- **WHEN** 开启开关编译不含表达式的存量卡片
- **THEN** 产物与改造前字节级一致

#### Scenario: JS 卡不受影响

- **WHEN** 编译 `type !== "lite"` 的卡片
- **THEN** 行为与改造前一致

### Requirement: 引擎求值契约

工具链产物 SHALL 与卡片引擎求值契约一致，并通过真机验收：任意层级的标记按契约求值；表达式**仅在卡片创建时求值一次**（不随数据刷新重算）；默认值在 Provider 数据返回前渲染；Provider / URI / 缓存数据可覆盖表达式求值结果；标记字段不进入最终 data context。

#### Scenario: 动态默认值首屏渲染

- **WHEN** `uiData` 含 `"hour": "{{ system.time.hour }}"`，Provider 未返回数据
- **THEN** 首屏渲染出求值结果（非 `{{...}}` 字面量）

#### Scenario: 意图参数映射（方案二）

- **WHEN** `uiData` 含 `"intentName": "{{ system.env.intentInfo.intentionProperty.name }}"`、`"company": "{{ system.env.intentInfo.slots.communicationCompanyName }}"`
- **THEN** 卡片创建时求值一次，自有变量被赋值为意图数据；模板引用 `{{ intentName }}` 正常渲染

#### Scenario: 表达式不随刷新重算

- **WHEN** 卡片创建后 Provider / 缓存返回新数据
- **THEN** 仅同名 key 被覆盖，uiData 表达式不重新求值

#### Scenario: 嵌套 / 数组标记求值

- **WHEN** `uiData` 含 `"nested": { "deep": "{{ 1 + 2 }}" }` 与 `"list": ["a", "{{ count }}"]`
- **THEN** 引擎按契约递归求值（标记对象按 `#` 求值、对象 `#key` 写入同名 key），最终 data context 中不含 `#` / `$` 标记

#### Scenario: Provider 数据覆盖默认值

- **WHEN** Provider 返回同名 key 数据
- **THEN** 最终数据上下文使用 Provider 值，默认表达式不再覆盖

#### Scenario: 旧引擎降级

- **WHEN** 卡片在未支持 data 表达式的引擎上加载
- **THEN** 对象内表达式按保留的字面量渲染（不出现数据缺失 / 崩溃）；数组元素为标记对象，属于该引擎不支持的用法
