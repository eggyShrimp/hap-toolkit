# 工具链能力参考（通用）

> 用途：后续迭代的能力池与出处；**不承诺本期范围**。
> 关联：《技术方案：轻卡高级材质编译支持》§1.2 主要目标、§1.3 目标分拆。

## 1. 能力骨架（按开发者旅程）

### 编写期

| 能力 | 出处 |
|---|---|
| Schema 校验与 IDE 补全（JSON/YAML 等） | [SchemaStore](https://www.schemastore.org)（VS Code / IntelliJ / Android Studio 自动加载） |
| 模板 / 脚手架默认带新特性声明 | 工程惯例（Angular / Android Studio 模板） |

### 编译期（Lint 体系）

| 能力 | 出处 |
|---|---|
| 规则 id + 严重级别（disable / ignore / informational / warning / error / fatal） | [Android Lint](https://developer.android.com/studio/write/lint) |
| 规则启停、只跑指定规则（enable / disable / checkOnly） | Android Lint |
| 安全修复自动应用（autofix）、不安全修复给建议（suggestion） | [ESLint CLI](https://eslint.org/docs/latest/use/command-line-interface)、Android Lint quickfix（`lintFix` / `--apply-suggestions`） |
| 抑制机制（注解 / 配置 / baseline 冻结存量）+ 防滥用（报告未使用的禁用） | Android Lint（`@SuppressLint`、`lint.xml`、baseline）、ESLint `--report-unused-disable-directives` |
| 快速修复附规则文档链接 | VS Code ESLint `showDocumentation`、SARIF `help.markdown` |
| 平台能力级别检查（如 API 级别 vs minSdk） | Android Lint `NewApi` |
| CI 门禁（警告数阈值） | ESLint `--max-warnings` |

### 调试 / 预览期

| 能力 | 出处 |
|---|---|
| 预览参数化模拟（夜间模式 `uiMode`、设备 `device`） | [Compose `@Preview`](https://developer.android.com/develop/ui/compose/tooling/previews) |
| 交互式预览（无需模拟器） | Compose Preview |

### 迁移期

| 能力 | 出处 |
|---|---|
| 版本化迁移脚本（`migrations.json` 按版本注册），自动改写代码 | [Angular migrations](https://angular.dev/reference/migrations/standalone) |
| 静态分析边界：无法静态分析的代码会跳过 | Angular migrations 文档 |

### 报告与集成

| 能力 | 出处 |
|---|---|
| 标准结果格式 SARIF（ruleId / level / location / help），CI 与 PR 直接标注 | [SARIF](https://docs.github.com/en/code-security/concepts/code-scanning/sarif-files)（OASIS 标准） |

## 2. 与高级材质特性的映射

| 通用能力 | 高级材质场景 |
|---|---|
| Schema 校验 | manifest `backgroundType` 取值约束（当前 schema 未定义该字段） |
| 规则 id + 级别 | 背景规范校验（诊断码、级别） |
| autofix / suggestion | 自动补深色媒体查询、规范化色值 |
| baseline | 存量卡片冻结，只报新增违规 |
| 能力级别检查 | `backgroundType` 与 `minPlatformVersion` 组合校验 |
| 预览模拟 | 材质档位（通透/柔和/关闭）、壁纸明暗 |
| 迁移脚本 | 存量卡片批量补声明 / 规范色值 |
| SARIF | 审核报告 / CI 门禁输出 |

## 3. 适用性与优先级

| 能力 | 结论 | 说明 |
|---|---|---|
| 诊断消息附规范文档链接 | ✅ P1 | 成本极低，降低查文档成本 |
| manifest schema 约束 `backgroundType` | ✅ P1 | 编写期即拦截，编辑器可提示 |
| autofix / 修复建议 | ❌ 不适用 | 规范未定稿，自动改写用户卡片代码风险高；以诊断 + 文档指引代替 |
| baseline / 未使用禁用报告 | ❌ 不适用 | 诊断不阻塞、存量未声明仅 INFO，无存量刷屏问题；避免额外机制与维护面 |
| 能力级别检查 | ❌ 不适用 | 本特性不设平台版本门槛（旧引擎不匹配即等价默认 `none`），无低版本误用场景 |

> 存量迁移 codemod、SARIF 报告等暂不列入推进计划，仅作知识记录（见第 1 节）。

## 4. 独立配套任务（不计入方案目标）

以下事项来自工程实践建议，需求文档与会议均未要求；作为独立任务推进，不影响本方案范围：

| 任务 | 说明 | 参考 |
|---|---|---|
| 卡片模板 / 示例带声明与深色适配 | 新建卡片即符合规范；收益依赖 `hap init` 使用面 | 工程惯例（Angular / Android 模板机制） |

## 5. 来源清单

- Android Lint：https://developer.android.com/studio/write/lint
- ESLint CLI：https://eslint.org/docs/latest/use/command-line-interface
- Compose Preview：https://developer.android.com/develop/ui/compose/tooling/previews
- Angular migrations：https://angular.dev/reference/migrations/standalone
- SARIF / GitHub Code Scanning：https://docs.github.com/en/code-security/concepts/code-scanning/sarif-files
- JSON Schema Store：https://www.schemastore.org
