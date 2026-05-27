# 初中数学 AI Tutor MVP 技术设计文档（V1）

## 1. 文档信息

- 产品名称：初中数学 AI Tutor
- 版本：V1 / MVP
- 文档类型：TDG（Technical Design Guide）
- 更新时间：2026-05-27
- 对齐文档：`docs/product/2026-05-27-prd-junior-math-ai-tutor-mvp-v1.md`
- 技术栈：Next.js + Tailwind CSS + shadcn/ui + Vercel AI SDK + Supabase + Gemini 2.5 Flash + Claude Sonnet + GPT-4.1 / o4-mini

---

## 2. 设计目标

本技术设计只服务于 MVP 首版验证，目标是在 6 周内稳定交付以下主链路：

`上传题目 -> OCR 识别 -> 题目结构化 -> Tutor 会话 -> 步骤评估 -> 错因记录 -> 自动复习任务`

本设计优先解决以下问题：

1. 如何做到“默认不直接给答案”
2. 如何稳定记录学生每一步输入与系统判断
3. 如何将一次做题沉淀为错因、画像和复习任务
4. 如何在多模型协作下控制延迟、成本和失败率

---

## 3. MVP 范围与非范围

### 3.1 In Scope

- 学生端 Web 应用
- 题目图片上传
- OCR 和题目标准化
- 题型与知识点初步识别
- Tutor 多轮对话
- 文本步骤输入
- 步骤正确性与理解程度评估
- 错因分类
- 自动复习任务生成
- 学习历史与基础画像

### 3.2 Out of Scope

- 家长端独立页面
- 管理后台完整界面
- 手写步骤识别
- 语音输入输出
- 多学科支持
- 大规模题库平台
- 教师/班级/社区系统
- 自训练模型

### 3.3 首版设计原则

- 先保证主链路稳定，不追求功能面广
- 结构化记录优先于“更像老师”的表达
- 模型失败时允许降级，不允许流程中断
- 优先保留学习资产，再优化教学体验

---

## 4. 整体架构

### 4.1 逻辑架构

```text
Student Web
  -> Next.js App Router
  -> Server Actions / Route Handlers
  -> AI Orchestration Layer
      -> OCR Adapter (Gemini 2.5 Flash)
      -> Tutor Adapter (Claude Sonnet)
      -> Evaluation Adapter (GPT-4.1 / o4-mini)
  -> Domain Services
      -> Problem Service
      -> Session Service
      -> Tutor Engine
      -> Evaluation Service
      -> Review Service
      -> Profile Service
  -> Supabase
      -> Postgres
      -> Auth
      -> Storage
```

### 4.2 角色分工

| 层级 | 职责 |
|------|------|
| Client | 上传图片、展示 Tutor 对话、展示复习任务和历史 |
| Route Handlers | 接收请求、校验参数、调用领域服务 |
| AI Orchestration | 封装模型调用、统一超时、重试、日志和成本统计 |
| Domain Services | 处理业务规则、状态流转、数据落库 |
| Supabase | 持久化会话、消息、评估、复习和画像 |

### 4.3 模型编排原则

| 模型 | 首版职责 | 不负责 |
|------|----------|--------|
| Gemini 2.5 Flash | OCR、题目文本提取、题型/知识点候选 | Tutor 对话 |
| Claude Sonnet | Socratic 引导、多轮教学话术、分步提示 | 最终结构化评分 |
| GPT-4.1 / o4-mini | 步骤评估、错因分类、结构化 JSON 输出 | 完整 Tutor 人格表现 |

设计原因：

- 识题和引导分离，避免一个模型同时承担视觉和教学
- 教学和评估分离，降低“自己出题自己判题”的不稳定性
- 结构化任务单独收敛到一个输出稳定的模型

---

## 5. 核心时序

### 5.1 主流程时序

