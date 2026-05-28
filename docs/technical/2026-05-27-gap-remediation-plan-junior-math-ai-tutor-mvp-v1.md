# 初中数学 AI Tutor MVP 实际差距修复计划

## 1. 文档信息

- 文档名称：实际差距修复计划
- 对齐对象：
  - `docs/technical/2026-05-27-tdg-junior-math-ai-tutor-mvp-v1.md`
  - `docs/product/2026-05-27-prd-junior-math-ai-tutor-mvp-v1.md`
  - `docs/ux/2026-05-27-ux-ia-pages-junior-math-ai-tutor-mvp-v1.md`
- 更新时间：2026-05-27

---

## 2. 目标

本文件用于承接当前代码实现与 TDG/PRD/UX 文档之间的实际差距，输出一份按优先级排序的修复计划。

目标不是继续扩功能，而是先把现有 MVP 主链路从“看起来能跑”修到“结构正确、数据可信、可继续扩展”。

---

## 3. 当前总体判断

当前项目已经具备以下基础：

- 学生端核心页面骨架已存在
- 5 个核心 API 路由已建立
- Supabase schema 和 RLS 已初步建立
- Problem / Session / Tutor / Evaluation / Review / Profile service 均已存在

当前项目的主要问题不在“有没有页面”，而在以下四类差距：

1. 会话状态管理存在架构风险
2. 结构化评估结果存在字段解析错误
3. 认证与真实数据链路未真正打通
4. 复习与画像闭环逻辑尚未按设计落地

---

## 4. 修复优先级总览

| 优先级 | 主题 | 目标 |
|--------|------|------|
| P0 | 核心正确性修复 | 先修会话、评估、持久化、认证这些会直接导致错误结果的问题 |
| P1 | 主链路真实化 | 去掉 mock 数据，打通 OCR 确认、结果、历史、复习闭环 |
| P2 | 设计对齐与可运营性 | 恢复模型分工、完善画像和观测能力 |

---

## 5. P0 修复项

## P0-1. 移除 TutorEngine 单例上下文

### 问题

当前 `TutorEngine` 使用单例实例保存 `context`，不同用户或不同会话之间会共享状态。

这会导致：

- 不同会话的 `hintLevel` 互相污染
- 最近消息上下文串线
- 错误会话的评估结果影响其他会话

### 涉及文件

- `src/lib/domain/tutor-engine.ts`
- `src/app/api/sessions/start/route.ts`
- `src/app/api/sessions/[id]/messages/route.ts`
- `src/app/api/sessions/[id]/evaluate/route.ts`

### 修复方向

- 不再在 `TutorEngine` 内部持有全局 `context`
- 每次调用显式传入 `session context`
- `session context` 从数据库与最近消息动态构建
- `updateAfterEvaluation()` 改成纯函数或静态计算函数

### 验收标准

- 任意两个并发 session 不共享 `recentMessages`
- 任意两个并发 session 的 `hintLevel` 和 `tutorState` 互不影响
- `TutorEngine` 不再依赖类成员保存会话状态

---

## P0-2. 修复结构化评估字段解析错误

### 问题

评估 prompt 要求模型输出 snake_case 字段，但解析逻辑读取 camelCase 字段。

这会导致：

- 模型即使正常返回 JSON，也会被误判成缺字段
- `understandingLevel`、`primaryErrorType`、`feedbackSummary` 等落入默认值
- 后续 Tutor 状态流转失真

### 涉及文件

- `src/lib/domain/evaluation-service.ts`
- `src/lib/prompts/evaluation-system.ts`
- `src/types/domain.ts`

### 修复方向

- 统一结构化输出字段命名
- 推荐方案：模型输出 snake_case，解析后在 service 层转换成 domain camelCase
- 引入严格 schema 校验，不允许静默吞字段
- JSON 解析失败时明确进入 fallback 分支

### 验收标准

- 模型返回的 `understanding_level` 能正确映射到 `understandingLevel`
- 模型返回的 `primary_error_type` 能正确映射到 `primaryErrorType`
- 结构化评估接口在正常情况下不再大量落入默认值

---

## P0-3. 主记录写库失败不得继续返回成功

### 问题

当前 `problem`、`session`、`message` 写库失败时只记录 `console.error`，然后继续返回成功对象。

