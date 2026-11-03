# 航空技术英语考试练习

手机优先的选择题练习网页，按 25 次考试分单元。纯静态网页，进度保存在本机浏览器，支持添加到主屏幕和离线使用。

## 文件说明

| 文件 | 作用 |
|---|---|
| `index.html` | 页面和样式 |
| `app.js` | 出题、判分、错题本等全部逻辑 |
| `data.js` | 题库（由 `build.py` 自动生成，不要手改） |
| `data/vocab.json` | 词汇表：每条 `page`（页码）、`en`、`zh` |
| `data/sentences.json` | AE/AV/AI 句子；`shared` 是三本共用的第 1–30 句 |
| `data/beisong.json` | 背诵N，`"1"` 对应第 1 次考试 |
| `sw.js`、`manifest.webmanifest`、图标 | 离线缓存和“添加到主屏幕” |

## 加新材料

1. 在 `data/` 里对应的 JSON 文件中添加内容（比如在 `beisong.json` 的 `sets` 里加 `"2": [...]`）。
2. 运行 `python build.py`，重新生成 `data.js`。
3. 重新上传到 GitHub（见下面第 3 步），手机上联网打开一次就会更新。

## 部署到 GitHub Pages

> 注意：GitHub Pages 免费版要求仓库公开，题库内容任何人都能看到。

1. 在 GitHub 新建仓库，比如叫 `english-practice`，选 Public。
2. 把这个文件夹里的所有文件上传到仓库（网页上点 “Add file → Upload files”，或用 GitHub Desktop）。
3. 仓库 Settings → Pages → Source 选 “Deploy from a branch”，分支选 `main`、目录选 `/ (root)`，保存。
4. 等一两分钟，网址是 `https://你的用户名.github.io/english-practice/`。
5. 手机浏览器打开这个网址：
   - iPhone（Safari）：点分享按钮 → “添加到主屏幕”
   - 安卓（Chrome）：点右上角菜单 → “添加到主屏幕”

第一次联网打开后，没网也能练。

## 练习规则

- 每题 4 个选项。单词的干扰项优先选拼写相近的词，句子的干扰项优先选用词相近的句子。
- 答错的题本轮稍后会再出一次，并进入错题本；同一题连续答对 2 次算掌握，自动移出错题本。
- 第 7 次起可开关“混入整本词汇”，开启后本次新句子至少占六成，其余从整本词汇里优先出没掌握和常错的词。
- 第 16 次起增加“句子 中→英”。
