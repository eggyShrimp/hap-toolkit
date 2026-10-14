## Context

- 目标：让 hap-toolkit（beta 分支，基线 `2.0.9-beta.3`）具备两张能力——编出 `prefers-material` 媒体条件、对轻卡背景规范做编译期校验
- 现状：媒体特征白名单位于 `packages/hap-compiler/src/style/mediaquery.js`，未注册的特征会导致整条 `@media` 规则被丢弃；轻卡编译产物在 `packages/hap-packager` 的 `CardPlugin` 中组装为 `<卡片>.template.json` 与 `<卡片>.css.json`；产物级校验插件 `MaterialValidatePlugin`（`hap-packager`）已作为 alpha 过渡实现，本变更将其升级为源码阶段校验（见 D1）
- 约束：
  - 校验必须「Error 级提示但不阻塞打包」（09-16 会议共识），即不能写入 `compilation.errors`（`zip-plugin` 见到 errors 会跳过出包）
  - 本改动不一定合入上游 main（标准尚在与平台对齐），架构上要便于裁剪、替换、私有化演进
  - 仓库当前无 OpenSpec 能力规格，本变更建立第一批 capability specs

## Goals / Non-Goals

**Goals:**

- `@media (prefers-material: none|frosted|glass)` 能正常编入产物，且可与 `prefers-color-scheme` 等组合
- 在编译期发现轻卡背景不规范写法，给出可定位（源码行列号，预处理样式经 source map 映射）的 ERROR/INFO 诊断
- 诊断输出不阻塞出包；规则集可插拔（扩展 / 替换 / 禁用）
- 覆盖需求文档 §2.1 全部校验项，并有单测与冒烟验证

**Non-Goals:**

- 不实现材质渲染、不修改引擎运行时行为、不修改 manifest 结构与 RPK 产物
- 不做 `backgroundType` 的工具链写入（由开发者/IDE 模板负责）
- 不校验 JS 卡（`type !== "lite"`）与非卡片页面
- 不在本轮定义最终「行业/平台标准」，仅按当前需求文档实现并可配置
- 不做产物级二次校验：规则只在编译器侧实现一份，产物级实现仅作 alpha 过渡（见 D1）
- 不实现 W3C MQ5 的布尔上下文（`(prefers-material)`）与 `@custom-media`；不做大小写归一化（与既有媒体特征一致，见 D7）

## Decisions

### D1. 校验位置：源码阶段（构建链 + 编译器）而非产物级

- **选择**：ux-loader 读取 manifest 的 `backgroundType` 并解析 `.ux` 模板根节点 class，合并为单一版本化上下文随片段请求透传；编译器在执行样式解析（`parseStyle`）时运行背景规范规则，产出带源码位置（经 source map 映射）的诊断
- **理由**：
  - 诊断需要定位到源码行列（已决，见 review-guide.md）；预处理样式（scss / less / 外部样式）经 source map 一并覆盖
  - 校验与编译同路径，规则只在编译器侧实现一份，避免双份维护
- **过渡**：产物级实现（`MaterialValidatePlugin`）保留为 alpha 过渡版本，源码级稳定后下线；并存期以编译器侧为准
- **备选**：产物级（CardPlugin 之后）——仅在不需要行号、需极速交付时有优势；规则与诊断码可复用

### D2. 诊断输出：样式编译日志通道（ERROR 文案，不阻塞）

- 诊断随编译器样式解析结果进入现有日志通道（style-loader → `logWarn`），`hap build` 输出且不中断；不写入 `compilation.errors`（`zip-plugin` 仅见 errors 才跳过出包）
- 消息含 `[卡片高级材质]` 前缀、级别、诊断码、源码位置与规范文档链接（形态见技术方案 §2.4），便于日志检索与后续 IDE 解析

### D3. 规则集可插拔

- 规则集独立成模块（编译器侧），导出纯函数规则数组 `DEFAULT_MATERIAL_RULES`；校验器接受 `rules`（扩展/替换）、`disabledRules`（按规则 id 禁用）、`silentInfo` 配置
- 规则签名：`run(context) -> Diagnostic[]`，`Diagnostic = { level, code, message }`
- 目的：标准未定稿时，可按平台/业务裁剪规则，无需改校验器；后续对齐标准只需增删规则

### D4. 上下文构建与边界判定

- 上下文契约 `MaterialContext`（规则唯一输入，与数据来源解耦）：规则使用字段 `{ backgroundType, rootMeta: { classes, id }, base, medias[], hasBaseImageOrGradient }`；`base` = 默认条件下根节点背景的最终生效值（含 `backgroundColor` / `backgroundImage` / `background` / `gradientColors`），`medias[]` = 每个 `@media` 条件一条（`condition`、`isDark` 与同名背景字段）；产物级过渡实现构建同名字段，规则可原样复用
- 根节点元信息：由 ux-loader 解析 `.ux` 模板片段提取根节点静态 class / id；轻卡仅限制静态与动态 class 混用，纯动态表达式取不到时按降级跳过（不误报）
- 根节点背景来源：模板内联 `style` 优先于样式表；样式表中仅匹配「简单选择器」（class/id 组合），后代/子代选择器视为子节点，不参与判定
  - 实测：编译器的 `background` 简写仅支持渐变；`background-image` 仅支持 url；纯色必须写 `background-color`