这会导致：

- 前端拿到看似成功的 `problemId` / `sessionId`
- 实际数据库中没有对应记录
- 后续确认页、结果页、历史页出现查不到数据的问题

### 涉及文件

- `src/lib/domain/problem-service.ts`
- `src/lib/domain/session-service.ts`

### 修复方向

- `problems / sessions / messages` 作为主记录，写库失败必须抛错
- Route Handler 根据错误返回 500 或 503
- 保持 `review_tasks / learner_profiles` 允许异步补偿，但主记录不允许假成功

### 验收标准

- `problem` 插入失败时 `/api/problems` 返回失败
- `session` 插入失败时 `/api/sessions/start` 返回失败
- `message` 插入失败时 `/api/sessions/[id]/messages` 返回失败

---

## P0-4. 替换 demo-user 伪认证方案

### 问题

当前前端大量写死 `x-user-id: demo-user`，实际没有真正使用 Supabase Auth。

这会导致：

- RLS 没有真实验证价值
- 用户隔离依赖前端 header，存在安全和一致性问题
- 服务端无法基于真实 session 判断用户身份

### 涉及文件

- `src/app/page.tsx`
- `src/app/upload/page.tsx`
- `src/app/review/page.tsx`
- `src/app/session/[id]/page.tsx`
- `src/app/problems/[id]/confirm/page.tsx`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- 所有读取 `x-user-id` 的 API route

### 修复方向

- 接入真实 Supabase Auth
- 页面侧不再手工传 `x-user-id`
- API Route 统一从服务端 session 读取用户身份
- 保持 TDG 中的 `RLS + user_id` 隔离模型

### 验收标准

- 代码中不再存在 `demo-user`
- 代码中不再依赖 `x-user-id` 作为正式身份来源
- 未登录用户访问受保护接口返回 401

---

## 6. P1 修复项

## P1-1. 去掉 OCR 确认页 mock 数据

### 问题

`/problems/[id]/confirm` 页面当前使用 mock problem 数据，没有真实读取 problem 记录。

### 涉及文件

- `src/app/problems/[id]/confirm/page.tsx`
- 需新增：`GET /api/problems/[id]`

### 修复方向

- 增加 problem 查询接口
- 页面真实读取 `normalizedText / confidence / knowledgePoints`
- 编辑题干后提供真实更新动作

### 验收标准

- OCR 确认页显示的是实际上传题目的识别结果
- 不同题目 ID 会返回不同内容
- 编辑后的题干可真正持久化

---

## P1-2. 去掉结果页 mock 数据

### 问题

结果页当前直接写死会话结果，不是基于真实 `session / evaluation / review task` 聚合。

### 涉及文件

- `src/app/result/[id]/page.tsx`
- 建议新增：`GET /api/sessions/[id]/result`

### 修复方向

- 从真实 session 推导完成方式
- 从 step evaluations 聚合错因
- 从 review_tasks 判断是否已生成复习任务

### 验收标准

- 不同 session 结果页内容不同
- “自主完成 / 提示后完成 / 查看解析完成”真实反映数据
- 错因和建议来自真实记录

---

## P1-3. 去掉历史页 mock 数据

### 问题

历史页当前完全使用本地 mock sessions，并且点击后直接进入实时 session 页。

### 涉及文件

- `src/app/history/page.tsx`
- 建议新增：`GET /api/sessions`
- 建议新增：历史详情页或只读模式

### 修复方向

- 增加真实 session 列表接口
- 历史页展示真实 `problemText / status / startedAt`
- 区分“实时对话页”和“历史详情只读回放”

### 验收标准

- 历史页数据来自数据库
- 点击历史记录不会误进入实时活跃会话模式
- 已完成 session 和 abandoned session 可准确区分

---

## P1-4. 修复 ReviewService 与 TDG 的间隔策略不一致

### 问题

TDG 规定固定复习间隔 `0 / 2 / 7 / 21` 天，当前实现是随机 `1-3` 天。

另外，错误统计逻辑目前也不准确：

- `countRecentErrors()` 没按 user 过滤
- `countRecentErrorsByKP()` 不是统计知识点错误，而是在看 review task

### 涉及文件

- `src/lib/domain/review-service.ts`
- `src/app/api/review/tasks/route.ts`

