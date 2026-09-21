## ADDED Requirements

### Requirement: backgroundType 声明检查

校验器 SHALL 读取 manifest 中 `router.widgets` 的 `backgroundType` 声明（取值按小写精确匹配）：未声明时给出 INFO 提示并默认按 `custom` 处理；取值不是 `solid` / `custom` 时给出 ERROR。

#### Scenario: 未声明 backgroundType

- **WHEN** 轻卡 widget 未配置 `backgroundType`
- **THEN** 输出 INFO 提示「默认按 custom 处理」，不产生 ERROR

#### Scenario: backgroundType 非法

- **WHEN** `backgroundType` 取值为 `solidx` 等非法值
- **THEN** 输出 ERROR 提示仅支持 `solid | custom`

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

#### Scenario: 动态背景值不误报

- **WHEN** 根节点背景为 `{{bgColor}}` 等动态表达式
- **THEN** 跳过该检查，不产生诊断

### Requirement: custom 卡片背景类型放行

`custom`（含未声明）卡片 SHALL 允许使用图片、品牌色、渐变等自绘背景，不因背景类型本身产生诊断，仅受透明度规则约束。

#### Scenario: custom 使用渐变或图片背景

- **WHEN** `backgroundType: "custom"` 且根节点使用 `background` 简写渐变或 `background-image`
- **THEN** 不产生背景类型相关诊断

### Requirement: 编译期诊断不阻塞打包

所有材质规范诊断 SHALL 以 `ERROR`/`INFO` 文案写入 webpack warnings，构建继续并照常产出 rpk/rpks。

#### Scenario: 违规卡片仍可出包

- **WHEN** 轻卡存在材质规范违规
- **THEN** `hap build` 打印对应诊断，进程按成功结束且产物包含该卡片

#### Scenario: 诊断包含卡片定位信息

- **WHEN** 产生任意材质诊断
- **THEN** 消息包含卡片 key（widget 路由）与卡片文件路径，便于定位

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