```text
1. 学生上传题目图片
2. 服务端将图片存入 Supabase Storage
3. OCR Adapter 调用 Gemini 提取题干和候选标签
4. Problem Service 生成/更新 problem 记录
5. 学生进入会话页，请求开始 Tutor 会话
6. Tutor Engine 依据 problem + 会话上下文生成首轮提示
7. Claude 返回引导式问题
8. 学生输入步骤或回答
9. Evaluation Service 调用 GPT-4.1 / o4-mini 输出结构化评估
10. Tutor Engine 根据评估结果决定下一状态
11. Session Service 写入消息与评估结果
12. 若命中复习规则，则 Review Service 生成 review_tasks
13. Profile Service 异步刷新 learner_profiles 聚合数据
```

### 5.2 会话结束条件

以下任一条件成立即可结束会话：

- 学生完成题目
- 学生主动点击“查看解析”
- 系统连续多轮判断无进展，已进入解释态
- 学生中断超过阈值，由系统标记 abandoned

### 5.3 首版异步处理边界

同步返回：

- OCR 识别结果
- Tutor 当前轮回复
- 步骤评估结果

异步处理：

- learner_profiles 聚合刷新
- review_tasks 批量补写
- 质量分析日志

---

## 6. 运行时模块设计

### 6.1 Problem Service

职责：

- 上传题图
- 存储原图 URL
- 调用 OCR Adapter
- 标准化题干
- 写入 problem 记录

输入：

- 图片文件
- 用户 ID

输出：

- `problemId`
- `normalizedText`
- `problemType`
- `knowledgePoints`
- `confidence`

### 6.2 Session Service

职责：

- 创建会话
- 持久化消息
- 维护当前 Tutor 状态
- 标记会话完成或放弃

关键字段：

- `status`
- `current_tutor_state`
- `hint_level`
- `consecutive_failures`
- `consecutive_successes`

### 6.3 Tutor Engine

职责：

- 决定当前 Tutor 状态
- 决定是否继续提问、简化还是解释
- 构建 Tutor Prompt
- 限制“直接给答案”

不负责：

- OCR
- 最终结构化评估
- 画像聚合

### 6.4 Evaluation Service

职责：

- 调用结构化评估模型
- 输出 correctness / understanding / error type
- 生成短反馈
- 告知 Tutor Engine 下一步建议动作

### 6.5 Review Service

职责：

- 根据错因和知识点生成复习任务
- 执行简化间隔复习策略
- 避免短时间重复生成相同任务

### 6.6 Profile Service

职责：

- 聚合近 7 天和近 30 天学习数据
- 生成弱知识点和高频错因统计
- 计算提示依赖度和准确率趋势

---

## 7. 项目结构建议

```text
src/
  app/
    page.tsx
    upload/page.tsx
    session/[id]/page.tsx
    history/page.tsx
    review/page.tsx
    api/
      problems/route.ts
      sessions/start/route.ts
      sessions/[id]/messages/route.ts
      sessions/[id]/evaluate/route.ts
      review/tasks/route.ts
  components/
    tutor/
    review/
    problem/
  lib/
    ai/
      gemini.ts
      claude.ts
      openai.ts
      instrumentation.ts
    domain/
      problem-service.ts
      session-service.ts
      tutor-engine.ts
      evaluation-service.ts
      review-service.ts
      profile-service.ts
    prompts/
      tutor-system.ts
      evaluation-system.ts
    supabase/
      client.ts
      server.ts
  types/
    domain.ts
    api.ts
supabase/
  migrations/
```

说明：

- 首版不预建 parent/admin 目录
- 首版不引入复杂前端状态库，优先使用服务端数据和局部组件状态
- Tutor 相关逻辑集中在 `lib/domain` 和 `lib/prompts`

---

## 8. 数据模型设计

### 8.1 核心表

首版只把以下 6 张表视为强依赖：

1. `problems`
2. `sessions`
3. `messages`
4. `step_evaluations`
5. `review_tasks`
6. `learner_profiles`

### 8.2 Schema

