## ADDED Requirements

### Requirement: manifest backgroundType 取值收敛到 schema

manifest schema SHALL 校验 `router.widgets` 逐卡的 `backgroundType` 取值为 `solid` / `custom` 枚举：非法取值在编译前提示（字段路径 + 期望取值 + 参考文档），不阻塞打包；不强制字段存在（缺省按 `custom`）。

#### Scenario: 非法取值编译前提示

- **WHEN** 任一 widget 的 `backgroundType` 取值为 `solidx` 等非法值
- **THEN** 编译启动时输出提示（含字段路径与期望取值），构建继续

#### Scenario: 合法取值与未声明通过

- **WHEN** 取值为 `solid` / `custom` 或未声明
- **THEN** 字段校验不产生提示；未声明的默认语义由样式校验的 INFO 规则承接

### Requirement: backgroundType 声明检查

校验器 SHALL 读取构建链透传上下文中的 `backgroundType` 声明（取值按小写精确匹配）：未声明时给出 INFO 提示并默认按 `custom` 处理；取值非 `solid` / `custom` 时由 manifest schema 在编译前负责提示，样式校验不重复报告。

#### Scenario: 未声明 backgroundType

- **WHEN** 轻卡 widget 未配置 `backgroundType`
- **THEN** 输出 INFO 提示「默认按 custom 处理」，不产生 ERROR

#### Scenario: backgroundType 非法

- **WHEN** `backgroundType` 取值为 `solidx` 等非法值
- **THEN** 样式校验跳过 `solid` 专属规则且不重复报告（提示由 manifest schema 给出）

### Requirement: solid 卡片背景规范校验

对声明 `backgroundType: "solid"` 的轻卡，校验器 SHALL 校验根节点背景：必须设置在根节点、无背景图/渐变（含 `background-image` 与 `background` 简写）、浅色为 `#FFFFFF`/`#F5F5F5`、深色经 `@media (prefers-color-scheme: dark)` 设为 `#1A1A1B`（至少一条深色根背景，且所有深色根背景均为该值）、alpha 为 1。

#### Scenario: 合规 solid 卡片

- **WHEN** 根节点背景为 `#FFFFFF`，且深色媒体规则中根节点背景为 `#1A1A1B`
- **THEN** 不产生该卡片的背景规范诊断

#### Scenario: 根节点未设置背景

- **WHEN** 卡片只在子节点选择器上设置了背景，根节点没有背景
- **THEN** 输出 ERROR「solid 卡片的背景色必须设置在模板根节点上」

#### Scenario: 使用背景图

- **WHEN** solid 卡片根节点存在 `background-image`
- **THEN** 输出 ERROR 提示不允许使用 background-image

#### Scenario: 使用 background 简写渐变

- **WHEN** solid 卡片根节点存在 `background` 简写且编译产物中含渐变结构
- **THEN** 输出 ERROR 提示不允许使用渐变

#### Scenario: 浅色背景色不合规范

- **WHEN** 根节点背景为 `#FF0000` 等非规范浅色
- **THEN** 输出 ERROR 提示仅支持 `#FFFFFF` / `#F5F5F5`

#### Scenario: 缺少深色模式适配

- **WHEN** solid 卡片没有 `@media (prefers-color-scheme: dark)` 下的根节点背景
- **THEN** 输出 ERROR 提示必须适配深色背景 `#1A1A1B`

#### Scenario: 深色背景色不合规范

- **WHEN** 任一深色媒体规则中的根节点背景不是 `#1A1A1B`
- **THEN** 输出 ERROR 提示仅支持 `#1A1A1B`

### Requirement: 背景透明度校验

对 `solid`、`custom` 及未声明 `backgroundType` 的轻卡，校验器 SHALL 拒绝根节点背景透明度（alpha < 1），覆盖基础规则与任意 `@MEDIA` 条件（含 `prefers-color-scheme: dark` 及与其他特征的组合），形式包括 `rgba()`、8/4 位 hex 与 `transparent`。

#### Scenario: custom 卡片透明背景

- **WHEN** `backgroundType: "custom"` 且根节点背景为 `rgba(0,0,0,0.5)`
- **THEN** 输出 ERROR 提示背景不允许有透明度

#### Scenario: 媒体条件中的透明背景

- **WHEN** 根节点在 `@MEDIA` 条件内（如 `prefers-color-scheme: dark`）被设置为半透明背景
- **THEN** 输出 ERROR 提示背景不允许有透明度

