## Why

HyperOS 4 高级材质要求快应用轻卡适配：引擎根据 manifest 中 `backgroundType` 声明自动应用材质效果，并通过 `prefers-material` 媒体特性让开发者按材质状态调整内部样式。当前 hap-toolkit 无法编出 `prefers-material` 规则（媒体特征白名单缺失，整条 `@media` 被丢弃），也没有对轻卡背景规范的编译期校验，导致卡片无法完整适配高级材质、违规写法无法在开发阶段暴露。

来源：《快应用卡片高级材质适配 — 需求文档》§2.1/§2.2、《接入快应用卡片高级材质（v2 · 对齐 backgroundType 声明式方案）》、2026-09-16 会议纪要（江海/吕新/一凡）。

## What Changes

- **媒体特征支持**：`packages/hap-compiler/src/style/mediaquery.js` 注册 `prefers-material`（离散型，取值 `none | frosted | glass`），使 `@media (prefers-material: ...)` 能编入产物
- **轻卡背景规范校验**：新增可插拔校验能力 `MaterialValidatePlugin` + `validators/material.js`，在卡片编译产物组装后校验：
  - `backgroundType` 未声明 → INFO（默认按 custom 处理）
  - `backgroundType` 非法值 → ERROR
  - `solid`：根节点背景必须为规范纯色（浅色 `#FFFFFF`/`#F5F5F5`、深色 `#1A1A1B`），禁止 `background-image`/渐变，背景必须设置在根节点，需通过 `@media (prefers-color-scheme: dark)` 适配深色
  - `solid` / `custom`（含未声明）：根节点背景不允许有透明度（alpha < 1）
- **不阻塞打包**：违规以 `ERROR` 文案写入 webpack warnings，构建继续、rpk/rpks 照常产出
- **规则可插拔**：规则集可扩展/替换/禁用，便于后续对齐不同标准，避免绑定死私有规范
- **范围**：本期仅校验 `widgets[].type === "lite"` 的轻卡；不修改引擎运行时与 manifest 结构
- **测试补齐**：媒体特征单测 + 材质规则单测 + 编译冒烟验证

## Capabilities

### New Capabilities

- `prefers-material-media-query`: 编译器识别 `prefers-material` 媒体特征并编出对应媒体条件，支持与 `prefers-color-scheme` 等特征组合
- `lite-card-material-validation`: 轻卡背景规范的编译期校验，含 backgroundType 声明、solid/custom 背景规则、非阻塞诊断输出与可插拔规则机制

### Modified Capabilities

（无。本仓库尚无既有 OpenSpec 能力规格。）

## Impact

- **代码**：`packages/hap-compiler`（媒体特征白名单）、`packages/hap-packager`（新增校验器与插件、插件注册、插件导出）
- **产物**：不改变 RPK 结构与运行时行为，仅影响编译期日志与校验结果
- **兼容性**：无 BREAKING；旧工程无需改造即可编译（未声明 `backgroundType` 仅 INFO 提示）
- **交付**：基于 `2.0.9-beta.3` 的 beta 分支交付，暂不作为上游 main 的既定标准；OpenSpec 产物仅随 beta/fork 分支管理