- 背景图/渐变判定：`background-image` 与 `background` 简写（仅支持渐变）均视为图片/渐变背景
- 深色背景：从 `@media` 中条件含 `prefers-color-scheme: dark` 的根节点背景提取；判定语义为「至少存在一条深色根背景，且所有深色根背景均为 `#1A1A1B`」
- 媒体条件处理：每个 `@media` 条件以「增量覆盖」记录（`condition` / `isDark` + 覆盖值），嵌套与组合条件合并为一条；不预求条件组合下的完整生效值——规则按逐声明判定（透明度扫 `base` + 全部 `medias`；深色只看 `isDark`；浅色只看 `base`）
- 透明度检查：覆盖基础规则与全部 `@media` 条件块（含 `prefers-color-scheme: dark` 及组合条件）
- 颜色比较：大小写不敏感，允许等价 `rgb()` 形式；`transparent` 视为 alpha=0；无法识别的格式（编译器不支持的现代颜色语法）跳过检查，不误报
- 动态表达式（`{{}}`）：可枚举（字面量 / 三元 / 拼接 / 逻辑 / 纯函数）→ 展开为值集合逐值判定（含违规值 → ERROR）；不可枚举（数据路径 / Feature 调用 / `$t` / `$tc` / 白名单外 opcode）→ WARN `MATERIAL_BACKGROUND_UNRESOLVED`——不误报、不静默放过（展开与判定规则见技术方案「AST 确定动态表达式下样式范围」）
- 校验基于编译解析后的「最终生效值」：编译器已判定非法并丢弃的声明（如 `background: #fff`）不参与判定，可能表现为「根节点未设置背景」的二次提示
- 子节点自身背景不检查（需求文档 §4.3 #13：内部背景不受材质影响）
- `backgroundType` 取值按小写精确匹配（`solid` / `custom`）

### D5. 级别取值

- 需求文档 §2.1 表格：solid 各项为 ERROR；未声明 `backgroundType` 为 INFO；验证要点 #12 对「缺少深色适配」又表述为 warning
- 取舍：按需求文档表格默认 ERROR，规则内部可改（后续对齐标准时只需调整规则集配置）

### D6. 媒体特征取值

- 采用需求文档与 v2 接入文档一致的 `none | frosted | glass`（不采纳 09-03 会议记录转写中的 `glossity`），小写精确匹配（见 D7）
- 与其他媒体特征一致，不绑定平台版本门槛（旧引擎不匹配条件即等价默认 `none`）

### D7. W3C 对齐与扩展边界

`prefers-material` 是**基于 W3C Media Queries Level 5 惯例的平台扩展特性**（非标准特性），对齐与差异如下：

- **对齐**：`prefers-*` 命名、离散型特征、等值语法 `(feature: value)`、`and` 组合；最近似的标准特征是 MQ5 的 `prefers-reduced-transparency`（`no-preference | reduce`，无障碍偏好），二者语义互补
- **有意差异**：
  - 中性值用 `none`（材质关闭/设备不支持，系统状态）而非标准的 `no-preference`（用户无偏好）
  - 取值**小写精确匹配**：W3C 媒体查询为 ASCII 大小写不敏感（MQ3），本仓库所有既有媒体特征均为小写精确匹配，本期保持一致（`Glass` 会 WARN 并丢弃规则）
  - 不支持布尔上下文 `(prefers-material)`（MQ4 允许），与既有特征一致
  - 未知媒体特征在 W3C 语义下等价 `not all`（false），本工具链为「编译期丢弃 + WARN」，结果等效并额外提供开发期提示
  - 不支持 MQ5 的 `@custom-media`
- **扩展风险**：无前缀的自定义特征存在与未来标准特性命名/语义冲突的可能；缓解：保持引擎与工具链契约稳定，标准变化时评估迁移（前缀或映射）
- `backgroundType` 与背景规范校验属于**平台私有扩展**，与 W3C 无关，仅在 beta/私有规范范围内生效

## Risks / Trade-offs