### 修复方向

- 改为固定间隔计划
- 对同一触发源生成多条计划任务，或设计“父任务 + 次任务”结构
- 通过 `sessions -> problems -> step_evaluations` 正确统计用户维度错误历史

### 验收标准

- 新任务的计划时间符合 `0 / 2 / 7 / 21` 天
- 错误统计按当前用户隔离
- 知识点触发和错因触发都可复现

---

## P1-5. 补齐 review task 完成/跳过接口

### 问题

复习页现在只是前端本地改状态，没有真正写回数据库。

### 涉及文件

- `src/app/review/page.tsx`
- `src/app/api/review/tasks/route.ts`
- 建议新增：`PATCH /api/review/tasks/[id]`

### 修复方向

- 补齐 review task 状态更新接口
- 支持 `completed` / `skipped`
- 页面操作后重新拉取真实数据

### 验收标准

- 点击完成后数据库状态更新
- 刷新页面后状态保持不变
- 今日复习数量随状态变化而变化

---

## 7. P2 修复项

## P2-1. 恢复 TDG 的模型分工

### 问题

TDG 设计中结构化评估应由 `GPT-4.1 / o4-mini` 负责，但当前实现仍用 Claude 做评估。

### 涉及文件

- `src/lib/domain/evaluation-service.ts`
- `src/lib/ai/openai.ts`

### 修复方向

- 将结构化评估切到 `o4-mini` 或 `GPT-4.1`
- Claude 继续专注 Tutor 引导

### 验收标准

- Tutor 对话和结构化评估分别走不同模型
- 评估接口日志中模型名正确区分

---

## P2-2. 提升 learner profile 聚合可信度

### 问题

当前画像聚合逻辑较粗，部分统计不是从真实会话和评估闭环推导。

### 涉及文件

- `src/lib/domain/profile-service.ts`

### 修复方向

- 基于真实 session / evaluation / review task 聚合
- 明确 hint dependency 的计算来源
- 区分最近 7 天和最近 30 天统计

### 验收标准

- `weakKnowledgePoints` 来源可解释
- `frequentErrorTypes` 来源可解释
- `hintDependencyScore` 不再是占位实现

---

## P2-3. 让 instrumentation 真正可用

### 问题

当前 AI instrumentation 只做内存记录，适合开发调试，不适合后续质量分析。

### 涉及文件

- `src/lib/ai/instrumentation.ts`

### 修复方向

- 把关键日志输出到持久化日志系统或数据库
- 至少可追踪：模型名、耗时、是否 fallback、错误率、估算成本

### 验收标准

- 能按模型查看调用次数和错误率
- 能定位 OCR / Tutor / Evaluation 的失败分布

---

## 8. 推荐修复顺序

建议执行顺序如下：

1. P0-1 TutorEngine 去单例化
2. P0-2 评估字段解析修复
3. P0-3 主记录强一致修复
4. P0-4 真实认证接入
5. P1-1 OCR 确认页真实化
6. P1-2 结果页真实化
7. P1-3 历史页真实化
8. P1-4 复习调度策略修复
9. P1-5 复习任务状态接口补齐
10. P2 系列优化

原因：

- 前四项不修，后续所有页面真实化都有概率建立在错误状态上
- 页面层问题多数是“可见问题”，但 P0 是“底层正确性问题”

---

## 9. 完成判定

以下条件满足时，可认为 MVP 代码实现与当前 TDG 基本对齐：

1. 会话状态不再跨用户/跨 session 污染
2. 结构化评估结果字段能稳定落库并驱动 Tutor 状态
3. 主记录写库失败不会返回假成功
4. Supabase Auth 替代 demo-user
5. OCR 确认页、结果页、历史页均不再依赖 mock 数据
6. review task 可真实生成、完成、跳过
7. 复习计划符合固定间隔策略

---

## 10. 结论

当前项目已经过了“从 0 到 1 搭骨架”的阶段，接下来最重要的不是继续加页面，而是把现有主链路修正到可信状态。

这份修复计划的核心思想是：

- 先修正确性，再修闭环
- 先修主记录，再修聚合视图
- 先修真实数据链路，再修后续优化项

如果按这份顺序推进，后续再进入测试、验收和产品迭代会更稳。
