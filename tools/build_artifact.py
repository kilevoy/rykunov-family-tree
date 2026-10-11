#!/usr/bin/env python3
"""Склеивает app/ в одну HTML-страницу для встраиваемого просмотра (без внешних файлов).
Запуск: python3 tools/build_artifact.py <выходной.html>
Модули оборачиваются в функции, import/export убираются. Печать и скачивание отключаются флагами."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'app'
out = pathlib.Path(sys.argv[1])
order = [('data.js', 'D'), ('kinship.js', 'K'), ('tree.js', 'T'), ('gedcom.js', 'G')]
ns = {'./data.js': 'D', './kinship.js': 'K', './tree.js': 'T', './gedcom.js': 'G'}

def wrap(src, name):
    names = []
    def exp(m):
        names.append(m.group(2)); return m.group(1)
    src = re.sub(r'^export (?:async )?((?:const|let|function)\s+)([A-Za-z_$][\w$]*)', lambda m: (names.append(m.group(2)) or m.group(0)[len('export '):]), src, flags=re.M)
    def imp(m):
        what, mod = m.group(1).strip(), m.group(2)
        if what.startswith('* as'):
            alias = what.split()[-1]
            return '' if alias == ns[mod] else f'const {alias} = {ns[mod]};'
        return f'const {what} = {ns[mod]};'
    src = re.sub(r"^import\s+(.+?)\s+from\s+'(\./[\w.]+)';?[ \t]*$", imp, src, flags=re.M)
    if re.search(r'^\s*export\b', src, flags=re.M): raise SystemExit(f'необработанный export в {name}')
    return f'const {name} = (() => {{\n{src}\nreturn {{ {", ".join(names)} }};\n}})();'

parts = []
for f, n in order: parts.append(wrap((root / f).read_text(encoding='utf-8'), n))
main = (root / 'main.js').read_text(encoding='utf-8')
main = re.sub(r"^import\s+\*\s+as\s+(\w+)\s+from\s+'\./(\w+)\.js';?$", lambda m: '' if m.group(1) == ns['./'+m.group(2)+'.js'] else f"const {m.group(1)} = {ns['./'+m.group(2)+'.js']};", main, flags=re.M)
main = re.sub(r"^import\s+(\{.+?\})\s+from\s+'(\./[\w.]+)';?$", lambda m: f"const {m.group(1)} = {ns[m.group(2)]};", main, flags=re.M)
if re.search(r'^import ', main, flags=re.M): raise SystemExit('остался import в main.js')
js = '\n'.join(parts) + '\n' + main
js = js.replace('</script', '<\\/script')
css = (root / 'tokens.css').read_text(encoding='utf-8') + '\n' + (root / 'styles.css').read_text(encoding='utf-8')
html = (root / 'index.html').read_text(encoding='utf-8')
body = re.search(r'<body>(.*)</body>', html, flags=re.S).group(1)
body = re.sub(r'\s*<script[^>]*src="main\.js"[^>]*></script>', '', body)
page = f'''<title>Родословное древо</title>
<style>
{css}
</style>
{body}
<script>window.__NOPRINT = true; window.__NODOWNLOAD = true;</script>
<script>
{js}
</script>
'''
out.write_text(page, encoding='utf-8')
print(f'{out}: {len(page)//1024} КБ')
