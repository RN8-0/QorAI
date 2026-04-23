from pathlib import Path

path = Path(__file__).resolve().parent / 'admin' / 'js' / 'notifications.js'
with open(path, encoding='utf-8') as f:
    content = f.read()

content = content.replace("showToast(", "toast(")
content = content.replace("'success')", "'s')")
content = content.replace("'error')", "'e')")
content = content.replace("'warn')", "'w')")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

remaining = [l.strip() for l in content.split('\n') if 'showToast' in l]
print('Remaining showToast:', remaining)
print('Done')
