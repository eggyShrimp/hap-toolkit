## Context

- 目标：让 hap-toolkit（beta 分支，基线 `2.0.9-beta.3`）具备两张能力——编出 `prefers-material` 媒体条件、对轻卡背景规范做编译期校验
- 现状：媒体特征白名单位于 `packages/hap-compiler/src/style/mediaquery.js`，未注册的特征会导致整条 `@media` 规则被丢弃；轻卡编译产物在 `packages/hap-packager` 的 `CardPlugin` 中组装为 `<卡片>.template.json` 与 `<卡片>.css.json`，当前无材质相关校验
- 约束：
  - 校验必须「Error 级提示但不阻塞打包」（09-16 会议共识），即不能写入 `compilation.errors`（`zip-plugin` 见到 errors 会跳过出包）
  - 本改动不一定合入上游 main（标准尚在与平台对齐），架构上要便于裁剪、替换、私有化演进
  - 仓库当前无 OpenSpec 能力规格，本变更建立第一批 capability specs

## Goals / Non-Goals

**Goals:**

- `@media (prefers-material: none|frosted|glass)` 能正常编入产物，且可与 `prefers-color-scheme` 等组合
- 在编译期发现轻卡背景不规范写法，给出可定位（卡片 + 文件 + 选择器/色值）的 ERROR/INFO 诊断
- 诊断输出不阻塞出包；规则集可插拔（扩展 / 替换 / 禁用）
- 覆盖需求文档 §2.1 全部校验项，并有单测与冒烟验证

**Non-Goals:**

- 不实现材质渲染、不修改引擎运行时行为、不修改 manifest 结构与 RPK 产物
- 不做 `backgroundType` 的工具链写入（由开发者/IDE 模板负责）
- 不校验 JS 卡（`type !== "lite"`）与非卡片页面
- 不在本轮定义最终「行业/平台标准」，仅按当前需求文档实现并可配置
- 不追求带源码行列号的诊断（本期采用产物级校验，见 Decisions）

## Decisions

### D1. 校验位置：产物级（CardPlugin 之后）而非源码级

- **选择**：在 `hap-packager` 中新增独立插件 `MaterialValidatePlugin`，于 `PROCESS_ASSETS_STAGE_ANALYSE` 阶段读取已生成的 `<卡片>.template.json` / `<卡片>.css.json`，结合 manifest 校验
- **理由**：
  - 规则需要「manifest 声明 + 模板根节点 + 样式规则（含 `@MEDIA`）」三方信息，产物级天然具备；源码级需要跨 fragment 拼装并把 `backgroundType`、根节点 class 一路透传（入口 → ux-loader → fragment loaders → compiler），改动面与回归风险大
  - 产物级看到的是最终生效结果，不受 `@import` 外部样式、复合选择器的写法影响，覆盖度更高
- **备选**：源码级（compiler + loader 透传）——仅在需要精确行号时有优势；本期不采用，但保留后续把同一诊断核心接入编译器侧的升级路径
- **备选**：直接在 `CardPlugin` 内联校验——不采用，保持插件职责单一，且便于后续按标准启停

### D2. 诊断输出：webpack warnings（ERROR 文案，不阻塞）

- 将诊断写入 `compilation.warnings`，`hap build` 会汇总打印且不中断；`zip-plugin` 仅在 `compilation.errors` 时跳过出包
- 消息格式统一前缀 `### Material Validate ### [卡片高级材质] ERROR|INFO: ...（卡片 <key>，<path>.ux）`，便于日志检索与后续 IDE 解析

### D3. 规则集可插拔

- `validators/material.js` 导出纯函数规则数组 `DEFAULT_MATERIAL_RULES`，插件接受 `rules`（扩展/替换）、`disabledRules`（按规则 id 禁用）、`silentInfo` 配置
- 规则签名：`run(context) -> Diagnostic[]`，`Diagnostic = { level, code, message }`
- 目的：标准未定稿时，可按平台/业务裁剪规则，无需改插件；后续对齐标准只需增删规则

### D4. 上下文构建与边界判定

- 根节点元信息：编译产物中轻卡静态 class 存于 `classList: string[]`（轻卡不支持动态 class 混用），id 为静态字符串
- 根节点背景来源：模板内联 `style` 优先于样式表；样式表中仅匹配「简单选择器」（class/id 组合），后代/子代选择器视为子节点，不参与判定
- 深色背景：从 `@MEDIA` 中条件含 `prefers-color-scheme: dark` 的根节点背景提取
- 颜色比较：大小写不敏感，允许等价 `rgb()` 形式；`transparent` 视为 alpha=0
- 动态表达式（`{{}}`）无法静态判定 → 跳过对应检查，不误报
- 子节点自身背景不检查（需求文档 §4.3 #13：内部背景不受材质影响）

### D5. 级别取值

- 需求文档 §2.1 表格：solid 各项为 ERROR；未声明 `backgroundType` 为 INFO；验证要点 #12 对「缺少深色适配」又表述为 warning
- 取舍：按需求文档表格默认 ERROR，规则内部可改（后续对齐标准时只需调整规则集配置）

### D6. 媒体特征取值

- 采用需求文档与 v2 接入文档一致的 `none | frosted | glass`（不采纳 09-03 会议记录转写中的 `glossity`）
- 与其他媒体特征一致，不绑定平台版本门槛（旧引擎不匹配条件即等价默认 `none`）

## Risks / Trade-offs

- [产物 JSON 结构变化会影响校验] → 校验器与单测绑定当前结构；结构变更时测试会先失败，可快速感知
- [无源码行号，开发者定位成本略高] → 消息携带卡片 key、文件路径、选择器与色值；后续可按 D1 备选升级
- [规则过严可能对存量卡片产生大量 ERROR] → 未声明 `backgroundType` 仅 INFO；ERROR 不阻塞出包；可经 `disabledRules`/`rules` 裁剪
- [`solid` 深色适配缺失的级别存在文档冲突] → 默认 ERROR 但可配置；如平台评审改为 warning，仅调整规则集
- [beta 分支与上游 main 分叉] → OpenSpec 产物与实现均在 fork/beta 分支管理，向上游提交时不含 OpenSpec 目录与版本号改动

## Migration Plan

- 无数据/接口迁移；开发者侧按需声明 `backgroundType` 并使用 `prefers-material` 适配
- 回滚策略：移除插件注册（1 行）即恢复原编译行为；`mediaquery.js` 白名单为向后兼容增量
- 交付后通过 `openspec archive` 将能力沉淀到长期 specs

## Open Questions

- `solid` 缺少深色适配最终按 ERROR 还是 WARN（需求文档表格 vs 验证要点 #12），待与平台/测试对齐
- 校验范围是否从轻卡扩展到 JS 卡（需求文档措辞为「卡片」，09-16 会议为「轻卡」）
- 是否/何时将 OpenSpec 流程与校验插件推进上游 main