- [样式解析结构 / 位置信息变化会影响校验] → 校验器与单测绑定当前解析结构；变更时测试会先失败，可快速感知
- [预处理样式（scss / less）位置失真或映射缺失] → 消费 source map；无法映射时降级为文件级位置（行级精度、列号近似）
- [产物级与源码级并存期诊断口径漂移] → 并存期以编译器侧为准；过渡结束下线产物级实现
- [规则过严可能对存量卡片产生大量 ERROR] → 未声明 `backgroundType` 仅 INFO；ERROR 不阻塞出包；可经 `disabledRules`/`rules` 裁剪
- [`solid` 深色适配缺失的级别存在文档冲突] → 默认 ERROR 但可配置；如平台评审改为 warning，仅调整规则集
- [无前缀自定义特征可能与未来 W3C 标准冲突] → 记录于 D7；保持引擎与工具链契约稳定，标准变化时评估前缀/映射迁移
- [严格小写与 W3C 大小写不敏感不一致] → 与既有媒体特征保持一致；未来如需放宽，应对全部特征统一归一化
- [beta 分支与上游 main 分叉] → OpenSpec 产物与实现均在 fork/beta 分支管理，向上游提交时不含 OpenSpec 目录与版本号改动

## Migration Plan

- 无数据/接口迁移；开发者侧按需声明 `backgroundType` 并使用 `prefers-material` 适配
- 回滚策略：移除校验接入（上下文透传与编译器规则）即恢复原编译行为；`mediaquery.js` 白名单为向后兼容增量
- 过渡：alpha 渠道先行；产物级实现保留至源码级完成，随后下线
- 交付后通过 `openspec archive` 将能力沉淀到长期 specs

## Open Questions

- `solid` 缺少深色适配最终按 ERROR 还是 WARN（需求文档表格 vs 验证要点 #12），待与平台/测试对齐
- 校验范围是否从轻卡扩展到 JS 卡（需求文档措辞为「卡片」，09-16 会议为「轻卡」）
- 是否/何时将 OpenSpec 流程与校验实现推进上游 main
- 是否在未来统一支持媒体特征布尔上下文与大小写归一化（涉及全部既有特征，需与引擎侧对齐）

## 工程实现细节（自评审稿转存）

> 转存自评审稿《技术方案：轻卡高级材质编译支持》附录（原 B、E 部分）；正文 Decisions 已按源码阶段校验等新决策同步（2026-09-30）。

### W3C MQ5 对齐明细

| 维度 | W3C 惯例 | 本方案 | 说明 |
|---|---|---|---|
| 命名与类型 | `prefers-*`、离散型 | 一致 | 最近似标准特征 `prefers-reduced-transparency` |
| 等值语法与组合 | `(feature: value)`、`and` | 一致 | — |
| 中性值 | `no-preference` | `none` | 语义不同：系统材质关闭 / 不支持 |
| 大小写 | 不敏感 | 小写精确匹配 | 与仓库既有特征一致 |
| 布尔上下文 | 允许 | 不支持 | 非本期范围 |
| 未知特征 | 等价 `not all` | 丢弃 + WARN | 结果等效 |

### source map 接入（精度方案）

事实：

- map 由构建链路生成（sass/less 编译时）、由校验器消费；开发者无需额外配置；
- 样式链路当前未接线：`style-loader` 丢弃上游 map；`less-loader` 需显式开启；
- JS 的 map 由 `devtool` 控制（development 默认开、production 默认关）。

需要做的：

1. 将 `fragment-loader`（构建链中拆分 `.ux` 片段的 loader）的 map 生成扩展到 STYLE 片段（JS 已有带行偏移的实现可复用）；
2. `less-loader` 显式开启 `sourceMap`；sass/less 与 `devtool` 解耦，保证 dev / prod 精度一致；
3. `style-loader` 接收并使用上游 map；
4. 编译器侧映射位置；现有映射为行级（column 0），列号近似。

输出边界：map 仅内部消费，不新增输出资产；release 包本就过滤 `.map`；增加回归测试保证产物清单不变。

### 维护性设计与防护

评估标准：ISO/IEC 25010 维护性子特性（模块化 / 可复用 / 可分析 / 可修改 / 可测试）作为维度；SEI ATAM 场景法（变更场景 → 度量）作为方法。

变更场景矩阵：

| 变更场景 | 设计对策 | 预期改动面 |
|---|---|---|
| 新增一条规则 | 规则集独立模块 | 1 个文件 + 单测 |
| 新增上下文字段 | 单一参数 + version | 1 处 |
| 中途插入新 loader | 参数随请求传递 | 无需改代码 |
| 新增 fragment 类型 | 统一请求构造器 | 1 处 |
| 样式语言扩展 | 精度分级策略 | 场景用例 |

透传链防护：

| 防护 | 解决的问题 |
|---|---|
| 统一请求构造器 | 重复拼参 5 处，新增片段漏参即静默失效 |
| 单一参数 + version | 参数膨胀、扩展破坏兼容 |
| 降级而非报错 | 参数丢失导致构建失败或误报 |
| 契约测试 | 重构 / 新 loader 悄悄丢参数 |
| 新增检查清单 | 维护者不知道要携带上下文 |

### 交付与回滚

- 交付：alpha 渠道先行；源码级实现完成前，产物级实现保留为过渡版本，完成后更新 alpha；
- 回滚：移除校验接入（上下文透传与编译器规则）即恢复原编译行为；媒体特征注册为向后兼容增量。