```sql
create table problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_image_url text not null,
  ocr_text text not null,
  normalized_text text not null,
  problem_type text,
  knowledge_points text[] default '{}',
  difficulty smallint,
  confidence numeric(4,3),
  source text not null default 'upload',
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  current_tutor_state text not null default 'observe',
  hint_level smallint not null default 1,
  consecutive_failures smallint not null default 0,
  consecutive_successes smallint not null default 0,
  solution_revealed boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('student', 'assistant', 'system')),
  content text not null,
  tutor_state text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table step_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  student_input text not null,
  correctness text not null check (correctness in ('correct', 'partial', 'incorrect')),
  understanding_level text not null check (understanding_level in ('unknown', 'confused', 'partial_understanding', 'mostly_understood', 'mastered')),
  primary_error_type text,
  secondary_error_types text[] default '{}',
  feedback text not null,
  next_action text not null check (next_action in ('continue', 'hint', 'simplify', 'explain')),
  created_at timestamptz not null default now()
);

create table review_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  problem_id uuid references problems(id) on delete set null,
  knowledge_point text not null,
  error_type text,
  scheduled_for date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index review_tasks_dedupe_key_idx on review_tasks(dedupe_key);

create table learner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weak_knowledge_points jsonb not null default '[]',
  frequent_error_types jsonb not null default '[]',
  hint_dependency_score numeric(4,3) not null default 0.000,
  recent_accuracy numeric(4,3),
  profile_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create index sessions_user_status_idx on sessions(user_id, status);
create index messages_session_created_idx on messages(session_id, created_at);
create index step_evaluations_session_created_idx on step_evaluations(session_id, created_at);
create index review_tasks_user_date_idx on review_tasks(user_id, scheduled_for, status);
create index problems_knowledge_points_gin_idx on problems using gin(knowledge_points);
```

### 8.3 为什么不把知识点树和错因表作为首版强依赖

原因：

- 首版先验证流程，不先做运营系统
- 知识点和错因可先通过枚举、JSON 配置和代码常量管理
- 等高频数据稳定后，再抽到独立配置表和后台

### 8.4 首版枚举建议

`understanding_level`

- `unknown`
- `confused`
- `partial_understanding`
- `mostly_understood`
- `mastered`

`primary_error_type`

- `concept_error`
- `reading_error`
- `formula_misuse`
- `step_skip`
- `calculation_error`
- `sign_error`

---

## 9. API 设计

### 9.1 API 清单

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/problems` | 上传题图并生成 problem |
| POST | `/api/sessions/start` | 基于 problem 创建会话并返回首轮 Tutor 回复 |
| POST | `/api/sessions/[id]/messages` | 学生继续对话，获取 Tutor 回复 |
| POST | `/api/sessions/[id]/evaluate` | 提交步骤，获取结构化评估和下一步建议 |
| GET | `/api/review/tasks` | 获取今日复习任务 |

说明：

- 首版不单独暴露 profile 修改接口
- learner profile 通过服务端聚合维护

### 9.2 POST `/api/problems`

请求：

```ts
type CreateProblemRequest = FormData & {
  image: File;
};
```

响应：

```ts
type CreateProblemResponse = {
  success: true;
  data: {
    problemId: string;
    normalizedText: string;
    problemType: string | null;
    knowledgePoints: string[];
    confidence: number;
    needsManualConfirm: boolean;
  };
};
```

规则：

- 识别置信度低于阈值时，前端要求用户确认或修正题干
- 图片上传成功但 OCR 失败时，保留原图并返回可重试状态

### 9.3 POST `/api/sessions/start`

请求：

```ts
type StartSessionRequest = {
  problemId: string;
};
```

响应：

```ts
type StartSessionResponse = {
  success: true;
  data: {
    sessionId: string;
    tutorState: "observe" | "hint";
    hintLevel: number;
    message: string;
  };
};
```

规则：

- 首轮消息必须为提问或轻提示
- 首轮消息禁止完整解析

### 9.4 POST `/api/sessions/[id]/messages`

请求：

```ts
type ContinueSessionRequest = {
  input: string;
  action?: "continue" | "give_up" | "see_solution";
};
```

响应：

```ts
type ContinueSessionResponse = {
  success: true;
  data: {
    tutorState: string;
    hintLevel: number;
    message: string;
    sessionStatus: "active" | "completed";
  };
};
```

规则：

- `see_solution` 需要显式记录 `solution_revealed = true`
- 返回消息长度受 prompt 规则控制

### 9.5 POST `/api/sessions/[id]/evaluate`

请求：

```ts
type EvaluateStepRequest = {
  studentInput: string;
};
```

响应：

```ts
type EvaluateStepResponse = {
  success: true;
  data: {
    correctness: "correct" | "partial" | "incorrect";
    understandingLevel:
      | "unknown"
      | "confused"
      | "partial_understanding"
      | "mostly_understood"
      | "mastered";
    primaryErrorType: string | null;
    secondaryErrorTypes: string[];
    feedback: string;
    nextAction: "continue" | "hint" | "simplify" | "explain";
  };
};
```

规则：

- `feedback` 必须包含“当前评价 + 下一步动作”
- 不允许只返回“对”或“错”

### 9.6 GET `/api/review/tasks`

查询参数：

- `date`
- `status`

响应：

```ts
type ReviewTaskListResponse = {
  success: true;
  data: {
    tasks: Array<{
      id: string;
      knowledgePoint: string;
      errorType: string | null;
      scheduledFor: string;
      status: "pending" | "completed" | "skipped";
    }>;
  };
};
```

---

## 10. Tutor Engine 设计

### 10.1 状态定义

```ts
export type TutorState =
  | "observe"
  | "hint"
  | "encourage"
  | "simplify"
  | "challenge"
  | "explain";
