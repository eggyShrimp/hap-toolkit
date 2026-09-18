## ADDED Requirements

### Requirement: 编译器注册 prefers-material 媒体特征

编译器 SHALL 将 `prefers-material` 识别为受支持的离散型媒体特征，合法取值为 `none | frosted | glass`，并在编译产物中保留对应媒体条件。

#### Scenario: 合法取值编入产物

- **WHEN** 卡片样式包含 `@media (prefers-material: glass)`
- **THEN** 编译产物的 `@MEDIA` 中包含条件 `screen and (prefers-material: glass)`，且不产生不支持类警告

#### Scenario: 与 prefers-color-scheme 组合

- **WHEN** 样式包含 `@media (prefers-color-scheme: dark) and (prefers-material: glass)`
- **THEN** 编译产物中两个条件同时保留

#### Scenario: 非法取值告警并丢弃整条规则

- **WHEN** 样式包含 `@media (prefers-material: glossy)`
- **THEN** 输出 WARN 提示取值必须为 `none | frosted | glass`，且该规则不进入编译产物

#### Scenario: 既有媒体特征行为不受影响

- **WHEN** 样式包含未注册的媒体特征（如 `prefers-unknown`）
- **THEN** 仍按既有逻辑输出「不支持」警告并丢弃规则

### Requirement: prefers-material 不引入平台版本门槛

编译器 SHALL 不因平台/运行时版本拒绝 `prefers-material`；不支持高级材质的设备上由运行时条件匹配自然降级（等价 `none`）。

#### Scenario: 低版本目标仍可编译

- **WHEN** 卡片 `minCardRuntimeVersion` 低于任何高级材质版本要求
- **THEN** `@media (prefers-material: ...)` 仍正常编入产物，不额外报错
