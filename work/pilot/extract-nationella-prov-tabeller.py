"""Läs tabeller och rubriker från Skolverkets publicerade provdatumssida."""

from html.parser import HTMLParser
import json
import sys


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.tables = []
        self.headings = []
        self.heading = None

    def handle_starttag(self, tag, attrs):
        if tag == "h2":
            self.heading = []
        if tag == "table":
            self.stack.append(dict(caption=[], rows=[], row=None, cell=None, in_caption=False, spans=False))
        if not self.stack:
            return
        table = self.stack[-1]
        if tag == "caption":
            table["in_caption"] = True
        elif tag == "tr":
            table["row"] = []
        elif tag in ("th", "td"):
            table["cell"] = []
            if any(key in ("rowspan", "colspan") and value != "1" for key, value in attrs):
                table["spans"] = True
        elif tag in ("p", "br"):
            self.handle_data(" ")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == "h2" and self.heading is not None:
            self.headings.append("".join(self.heading))
            self.heading = None
        if not self.stack:
            return
        table = self.stack[-1]
        if tag == "caption":
            table["in_caption"] = False
        elif tag in ("th", "td") and table["row"] is not None and table["cell"] is not None:
            table["row"].append("".join(table["cell"]))
            table["cell"] = None
        elif tag == "tr" and table["row"] is not None:
            table["rows"].append(table["row"])
            table["row"] = None
        elif tag == "table":
            self.tables.append({key: table[key] for key in ("caption", "rows", "spans")})
            self.stack.pop()

    def handle_data(self, data):
        if self.heading is not None:
            self.heading.append(data)
        if self.stack:
            table = self.stack[-1]
            if table["in_caption"]:
                table["caption"].append(data)
            if table["cell"] is not None:
                table["cell"].append(data)


parser = Tables()
parser.feed(sys.stdin.buffer.read().decode("utf-8", errors="strict"))
parser.close()
if parser.stack:
    raise ValueError("Oavslutad tabell")
sys.stdout.buffer.write(json.dumps(dict(headings=parser.headings, tables=parser.tables)).encode("utf-8"))
