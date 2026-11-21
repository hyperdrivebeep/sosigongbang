"""Make a self-contained, editable Korean card deck using only the standard library."""
import argparse
import json
import re
import uuid
from pathlib import Path

SEED = re.compile(r'(<script type="application/json" id="seed">).*?(</script>)', re.S)


def make_editor(data, target):
    if data.get("version", 1) != 1 or not isinstance(data.get("cards"), list) or not 1 <= len(data["cards"]) <= 20:
        raise ValueError("카드 1~20장으로 구성해 주세요.")
    for card in data["cards"]:
        if not isinstance(card, dict) or not isinstance(card.get("title"), str) or not card["title"].strip():
            raise ValueError("각 장에 제목이 필요합니다.")
        if len(card["title"]) > 120 or not isinstance(card.get("body", ""), str) or len(card.get("body", "")) > 600:
            raise ValueError("제목 120자, 본문 600자 이내로 나누어 주세요.")
    source = Path(__file__).resolve().parents[1] / "assets" / "studio.html"
    template = source.read_text(encoding="utf-8")
    payload = json.dumps({**data, "instance": uuid.uuid4().hex}, ensure_ascii=False).replace("<", r"\u003c").replace(">", r"\u003e")
    html, count = SEED.subn(lambda m: m[1] + payload + m[2], template, count=1)
    if count != 1:
        raise ValueError("편집기 템플릿을 확인해 주세요.")
    with target.open("x", encoding="utf-8") as out:
        out.write(html)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("draft", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    make_editor(json.loads(args.draft.read_text(encoding="utf-8-sig")), args.output)

