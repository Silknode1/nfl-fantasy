"""Turn the single-file Vite build into an Artifact page body (the host adds doctype/head/body)."""
import re
import sys

src, dest = sys.argv[1:3]
html = open(src).read()
title = re.search(r"<title>.*?</title>", html, re.S).group(0)
links = "".join(re.findall(r"<link[^>]+fonts\.(?:googleapis|gstatic)[^>]*>", html))
styles = "".join(re.findall(r"<style[^>]*>.*?</style>", html, re.S))
scripts = "".join(re.findall(r"<script[^>]*>.*?</script>", html, re.S))
open(dest, "w").write(f"{title}\n{links}\n{styles}\n<div id=\"root\"></div>\n{scripts}\n")
print(f"wrote {dest} ({len(open(dest).read()) / 1e6:.2f} MB)")