#### Scenario: 动态背景值值集合展开

- **WHEN** 根节点背景为可枚举表达式（如 `{{ mode === 2 ? "#FF0000" : "#FFFFFF" }}`）
- **THEN** 按可能取值集合逐值判定：含半透明取值输出 ERROR，全部合规通过
- **WHEN** 根节点背景为不可枚举表达式（如 `{{ themeColor }}`）
- **THEN** 输出 WARN `MATERIAL_BACKGROUND_UNRESOLVED`，不误报、不静默放过

### Requirement: custom 卡片背景类型放行

`custom`（含未声明）卡片 SHALL 允许使用图片、品牌色、渐变等自绘背景，不因背景类型本身产生诊断，仅受透明度规则约束。

#### Scenario: custom 使用渐变或图片背景

- **WHEN** `backgroundType: "custom"` 且根节点使用 `background` 简写渐变或 `background-image`
- **THEN** 不产生背景类型相关诊断

### Requirement: 编译期诊断经样式日志通道输出且不阻塞打包

所有材质规范诊断 SHALL 由编译器样式校验产出、经样式编译日志通道（`style-loader` → `colorconsole`）输出，含 `[卡片高级材质]` 前缀、级别、诊断码与规范文档链接；SHALL NOT 写入 `compilation.errors`，构建继续并照常产出 rpk/rpks。

#### Scenario: 违规卡片仍可出包

- **WHEN** 轻卡存在材质规范违规
- **THEN** `hap build` 打印对应诊断，进程按成功结束且产物包含该卡片

#### Scenario: 诊断包含源码定位与修复指引

- **WHEN** 产生任意材质诊断
- **THEN** 消息包含 `[卡片高级材质]`、`诊断码：MATERIAL_*` 与规范参考链接；可定位时输出源码文件与行列号

### Requirement: 构建链上下文透传

构建链 SHALL 为轻卡合成单一版本化上下文（版本号 + `backgroundType` + 根节点静态 class/id + 内联背景声明及位置）并随片段请求透传，由编译器样式校验取用；上下文取不到（模板缺失、动态 class、manifest 缺失 / 解析失败）时 SHALL 降级跳过校验，不报错、不误报。

#### Scenario: 上下文合成并透传

- **WHEN** 编译 `type: lite` 卡片且 manifest 声明 `backgroundType`
- **THEN** 样式片段请求携带版本化上下文，校验按该声明执行（solid / custom 规则分流）

#### Scenario: 上下文缺失降级

- **WHEN** 模板根节点 class 为纯动态表达式 / 模板缺失 / manifest 不可读
- **THEN** 跳过该卡片的材质校验，构建行为与未引入校验时一致

### Requirement: 源码位置诊断与降级

诊断位置 SHALL 定位到源码：内联样式片段经片段行偏移映射回 `.ux` 行列（行级精度、列号近似），预处理样式（scss / less，含内联与外部文件）经 source map 映射回源码；无法映射时（`@import` 合并内容、外部样式无 map）SHALL 降级为文件级位置（不输出行列号）。

#### Scenario: 内联预处理样式映射回源码行

- **WHEN** `<style lang="scss">` 内联样式存在违规
- **THEN** 诊断行列号指向 `.ux` 中对应源码行

#### Scenario: 降级为文件级位置

- **WHEN** 违规来自 `@import` 合并内容或无法获得 source map
- **THEN** 诊断仍输出（含文件路径），不输出行列号，不误报

### Requirement: 校验规则可插拔

校验实现 SHALL 支持通过配置扩展/替换规则集或按规则 id 禁用规则，且默认规则可通过导出常量复用。

#### Scenario: 扩展自定义规则

- **WHEN** 调用方传入自定义规则与默认规则组合
- **THEN** 自定义诊断与默认诊断一并输出

#### Scenario: 禁用规则

- **WHEN** 调用方在 `disabledRules` 中列出某个规则 id
- **THEN** 该规则不产生任何诊断

#### Scenario: 单条规则异常不影响构建

- **WHEN** 某条规则执行时抛出异常
- **THEN** 输出 WARN 诊断，其余规则照常执行，构建不中断

### Requirement: 校验范围限定为轻卡

默认配置下校验器 SHALL 仅处理 `router.widgets` 中 `type === "lite"` 的卡片，其他卡片不产生诊断。

#### Scenario: 跳过 JS 卡

- **WHEN** widget 的 `type` 不是 `lite`
- **THEN** 不产生该卡片的材质校验诊断