```

### 10.2 状态转移规则

默认策略：

- 新会话进入 `observe`
- 首轮通常输出 `hint`
- 正确且连续有进展时可进入 `challenge`
- 多轮无进展时进入 `simplify`
- 连续失败且 hint_level 高时进入 `explain`

建议规则：

```text
if action == see_solution -> explain
if consecutive_failures >= 2 -> simplify
if consecutive_failures >= 3 -> explain
if correctness == correct and understanding == mostly_understood -> challenge
if correctness == partial -> hint
else -> observe
```

### 10.3 提示层级

首版使用 5 层提示，而不是 8 层，减少调优复杂度。

| 层级 | 类型 | 示例 |
|------|------|------|
| 1 | 识别题型 | “这题更像方程、函数还是几何？” |
| 2 | 明确条件 | “题目给了什么条件，要求什么？” |
| 3 | 提示方法 | “这类题通常先列式还是先找关系？” |
| 4 | 提示第一步 | “你先试着把第一步写出来。” |
| 5 | 局部解释 | “前面应该先用这个关系式，再继续往下推。” |

说明：

- 首版默认不设计独立“接近答案层”
- 完整解析不算提示层级，而是显式终局动作

### 10.4 Prompt 设计要求

Tutor System Prompt 必须明确写入：

- 不直接给完整答案
- 每轮最多只推进一个小步骤
- 优先提问而不是讲解
- 要先肯定再纠偏
- 学生连续卡住时允许简化问题

Tutor Prompt 输入上下文只保留必要信息：

- 标准化题干
- 题型
- 知识点
- 当前 TutorState
- 当前 HintLevel
- 最近 4 条对话
- 最近一次结构化评估结果

这样做的原因：

- 控制 token
- 降低长上下文漂移
- 保持每轮输出稳定

### 10.5 直接给答案的控制规则

首版通过三层约束控制：

1. Prompt 规则
2. Server 侧动作约束
3. 输出审查

输出审查策略：

- 如果检测到 Tutor 在前 3 轮给出完整解法模板，则拒绝写回并重试一次
- 若重试仍失败，则切换为固定兜底模板：
  `我们先不看完整答案，你先告诉我这题考什么。`

---

## 11. 步骤评估设计

### 11.1 结构化输出

评估模型必须输出 JSON，字段固定为：

```json
{
  "correctness": "correct | partial | incorrect",
  "understanding_level": "unknown | confused | partial_understanding | mostly_understood | mastered",
  "primary_error_type": "concept_error | reading_error | formula_misuse | step_skip | calculation_error | sign_error | null",
  "secondary_error_types": [],
  "feedback_summary": "20字内简评",
  "next_action": "continue | hint | simplify | explain"
}
```

### 11.2 评估流程

```text
1. 读取 problem.normalized_text
2. 读取 student_input
3. 读取最近一次 TutorState
4. 调用评估模型
5. 校验 JSON schema
6. 结构化落库
7. 生成给学生的短反馈
8. 将结果交给 Tutor Engine 决定下一状态
```

### 11.3 反馈拼装规则

反馈由两部分组成：

- 第一部分：这一步哪里对/哪里不对
- 第二部分：下一步应该做什么

示例：

- “斜率写对了。你再想想常数项在图像里表示什么。”
- “这里去括号有误。先把 2 乘到括号里，再重写一遍。”

### 11.4 错因分类策略

首版采用“模型主判 + 规则兜底”。

规则兜底示例：

- 出现去括号错误，优先归为 `sign_error`
- 明显跳过中间推导，优先归为 `step_skip`
- 基础算术等式错误，优先归为 `calculation_error`

如果模型未返回合法错因：

- 先使用规则分类
- 仍无法判断时，主错因设为 `concept_error`

---

## 12. 复习与画像设计

### 12.1 复习触发规则

任一条件成立时生成复习任务：

- 同一知识点 7 天内累计错误 >= 2
- 同一错因 7 天内累计错误 >= 2
- 当前题目 `understanding_level = unknown` 且进入 `explain`

### 12.2 复习计划

首版使用固定间隔：

- 第 0 天
- 第 2 天
- 第 7 天
- 第 21 天

### 12.3 去重策略

`dedupe_key` 组成建议：

`user_id + knowledge_point + error_type + scheduled_for`

同一用户同一天同知识点同错因只生成一条任务。

### 12.4 learner_profiles 聚合策略

每次会话结束后异步刷新：

- 最近 7 天正确率
- 最近 7 天最弱知识点 Top N
- 最近 7 天高频错因 Top N
- 提示依赖度

提示依赖度建议定义：

`使用高层提示次数 / 总交互轮数`

---

## 13. 失败兜底与降级设计

### 13.1 OCR 失败

场景：

- 图片无法解析
- 置信度过低

处理：

- 返回原图保留
- 前端允许用户手动修正题干
- 标记 `needsManualConfirm = true`

### 13.2 Tutor 模型超时

场景：

- Claude 响应超时

处理：

- 超时阈值建议 8 秒
- 重试 1 次
- 仍失败则返回固定兜底提示：
  `我先帮你拆小一点。你先说题目问的是什么。`

### 13.3 评估模型失败

场景：

- GPT-4.1 / o4-mini 返回非 JSON
- JSON 校验不通过

处理：

- 自动重试 1 次
- 再失败则进入规则模式：
  - 正确性仅做粗粒度判断
  - 错因使用规则推断
  - `understanding_level` 默认为 `confused`

### 13.4 数据库写入失败

处理：

- 优先保证 `messages` 写入
- `learner_profiles` 与 `review_tasks` 可异步补偿
- 将失败请求写入服务端错误日志，支持后续重放

---

## 14. 幂等、重试与一致性

### 14.1 幂等要求

以下动作建议支持幂等：

- 图片上传后的 `problem` 创建
- 会话开始
- 复习任务生成

### 14.2 幂等实现建议

- 上传请求携带 `client_request_id`
- `review_tasks` 使用唯一 `dedupe_key`
- `sessions/start` 对同一 `problem_id + user_id + active` 优先复用现有 active session

### 14.3 一致性策略

首版采用“主记录强一致，聚合数据最终一致”：

- `problems / sessions / messages / step_evaluations` 为主记录
- `learner_profiles / review_tasks` 允许异步更新

---

## 15. 性能与成本控制

### 15.1 延迟预算

目标：

- OCR 接口 P95 <= 5s
- Tutor 单轮回复 P95 <= 4s
- 步骤评估 P95 <= 3s

### 15.2 成本控制策略

- OCR 仅在题目创建时调用一次
- 对话和评估分模型调用，避免把视觉上下文重复带入
- Tutor 上下文只带最近 4 条消息
- 结构化评估优先使用 `o4-mini`，复杂场景再切 `GPT-4.1`

### 15.3 缓存策略

首版只做轻缓存：

- 已识别 `problemId` 的 OCR 结果不重复调用
- 会话页刷新时直接读取数据库，不重放模型生成

---

## 16. 安全与权限

### 16.1 身份体系

首版使用 Supabase Auth。

用户仅有学生角色，不在首版引入 parent/admin 权限模型。

### 16.2 数据隔离

所有主数据表基于 `user_id` 做 RLS。

要求：

- 学生只能访问自己的 `problems`
- 学生只能访问自己的 `sessions`
- 学生只能访问自己的 `review_tasks`
- 学生只能访问自己的 `learner_profiles`

### 16.3 输入校验

服务端必须校验：

- 图片类型和大小
- session 所属 user
- 文本输入长度
- 枚举字段合法性

---

## 17. 可观测性设计

### 17.1 日志字段

每次模型调用至少记录：

- `request_id`
- `user_id`
- `session_id`
- `model_name`
- `latency_ms`
- `input_tokens`
- `output_tokens`
- `success`
- `fallback_used`

### 17.2 业务指标

首版必须可统计：

- OCR 成功率
- OCR 低置信度率
- Tutor 首轮继续率
- 平均交互轮数
- 完整解析触发率
- 评估 JSON 失败率
- 复习任务生成率
- 次日复习回访率

### 17.3 人工质检样本

建议保留可脱敏会话样本用于人工复盘：

- OCR 错误样本
- Tutor 直接给答案样本
- 错因分类异常样本

---

## 18. 测试策略

### 18.1 单元测试

优先覆盖：

- Tutor 状态流转
- 提示层级升级
- 错因规则分类
- review task 去重
- learner profile 聚合计算

### 18.2 集成测试

优先覆盖：

- 上传图片到生成 problem
- problem 到 start session
- evaluate 返回结构化结果并落库
- 会话结束后生成 review task

### 18.3 不在首版强求

- 全量 E2E 自动化
- 对所有模型输出做快照测试

首版建议对关键 prompt 做少量回归样例即可。

---

## 19. 部署建议

### 19.1 环境

- 前端与 API：Vercel
- 数据库与存储：Supabase
- Secrets：Vercel Environment Variables

### 19.2 必要环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### 19.3 发布顺序

1. 先联通数据库和上传链路
2. 再联通 OCR
3. 再联通 Tutor 会话
4. 最后接入评估、复习和画像聚合

---

## 20. 已知风险

### 20.1 “不直接给答案”仍可能被模型突破

解决方向：

- Prompt 约束
- Server 输出审查
- 失败后固定兜底模板

### 20.2 OCR 识别质量直接影响后续全链路

解决方向：

- 允许手动修题
- 记录低置信度样本
- 优先优化高频题型

### 20.3 评估模型可能把“表达不规范”误判为“不会”

解决方向：

- 分离 correctness 和 understanding
- 用规则兜底减少极端误判

### 20.4 复习任务可能过多

解决方向：

- dedupe
- 同日上限
- 先按知识点聚合而不是每题都建任务

---

## 21. 后续扩展

V2 之后再考虑：

- 家长端
- 运营后台
- 手写识别
- 更细粒度知识图谱
- 动态难度调节
- 个性化 Tutor 风格

---

## 22. 结论

这份技术设计的核心不是做一个“大而全的教育平台”，而是稳定交付一条可验证的 AI Tutor 主链路。

首版最重要的不是页面数量，而是以下三件事是否成立：

1. 题目能稳定识别并进入会话
2. Tutor 能持续引导而不是直接剧透
3. 每次错误都能沉淀为复习和画像数据

如果这三件事成立，后续再扩展家长端、后台和更复杂的教学策略才有意义。
