"""把 data/ 下的 JSON 题库合并成网页使用的 data.js。
新增或修改题库后运行一次：python build.py
"""
import json, pathlib, time

root = pathlib.Path(__file__).parent
d = root / "data"
bundle = {
    "vocab": json.loads((d / "vocab.json").read_text(encoding="utf-8"))["words"],
    "sentences": json.loads((d / "sentences.json").read_text(encoding="utf-8")),
    "beisong": json.loads((d / "beisong.json").read_text(encoding="utf-8"))["sets"],
    "weekly": json.loads((d / "weekly.json").read_text(encoding="utf-8"))["weeks"] if (d / "weekly.json").exists() else [],
    "version": time.strftime("%Y%m%d%H%M"),
}
for k in ("note",):
    bundle["sentences"].pop(k, None)
js = "window.DATA = " + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + ";\n"
(root / "data.js").write_text(js, encoding="utf-8")

# 让离线缓存随数据版本更新
sw = root / "sw.js"
text = sw.read_text(encoding="utf-8")
import re
text = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{bundle['version']}';", text)
sw.write_text(text, encoding="utf-8")
print("data.js 已生成：", len(bundle["vocab"]), "个单词，版本", bundle["version"])
