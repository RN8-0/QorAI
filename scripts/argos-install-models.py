"""
Install Argos Translate language packages needed by the Qor AI scraper.

Languages used by the admin pipeline:
  - Sources:  Turkish (Epey), German (Geizhals)
  - Targets:  English, German, Turkish, Spanish, French, Portuguese, Russian

Argos pivots through English. We install:
  TR <-> EN, DE <-> EN, EN -> {ES, FR, PT, RU}, and the reverse hops we need
  so DE -> TR / TR -> DE still works via the EN pivot at runtime.
"""
import sys
import argostranslate.package
import argostranslate.translate

# (from_code, to_code) pairs. Argos already covers the reverse hops we need
# via the EN pivot at translate() time.
WANTED = [
    ("tr", "en"), ("en", "tr"),
    ("en", "es"), ("en", "fr"),
    ("en", "pt"), ("en", "ru"),
    ("es", "en"), ("fr", "en"),
    ("pt", "en"), ("ru", "en"),
]

print("Refreshing Argos package index...", flush=True)
argostranslate.package.update_package_index()
available = argostranslate.package.get_available_packages()
installed = {(p.from_code, p.to_code) for p in argostranslate.package.get_installed_packages()}

for src, tgt in WANTED:
    if (src, tgt) in installed:
        print(f"[skip] {src}->{tgt} already installed", flush=True)
        continue
    match = next((p for p in available if p.from_code == src and p.to_code == tgt), None)
    if not match:
        print(f"[miss] no package for {src}->{tgt}", flush=True)
        continue
    print(f"[install] {src}->{tgt} ({match.package_version})...", flush=True)
    path = match.download()
    argostranslate.package.install_from_path(path)
    print(f"[done] {src}->{tgt}", flush=True)

print("\nInstalled packages:", flush=True)
for p in sorted(argostranslate.package.get_installed_packages(), key=lambda x: (x.from_code, x.to_code)):
    print(f"  {p.from_code} -> {p.to_code}  (v{p.package_version})", flush=True)
