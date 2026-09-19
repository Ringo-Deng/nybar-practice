# Nybar Practice · 纽约 Bar 刷题室

### [进入 Nybar Practice](https://ringo-deng.github.io/nybar-practice/)

沿用 [SQE Practice](https://github.com/Ringo-Deng/sqe-practice) 的练习界面与功能，使用独立的红色主题与学习数据空间。原项目参考版本：`97a5c85d29f92f17b94570889febbbd899874acd`。

## 当前内容

- 已导入用户提供的 **2025UWorld MBE QBank.pdf**：**2,003 题**，按七科分类；选定科目后可连续练习本科全部题目，不再分批或限制 50 题。
- 按传统 UBE 的 MBE 七科分类：民事诉讼法、宪法、合同法、刑法与刑事诉讼、证据法、不动产法、侵权法。
- UWorld 分类含正文 1,803 题及原文件的 NCBE 200 题附录。附录按实际考查科目归入七科。其他来源分类仍待导入。
- 保留四选一练习、中英文本展示、逐题解析、错题重练、学习记录和记忆卡片。
- 支持导入个人 PDF 教材、连续阅读、高亮及笔记。

在题库分类中选择 UWorld 和科目，即可开始或继续练习。既有答题记录保留，历史练习仍可从学习记录中打开。题目保留英文原文、原解析、图表和 PDF 页码；本次未添加中文翻译。原 PDF 可在教材中阅读，也可从解析打开对应页。

本站定位为 MBE 练习工具，不是包含 MEE、MPT 的完整 UBE 模考，也不与 NCBE 或培训机构存在隶属关系。

| 科目 | 题数 |
| --- | ---: |
| 民事诉讼法 | 325 |
| 宪法 | 271 |
| 合同法 | 302 |
| 刑法与刑事诉讼 | 276 |
| 证据法 | 294 |
| 不动产法 | 277 |
| 侵权法 | 258 |

题目序号是按 PDF 顺序生成的固定入库序号，稳定 ID 绑定题干起始页，不冒充原书题号。英文文字仅整理换行、异常连字符及答题界面统计信息；图表保留原图或原页排版。

文件名含“2025”，附录界面仍标“2023Version”，文件元数据显示修改时间为 2024 年。本库按上传文件导入，未将文件名视为官方版本证明，也未进行现行法更新。

原文 90 题含明确答案，1,913 题根据解析排除的三个选项确定答案。明确答案中 89 题与解析排除项一致；PDF 第 5821–5822 页有一处选项字母误标，已按原文明确答案 D 和正文核定，并在该题单独显示核对说明。原解析没有改写。

完整核对记录、每题页码、答案识别依据、初次导入批次及抽查记录位于 [`data/uworld-2025/`](data/uworld-2025/)。这些批次仅保留为导入审计信息，不作为练习分组。来源文件 SHA-256 已记录；源 PDF 保持原样。抽查覆盖七科及特殊版式共 31 题，题库结构和全部媒体引用另作自动检查。

## 数据保存

学习记录、词卡、手动导入的个人 PDF 和批注只保存在当前浏览器；不上传 GitHub，不跨设备同步。清除站点数据或更换浏览器可能导致本机记录丢失。此次内置的题库原 PDF、题目与图表作为网站资源发布。

所有本机存储均使用 `nybar-practice` 命名空间，独立于同域名下的 SQE Practice。GitHub Pages 的静态题库文件是公开的；向仓库加入题目之前，应确认拥有公开使用权限。

## 后续导入题库

将有权使用的题目整理到 `lib/question-bank.json`。界面中的“导入 PDF”只用于教材阅读，不会自动将教材识别为题目。

题目结构见 `lib/study-types.ts`。每道题需使用稳定且唯一的 `id`、`sourceId`、`subjectId`、稳定序号、题干和提问、四个 `A`–`D` 选项，以及含答案和原解析（或逐项说明）的 `explanation`。原解析模式使用 `kind: 'publisher-original'`；逐项说明字段 `options` 可为空对象。中文字段可留空；正文、翻译、原解析和补充说明应准确区分来源。科目 ID 见 `lib/subjects.ts`，来源 ID 见 `lib/question-sources.ts`。有章节时再维护 `lib/chapters.ts`。

执行 `npm run check:questions` 后提交，GitHub Actions 会检查并自动更新页面。修改已有题目时保持原 ID，避免使保存的学习记录失去对应关系。

## 本地运行

需要 Node.js 22.13 或更高版本。

```sh
npm ci
npm run dev
npm run check:questions
npm run check:study
npm run build
```

静态输出位于 `dist-github/`，以 `/nybar-practice/` 为部署路径。站点不依赖服务端、账号或 API 密钥。答案存在于本机静态资源中，只用于个人自测。

## 考试信息

- [NCBE：MBE 科目、格式及官方样题](https://www.ncbex.org/exams/mbe/preparing-mbe)
- [NCBE：UBE 组成](https://www.ncbex.org/exams/ube)
- [纽约 BOLE：2028 年 7 月起采用 NextGen 的公告](https://www.nybarexam.org/Press/20260108%20Final%20Announcement%20-%20NextGen%20Bar%20Exam%20Transfer%20Scores.pdf)

以上范围于 2026 年 9 月核对；考试要求以官方最新公布为准。
