# Nybar Practice · 纽约 Bar 刷题室

### [进入 Nybar Practice](https://ringo-deng.github.io/nybar-practice/)

沿用 [SQE Practice](https://github.com/Ringo-Deng/sqe-practice) 的练习界面与功能，使用独立的红色主题与学习数据空间。原项目参考版本：`97a5c85d29f92f17b94570889febbbd899874acd`。

## 当前内容

- **初始题库为空**，不包含 SQE 题目、虚构真题或商业题库内容。
- 按传统 UBE 的 MBE 七科分类：民事诉讼法、宪法、合同法、刑法与刑事诉讼、证据法、不动产法、侵权法。
- NCBE、BARBRI、AdaptiBar、UWorld 和“我的题目”仅为来源分类；尚未导入任何题目。
- 保留四选一练习、中英文本展示、逐题解析、错题重练、学习记录和记忆卡片。
- 支持导入个人 PDF 教材、连续阅读、高亮及笔记。

题目尚未导入时，刷题入口显示空态。可以先使用教材和记忆卡片功能。本站定位为 MBE 练习工具，不是包含 MEE、MPT 的完整 UBE 模考，也不与 NCBE 或培训机构存在隶属关系。

## 数据保存

学习记录、词卡、个人 PDF 和批注只保存在当前浏览器；不上传 GitHub，不跨设备同步。清除站点数据或更换浏览器可能导致本机记录丢失。

所有本机存储均使用 `nybar-practice` 命名空间，独立于同域名下的 SQE Practice。GitHub Pages 的静态题库文件是公开的；向仓库加入题目之前，应确认拥有公开使用权限。

## 后续导入题库

将有权使用的题目整理到 `lib/question-bank.json`。界面中的“导入 PDF”只用于教材阅读，不会自动将教材识别为题目。

题目结构见 `lib/study-types.ts`。每道题需使用稳定且唯一的 `id`、`sourceId`、`subjectId`、原题编号、题干和提问、四个 `A`–`D` 选项，以及含答案和逐项说明的 `explanation`。中文字段可留空；正文、翻译、原解析和补充说明应准确区分来源。科目 ID 见 `lib/subjects.ts`，来源 ID 见 `lib/question-sources.ts`。有章节时再维护 `lib/chapters.ts`。

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
