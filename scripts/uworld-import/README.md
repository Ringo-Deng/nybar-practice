# 此来源文件的可复现导入

这两个脚本针对 source-manifest.json 记录的 PDF，SHA-256 不符时停止；不能直接用于其他版本。Python 环境需要 pypdf、pypdfium2 和 Pillow。

```sh
python scripts/uworld-import/extract.py '/path/to/2025UWorld MBE QBank.pdf' --work-dir /tmp/nybar-uworld-import
python scripts/uworld-import/parse.py --work-dir /tmp/nybar-uworld-import
```

第一步按页提取原文字、文字位置、嵌入图片，并为表格/多列排版保留无损原页图。图表输出到 `public/uworld-2025/images/`，中间数据保存在指定工作目录。第二步生成 `parsed-questions.json` 和 `parse-audit.json`；不会自动覆盖在用题库或发布。

导入流程：

1. 根据九个书签和 A–D 选项位置识别题块，不按固定页数切题。
2. 保留原题、解析及来源页码；清除残留答题状态、百分比和用时。
3. 通过全文的 Choice/Choices 括注识别三个排除项；存在显式答案时交叉核对。非三项排除或未核定的答案冲突立即停止。
4. NCBE 附录科目使用已经逐题复核的 `appendix-subject-map.json`；不会根据临时关键词自动改分类。
5. 第 5821 页为已经复核的源文标签错误，使用明确答案 D，保留原解析并生成单独说明。其他冲突不得套用该例外。
6. 按科目和正文/附录分组，每组最多 50 题；ID 固定关联原页码。

核对生成结果后，将 parsed-questions.json 替换 `lib/question-bank.json`，将审计记录放入 `data/uworld-2025/`，并校验原 PDF 与 source-manifest.json 的哈希一致，再运行题库检查、学习功能检查和构建。

排除项识别属于从原解析整理答案，不是独立官方答案表或现行法审查。
