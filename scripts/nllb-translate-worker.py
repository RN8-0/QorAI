"""
Qor AI local translation worker — NLLB-200 edition (GPU-accelerated).

Drop-in replacement for scripts/argos-translate-worker.py. Listens on the
same host:port (127.0.0.1:8797) and speaks the same JSON contract:

  POST /translate   { from, texts: [...], to: [tr,en,de,es,fr,pt,ru] }
                 -> { provider, model, from, count, to, elapsedMs,
                      translations: { "<src>": { en: "...", de: "...", ... }, ... } }

  GET  /health    -> { ok, model, modelReady, ... }
  GET  /status    -> live job state

Backend: facebook/nllb-200-distilled-600M (Apache-2.0, 200 languages) running
on CTranslate2 with the CUDA execution provider. Single model handles every
TR -> {EN,DE,ES,FR,PT,RU} pair in one forward pass per target language with
proper grammar, no Argos-style compound corruption ("Audioli", "minutesda",
"Smart Hour"), and no per-language model swap.

First-run setup (one-time, ~25 min download, ~700 MB on disk):

    pip install ctranslate2 sentencepiece huggingface_hub
    huggingface-cli download entai2965/nllb-200-distilled-600M-ctranslate2 \
        --local-dir scripts/nllb-ct2 --local-dir-use-symlinks=False

Run:
    python scripts/nllb-translate-worker.py
    # or via npm: see package.json `translate:worker:nllb`
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
import http.server
import socketserver
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Windows: register CUDA DLLs on PATH before importing ctranslate2.
if sys.platform == "win32":
    _venv_root = Path(sys.executable).parent.parent
    _nvidia_root = _venv_root / "Lib" / "site-packages" / "nvidia"
    if _nvidia_root.is_dir():
        for sub in _nvidia_root.iterdir():
            bin_dir = sub / "bin"
            if bin_dir.is_dir() and hasattr(os, "add_dll_directory"):
                try: os.add_dll_directory(str(bin_dir))
                except (OSError, FileNotFoundError): pass
        os.environ["PATH"] = os.pathsep.join(
            str(p / "bin") for p in _nvidia_root.iterdir() if (p / "bin").is_dir()
        ) + os.pathsep + os.environ.get("PATH", "")

import ctranslate2                  # noqa: E402
import sentencepiece as spm         # noqa: E402

# ─── Configuration ───────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get("QORAI_TRANSLATE_PORT", "8797"))
HOST = os.environ.get("QORAI_TRANSLATE_HOST", "127.0.0.1")
MODEL_DIR = Path(os.environ.get(
    "QORAI_NLLB_MODEL_DIR",
    str(HERE / "nllb-ct2"),
))
CACHE_FILE = HERE / ".nllb-translate-cache.json"

FORCE_CPU = os.environ.get("QORAI_TRANSLATE_FORCE_CPU", "0") == "1"
_cuda_count = ctranslate2.get_cuda_device_count()
if _cuda_count > 0 and not FORCE_CPU:
    DEVICE = "cuda"
elif FORCE_CPU:
    DEVICE = "cpu"
else:
    raise SystemExit(
        "[worker] No CUDA device detected. Translation requires a GPU. "
        "Install CUDA + cudnn + cublas for ctranslate2, or set "
        "QORAI_TRANSLATE_FORCE_CPU=1 to allow CPU fallback."
    )

# int8_float16 cuts VRAM in half (~700 MB) with negligible quality loss on
# a Turing-class card. The distilled-600M model still fits comfortably on
# a 4 GB GTX 1650 even with a 64-sentence batch in flight.
COMPUTE_TYPE = "int8_float16" if DEVICE == "cuda" else "int8"
BATCH_SIZE = int(os.environ.get("QORAI_TRANSLATE_BATCH", "64"))
# beam=4 gives near-best quality on NLLB-distilled-600M without OOMing at
# batch 64 on a 4 GB GPU. Bump to 5 if VRAM allows; drop to 2 if you OOM.
BEAM_SIZE = int(os.environ.get("QORAI_TRANSLATE_BEAM", "4"))
MAX_DECODING_LENGTH = int(os.environ.get("QORAI_TRANSLATE_MAXLEN", "256"))
# Per-lang thread pool size. CT2 releases the GIL during translate_batch
# so multiple Python threads overlap on the GPU.
TRANSLATE_THREADS = int(os.environ.get("QORAI_TRANSLATE_THREADS", "6"))

MODEL_LABEL = f"nllb-200-distilled-600M/{DEVICE}/{COMPUTE_TYPE}"

# NLLB language codes (Flores-200 codes).
# Scope cut (2026-05-29): TR / EN / DE only — DE/UK/TR markets.
LANG_CODE = {
    "tr": "tur_Latn",
    "en": "eng_Latn",
    "de": "deu_Latn",
}
LANGS = set(LANG_CODE)

# ─── Override dictionary ──────────────────────────────────────────────────
# Short Turkish spec primitives where NLLB-distilled-600M lacks context and
# invents sentences ("Var" → "I got it", "Fan" → "1 fanatic", "Raylı" → "It's
# rainy"). For these we ship a curated lookup that bypasses the model. Keys
# are lowercased + stripped; format: { tr_lower: { en, de, es, fr, pt, ru } }.
# Only put entries here where NLLB is OBJECTIVELY WRONG, not where it just
# differs in style — NLLB handles compounds and full phrases correctly.
OVERRIDES: Dict[str, Dict[str, str]] = {
    # Yes/No spec values
    "var":      {"en":"Yes",      "de":"Ja",       "es":"Sí",        "fr":"Oui",      "pt":"Sim",       "ru":"Да"},
    "yok":      {"en":"No",       "de":"Nein",     "es":"No",        "fr":"Non",      "pt":"Não",       "ru":"Нет"},
    "evet":     {"en":"Yes",      "de":"Ja",       "es":"Sí",        "fr":"Oui",      "pt":"Sim",       "ru":"Да"},
    "hayır":    {"en":"No",       "de":"Nein",     "es":"No",        "fr":"Non",      "pt":"Não",       "ru":"Нет"},
    "hayir":    {"en":"No",       "de":"Nein",     "es":"No",        "fr":"Non",      "pt":"Não",       "ru":"Нет"},
    # Quantity units (the "Adet" word means "piece/count" not "tradition")
    "adet":     {"en":"",         "de":"",         "es":"",          "fr":"",         "pt":"",          "ru":""},
    "adedi":    {"en":"Count",    "de":"Anzahl",   "es":"Cantidad",  "fr":"Nombre",   "pt":"Quantidade","ru":"Количество"},
    "tane":     {"en":"",         "de":"",         "es":"",          "fr":"",         "pt":"",          "ru":""},
    "çift":     {"en":"Pair",     "de":"Paar",     "es":"Par",       "fr":"Paire",    "pt":"Par",       "ru":"Пара"},
    "tek":      {"en":"Single",   "de":"Einzel",   "es":"Único",     "fr":"Simple",   "pt":"Único",     "ru":"Одиночный"},
    # Common product-type words (NLLB swaps them around)
    "dizüstü":  {"en":"Laptop",   "de":"Laptop",   "es":"Portátil",  "fr":"Ordinateur portable", "pt":"Notebook",  "ru":"Ноутбук"},
    "dizustu":  {"en":"Laptop",   "de":"Laptop",   "es":"Portátil",  "fr":"Ordinateur portable", "pt":"Notebook",  "ru":"Ноутбук"},
    "masaüstü": {"en":"Desktop",  "de":"Desktop",  "es":"Sobremesa", "fr":"Bureau",   "pt":"Desktop",   "ru":"Настольный"},
    "masaustu": {"en":"Desktop",  "de":"Desktop",  "es":"Sobremesa", "fr":"Bureau",   "pt":"Desktop",   "ru":"Настольный"},
    "mobil":    {"en":"Mobile",   "de":"Mobil",    "es":"Móvil",     "fr":"Mobile",   "pt":"Móvel",     "ru":"Мобильный"},
    "tablet":   {"en":"Tablet",   "de":"Tablet",   "es":"Tablet",    "fr":"Tablette", "pt":"Tablet",    "ru":"Планшет"},
    "telefon":  {"en":"Phone",    "de":"Telefon",  "es":"Teléfono",  "fr":"Téléphone","pt":"Telefone",  "ru":"Телефон"},
    # Hardware terms NLLB confuses with sentences / wrong senses
    "fan":      {"en":"Fan",      "de":"Lüfter",   "es":"Ventilador","fr":"Ventilateur","pt":"Ventilador","ru":"Вентилятор"},
    "fanlı":    {"en":"Fan",      "de":"Lüfter",   "es":"Ventilador","fr":"Ventilateur","pt":"Ventilador","ru":"Вентилятор"},
    "fanli":    {"en":"Fan",      "de":"Lüfter",   "es":"Ventilador","fr":"Ventilateur","pt":"Ventilador","ru":"Вентилятор"},
    "fansız":   {"en":"Fanless",  "de":"Lüfterlos","es":"Sin Ventilador","fr":"Sans Ventilateur","pt":"Sem Ventilador","ru":"Без вентилятора"},
    "fansiz":   {"en":"Fanless",  "de":"Lüfterlos","es":"Sin Ventilador","fr":"Sans Ventilateur","pt":"Sem Ventilador","ru":"Без вентилятора"},
    "raylı":    {"en":"Rail-mounted","de":"Schienenmontiert","es":"Sobre Rieles","fr":"Sur Rail","pt":"Sobre Trilho","ru":"На рельсах"},
    "rayli":    {"en":"Rail-mounted","de":"Schienenmontiert","es":"Sobre Rieles","fr":"Sur Rail","pt":"Sobre Trilho","ru":"На рельсах"},
    # Power/electrical primitives NLLB prefixes with "The"
    "güç":      {"en":"Power",    "de":"Leistung", "es":"Potencia",  "fr":"Puissance","pt":"Potência",  "ru":"Мощность"},
    "guc":      {"en":"Power",    "de":"Leistung", "es":"Potencia",  "fr":"Puissance","pt":"Potência",  "ru":"Мощность"},
    "akım":     {"en":"Current",  "de":"Strom",    "es":"Corriente", "fr":"Courant",  "pt":"Corrente",  "ru":"Ток"},
    "akim":     {"en":"Current",  "de":"Strom",    "es":"Corriente", "fr":"Courant",  "pt":"Corrente",  "ru":"Ток"},
    "voltaj":   {"en":"Voltage",  "de":"Spannung", "es":"Voltaje",   "fr":"Tension",  "pt":"Tensão",    "ru":"Напряжение"},
    "frekans":  {"en":"Frequency","de":"Frequenz", "es":"Frecuencia","fr":"Fréquence","pt":"Frequência","ru":"Частота"},
    # Common 1-word spec keys
    "türü":     {"en":"Type",     "de":"Typ",      "es":"Tipo",      "fr":"Type",     "pt":"Tipo",      "ru":"Тип"},
    "turu":     {"en":"Type",     "de":"Typ",      "es":"Tipo",      "fr":"Type",     "pt":"Tipo",      "ru":"Тип"},
    "tipi":     {"en":"Type",     "de":"Typ",      "es":"Tipo",      "fr":"Type",     "pt":"Tipo",      "ru":"Тип"},
    "modeli":   {"en":"Model",    "de":"Modell",   "es":"Modelo",    "fr":"Modèle",   "pt":"Modelo",    "ru":"Модель"},
    "model":    {"en":"Model",    "de":"Modell",   "es":"Modelo",    "fr":"Modèle",   "pt":"Modelo",    "ru":"Модель"},
    "serisi":   {"en":"Series",   "de":"Serie",    "es":"Serie",     "fr":"Série",    "pt":"Série",     "ru":"Серия"},
    "ailesi":   {"en":"Family",   "de":"Familie",  "es":"Familia",   "fr":"Famille",  "pt":"Família",   "ru":"Семейство"},
    "markası":  {"en":"Brand",    "de":"Marke",    "es":"Marca",     "fr":"Marque",   "pt":"Marca",     "ru":"Бренд"},
    "markasi":  {"en":"Brand",    "de":"Marke",    "es":"Marca",     "fr":"Marque",   "pt":"Marca",     "ru":"Бренд"},
    "üreticisi":{"en":"Manufacturer","de":"Hersteller","es":"Fabricante","fr":"Fabricant","pt":"Fabricante","ru":"Производитель"},
    "ureticisi":{"en":"Manufacturer","de":"Hersteller","es":"Fabricante","fr":"Fabricant","pt":"Fabricante","ru":"Производитель"},
    "sürümü":   {"en":"Version",  "de":"Version",  "es":"Versión",   "fr":"Version",  "pt":"Versão",    "ru":"Версия"},
    "surumu":   {"en":"Version",  "de":"Version",  "es":"Versión",   "fr":"Version",  "pt":"Versão",    "ru":"Версия"},
    "versiyonu":{"en":"Version",  "de":"Version",  "es":"Versión",   "fr":"Version",  "pt":"Versão",    "ru":"Версия"},
    "boyutu":   {"en":"Size",     "de":"Größe",    "es":"Tamaño",    "fr":"Taille",   "pt":"Tamanho",   "ru":"Размер"},
    "kapasitesi":{"en":"Capacity","de":"Kapazität","es":"Capacidad", "fr":"Capacité", "pt":"Capacidade","ru":"Емкость"},
    "ağırlığı": {"en":"Weight",   "de":"Gewicht",  "es":"Peso",      "fr":"Poids",    "pt":"Peso",      "ru":"Вес"},
    "agirligi": {"en":"Weight",   "de":"Gewicht",  "es":"Peso",      "fr":"Poids",    "pt":"Peso",      "ru":"Вес"},
    "ağırlık":  {"en":"Weight",   "de":"Gewicht",  "es":"Peso",      "fr":"Poids",    "pt":"Peso",      "ru":"Вес"},
    "agirlik":  {"en":"Weight",   "de":"Gewicht",  "es":"Peso",      "fr":"Poids",    "pt":"Peso",      "ru":"Вес"},
    "genişlik": {"en":"Width",    "de":"Breite",   "es":"Ancho",     "fr":"Largeur",  "pt":"Largura",   "ru":"Ширина"},
    "genislik": {"en":"Width",    "de":"Breite",   "es":"Ancho",     "fr":"Largeur",  "pt":"Largura",   "ru":"Ширина"},
    "yükseklik":{"en":"Height",   "de":"Höhe",     "es":"Altura",    "fr":"Hauteur",  "pt":"Altura",    "ru":"Высота"},
    "yukseklik":{"en":"Height",   "de":"Höhe",     "es":"Altura",    "fr":"Hauteur",  "pt":"Altura",    "ru":"Высота"},
    "derinlik": {"en":"Depth",    "de":"Tiefe",    "es":"Profundidad","fr":"Profondeur","pt":"Profundidade","ru":"Глубина"},
    "kalınlık": {"en":"Thickness","de":"Dicke",    "es":"Grosor",    "fr":"Épaisseur","pt":"Espessura", "ru":"Толщина"},
    "kalinlik": {"en":"Thickness","de":"Dicke",    "es":"Grosor",    "fr":"Épaisseur","pt":"Espessura", "ru":"Толщина"},
    "çap":      {"en":"Diameter", "de":"Durchmesser","es":"Diámetro","fr":"Diamètre", "pt":"Diâmetro",  "ru":"Диаметр"},
    "cap":      {"en":"Diameter", "de":"Durchmesser","es":"Diámetro","fr":"Diamètre", "pt":"Diâmetro",  "ru":"Диаметр"},
    "renk":     {"en":"Color",    "de":"Farbe",    "es":"Color",     "fr":"Couleur",  "pt":"Cor",       "ru":"Цвет"},
    "renkler":  {"en":"Colors",   "de":"Farben",   "es":"Colores",   "fr":"Couleurs", "pt":"Cores",     "ru":"Цвета"},
    "oyun":     {"en":"Gaming",   "de":"Gaming",   "es":"Gaming",    "fr":"Jeu",      "pt":"Jogos",     "ru":"Игры"},
    "müzik":    {"en":"Music",    "de":"Musik",    "es":"Música",    "fr":"Musique",  "pt":"Música",    "ru":"Музыка"},
    "muzik":    {"en":"Music",    "de":"Musik",    "es":"Música",    "fr":"Musique",  "pt":"Música",    "ru":"Музыка"},
    "şarj":     {"en":"Charging", "de":"Aufladung","es":"Carga",     "fr":"Charge",   "pt":"Carregamento","ru":"Зарядка"},
    "sarj":     {"en":"Charging", "de":"Aufladung","es":"Carga",     "fr":"Charge",   "pt":"Carregamento","ru":"Зарядка"},
    "kablolu":  {"en":"Wired",    "de":"Kabelgebunden","es":"Con cable","fr":"Filaire","pt":"Com fio",   "ru":"Проводной"},
    "kablosuz": {"en":"Wireless", "de":"Drahtlos", "es":"Inalámbrico","fr":"Sans fil","pt":"Sem fio",   "ru":"Беспроводной"},
    "yazılım":  {"en":"Software", "de":"Software", "es":"Software",  "fr":"Logiciel", "pt":"Software",  "ru":"Программное обеспечение"},
    "yazilim":  {"en":"Software", "de":"Software", "es":"Software",  "fr":"Logiciel", "pt":"Software",  "ru":"Программное обеспечение"},
    "donanım":  {"en":"Hardware", "de":"Hardware", "es":"Hardware",  "fr":"Matériel", "pt":"Hardware",  "ru":"Оборудование"},
    "donanim":  {"en":"Hardware", "de":"Hardware", "es":"Hardware",  "fr":"Matériel", "pt":"Hardware",  "ru":"Оборудование"},
    "soğutma":  {"en":"Cooling",  "de":"Kühlung",  "es":"Refrigeración","fr":"Refroidissement","pt":"Refrigeração","ru":"Охлаждение"},
    "sogutma":  {"en":"Cooling",  "de":"Kühlung",  "es":"Refrigeración","fr":"Refroidissement","pt":"Refrigeração","ru":"Охлаждение"},
    "soğutucu": {"en":"Cooler",   "de":"Kühler",   "es":"Refrigerador","fr":"Refroidisseur","pt":"Refrigerador","ru":"Охладитель"},
    "sogutucu": {"en":"Cooler",   "de":"Kühler",   "es":"Refrigerador","fr":"Refroidisseur","pt":"Refrigerador","ru":"Охладитель"},
    "klavye":   {"en":"Keyboard", "de":"Tastatur", "es":"Teclado",   "fr":"Clavier",  "pt":"Teclado",   "ru":"Клавиатура"},
    "fare":     {"en":"Mouse",    "de":"Maus",     "es":"Ratón",     "fr":"Souris",   "pt":"Mouse",     "ru":"Мышь"},
    "kulaklık": {"en":"Headphones","de":"Kopfhörer","es":"Auriculares","fr":"Casque", "pt":"Fones",     "ru":"Наушники"},
    "kulaklik": {"en":"Headphones","de":"Kopfhörer","es":"Auriculares","fr":"Casque", "pt":"Fones",     "ru":"Наушники"},
    "hoparlör": {"en":"Speaker",  "de":"Lautsprecher","es":"Altavoz","fr":"Haut-parleur","pt":"Alto-falante","ru":"Динамик"},
    "hoparlor": {"en":"Speaker",  "de":"Lautsprecher","es":"Altavoz","fr":"Haut-parleur","pt":"Alto-falante","ru":"Динамик"},
    "mikrofon": {"en":"Microphone","de":"Mikrofon","es":"Micrófono", "fr":"Microphone","pt":"Microfone","ru":"Микрофон"},
    "kamera":   {"en":"Camera",   "de":"Kamera",   "es":"Cámara",    "fr":"Caméra",   "pt":"Câmera",    "ru":"Камера"},
    "ekran":    {"en":"Display",  "de":"Display",  "es":"Pantalla",  "fr":"Écran",    "pt":"Tela",      "ru":"Дисплей"},
    "pil":      {"en":"Battery",  "de":"Akku",     "es":"Batería",   "fr":"Batterie", "pt":"Bateria",   "ru":"Аккумулятор"},
    "batarya":  {"en":"Battery",  "de":"Akku",     "es":"Batería",   "fr":"Batterie", "pt":"Bateria",   "ru":"Аккумулятор"},
    "bellek":   {"en":"Memory",   "de":"Speicher", "es":"Memoria",   "fr":"Mémoire",  "pt":"Memória",   "ru":"Память"},
    "işlemci":  {"en":"Processor","de":"Prozessor","es":"Procesador","fr":"Processeur","pt":"Processador","ru":"Процессор"},
    "islemci":  {"en":"Processor","de":"Prozessor","es":"Procesador","fr":"Processeur","pt":"Processador","ru":"Процессор"},
    # Common colors (single-word, NLLB adds article)
    "yeşil":    {"en":"Green",    "de":"Grün",     "es":"Verde",     "fr":"Vert",     "pt":"Verde",     "ru":"Зелёный"},
    "yesil":    {"en":"Green",    "de":"Grün",     "es":"Verde",     "fr":"Vert",     "pt":"Verde",     "ru":"Зелёный"},
    "kırmızı":  {"en":"Red",      "de":"Rot",      "es":"Rojo",      "fr":"Rouge",    "pt":"Vermelho",  "ru":"Красный"},
    "kirmizi":  {"en":"Red",      "de":"Rot",      "es":"Rojo",      "fr":"Rouge",    "pt":"Vermelho",  "ru":"Красный"},
    "mavi":     {"en":"Blue",     "de":"Blau",     "es":"Azul",      "fr":"Bleu",     "pt":"Azul",      "ru":"Синий"},
    "siyah":    {"en":"Black",    "de":"Schwarz",  "es":"Negro",     "fr":"Noir",     "pt":"Preto",     "ru":"Чёрный"},
    "beyaz":    {"en":"White",    "de":"Weiß",     "es":"Blanco",    "fr":"Blanc",    "pt":"Branco",    "ru":"Белый"},
    "sarı":     {"en":"Yellow",   "de":"Gelb",     "es":"Amarillo",  "fr":"Jaune",    "pt":"Amarelo",   "ru":"Жёлтый"},
    "sari":     {"en":"Yellow",   "de":"Gelb",     "es":"Amarillo",  "fr":"Jaune",    "pt":"Amarelo",   "ru":"Жёлтый"},
    "gri":      {"en":"Gray",     "de":"Grau",     "es":"Gris",      "fr":"Gris",     "pt":"Cinza",     "ru":"Серый"},
    "mor":      {"en":"Purple",   "de":"Violett",  "es":"Morado",    "fr":"Violet",   "pt":"Roxo",      "ru":"Фиолетовый"},
    "pembe":    {"en":"Pink",     "de":"Pink",     "es":"Rosa",      "fr":"Rose",     "pt":"Rosa",      "ru":"Розовый"},
    "turuncu":  {"en":"Orange",   "de":"Orange",   "es":"Naranja",   "fr":"Orange",   "pt":"Laranja",   "ru":"Оранжевый"},
    "kahverengi":{"en":"Brown",   "de":"Braun",    "es":"Marrón",    "fr":"Marron",   "pt":"Marrom",    "ru":"Коричневый"},
    "altın":    {"en":"Gold",     "de":"Gold",     "es":"Oro",       "fr":"Or",       "pt":"Dourado",   "ru":"Золотой"},
    "altin":    {"en":"Gold",     "de":"Gold",     "es":"Oro",       "fr":"Or",       "pt":"Dourado",   "ru":"Золотой"},
    "gümüş":    {"en":"Silver",   "de":"Silber",   "es":"Plata",     "fr":"Argent",   "pt":"Prata",     "ru":"Серебристый"},
    "gumus":    {"en":"Silver",   "de":"Silber",   "es":"Plata",     "fr":"Argent",   "pt":"Prata",     "ru":"Серебристый"},
    "lacivert": {"en":"Navy Blue","de":"Marineblau","es":"Azul Marino","fr":"Bleu Marine","pt":"Azul Marinho","ru":"Тёмно-синий"},
    "bakır":    {"en":"Copper",   "de":"Kupfer",   "es":"Cobre",     "fr":"Cuivre",   "pt":"Cobre",     "ru":"Медь"},
    "bakir":    {"en":"Copper",   "de":"Kupfer",   "es":"Cobre",     "fr":"Cuivre",   "pt":"Cobre",     "ru":"Медь"},
    # Body materials
    "alüminyum":{"en":"Aluminum", "de":"Aluminium","es":"Aluminio",  "fr":"Aluminium","pt":"Alumínio",  "ru":"Алюминий"},
    "aluminyum":{"en":"Aluminum", "de":"Aluminium","es":"Aluminio",  "fr":"Aluminium","pt":"Alumínio",  "ru":"Алюминий"},
    "titanyum": {"en":"Titanium", "de":"Titan",    "es":"Titanio",   "fr":"Titane",   "pt":"Titânio",   "ru":"Титан"},
    "plastik":  {"en":"Plastic",  "de":"Kunststoff","es":"Plástico", "fr":"Plastique","pt":"Plástico",  "ru":"Пластик"},
    "metal":    {"en":"Metal",    "de":"Metall",   "es":"Metal",     "fr":"Métal",    "pt":"Metal",     "ru":"Металл"},
    "cam":      {"en":"Glass",    "de":"Glas",     "es":"Vidrio",    "fr":"Verre",    "pt":"Vidro",     "ru":"Стекло"},
    "deri":     {"en":"Leather",  "de":"Leder",    "es":"Cuero",     "fr":"Cuir",     "pt":"Couro",     "ru":"Кожа"},
    "naylon":   {"en":"Nylon",    "de":"Nylon",    "es":"Nailon",    "fr":"Nylon",    "pt":"Nylon",     "ru":"Нейлон"},
    "silikon":  {"en":"Silicone", "de":"Silikon",  "es":"Silicona",  "fr":"Silicone", "pt":"Silicone",  "ru":"Силикон"},
    "kauçuk":   {"en":"Rubber",   "de":"Gummi",    "es":"Goma",      "fr":"Caoutchouc","pt":"Borracha","ru":"Резина"},
    "kaucuk":   {"en":"Rubber",   "de":"Gummi",    "es":"Goma",      "fr":"Caoutchouc","pt":"Borracha","ru":"Резина"},
}

# Add a couple of common phrasings that NLLB also struggles with.
OVERRIDES.update({
    "kasa türü":  {"en":"Case Type",  "de":"Gehäusetyp","es":"Tipo de Carcasa","fr":"Type de Boîtier","pt":"Tipo de Gabinete","ru":"Тип Корпуса"},
    "kasa turu":  {"en":"Case Type",  "de":"Gehäusetyp","es":"Tipo de Carcasa","fr":"Type de Boîtier","pt":"Tipo de Gabinete","ru":"Тип Корпуса"},
    "kasa tipi":  {"en":"Case Type",  "de":"Gehäusetyp","es":"Tipo de Carcasa","fr":"Type de Boîtier","pt":"Tipo de Gabinete","ru":"Тип Корпуса"},
})

# ─── Round 2 overrides: real Apple Watch test on 2026-05-29 ──────────────
# Single-word / compound primitives that NLLB-600M consistently butchers
# across multiple languages. Catalogued from a full 6-lang dump of an Apple
# Watch Series 11 detail page (≈242 atoms) where the same word produced
# wrong output simultaneously in FR/DE/ES/PT/RU.
OVERRIDES.update({
    # Touch / display
    "dokunmatik":          {"en":"Touchscreen","de":"Touchscreen","es":"Pantalla táctil","fr":"Écran tactile","pt":"Touchscreen","ru":"Сенсорный экран"},
    "her zaman açık":      {"en":"Always-On","de":"Always-On","es":"Always-On","fr":"Always-On","pt":"Always-On","ru":"Always-On"},
    "her zaman acik":      {"en":"Always-On","de":"Always-On","es":"Always-On","fr":"Always-On","pt":"Always-On","ru":"Always-On"},
    "always-on":           {"en":"Always-On","de":"Always-On","es":"Always-On","fr":"Always-On","pt":"Always-On","ru":"Always-On"},
    "çizilmeye dayanıklı": {"en":"Scratch-resistant","de":"Kratzfest","es":"Resistente a rayones","fr":"Résistant aux rayures","pt":"Resistente a riscos","ru":"Устойчивый к царапинам"},
    "cizilmeye dayanikli": {"en":"Scratch-resistant","de":"Kratzfest","es":"Resistente a rayones","fr":"Résistant aux rayures","pt":"Resistente a riscos","ru":"Устойчивый к царапинам"},
    "geniş açılı":         {"en":"Wide angle","de":"Weitwinkel","es":"Gran angular","fr":"Grand angle","pt":"Grande angular","ru":"Широкоугольный"},
    "genis acili":         {"en":"Wide angle","de":"Weitwinkel","es":"Gran angular","fr":"Grand angle","pt":"Grande angular","ru":"Широкоугольный"},
    "güçlendirilmiş cam":  {"en":"Reinforced glass","de":"Verstärktes Glas","es":"Vidrio reforzado","fr":"Verre renforcé","pt":"Vidro reforçado","ru":"Усиленное стекло"},
    "guclendirilmis cam":  {"en":"Reinforced glass","de":"Verstärktes Glas","es":"Vidrio reforzado","fr":"Verre renforcé","pt":"Vidro reforçado","ru":"Усиленное стекло"},
    "parlaklık ayarı":     {"en":"Brightness adjustment","de":"Helligkeitseinstellung","es":"Ajuste de brillo","fr":"Réglage de luminosité","pt":"Ajuste de brilho","ru":"Регулировка яркости"},
    "parlaklik ayari":     {"en":"Brightness adjustment","de":"Helligkeitseinstellung","es":"Ajuste de brillo","fr":"Réglage de luminosité","pt":"Ajuste de brilho","ru":"Регулировка яркости"},
    "retina ekran":        {"en":"Retina display","de":"Retina-Display","es":"Pantalla Retina","fr":"Écran Retina","pt":"Tela Retina","ru":"Retina-дисплей"},
    "renkli":              {"en":"Color","de":"Farbig","es":"En color","fr":"Couleur","pt":"Colorido","ru":"Цветной"},
    "kare":                {"en":"Square","de":"Quadratisch","es":"Cuadrado","fr":"Carré","pt":"Quadrado","ru":"Квадратный"},
    "dikdörtgen":          {"en":"Rectangular","de":"Rechteckig","es":"Rectangular","fr":"Rectangulaire","pt":"Retangular","ru":"Прямоугольный"},
    "dikdortgen":          {"en":"Rectangular","de":"Rechteckig","es":"Rectangular","fr":"Rectangulaire","pt":"Retangular","ru":"Прямоугольный"},
    "yuvarlak":            {"en":"Round","de":"Rund","es":"Redondo","fr":"Rond","pt":"Redondo","ru":"Круглый"},
    # Chipset / processor
    "yonga seti":          {"en":"Chipset","de":"Chipsatz","es":"Chipset","fr":"Chipset","pt":"Chipset","ru":"Чипсет"},
    "yonga":               {"en":"Chip","de":"Chip","es":"Chip","fr":"Puce","pt":"Chip","ru":"Чип"},
    "çekirdek":            {"en":"Core","de":"Kern","es":"Núcleo","fr":"Cœur","pt":"Núcleo","ru":"Ядро"},
    "cekirdek":            {"en":"Core","de":"Kern","es":"Núcleo","fr":"Cœur","pt":"Núcleo","ru":"Ядро"},
    "mimari":              {"en":"Architecture","de":"Architektur","es":"Arquitectura","fr":"Architecture","pt":"Arquitetura","ru":"Архитектура"},
    "grafik işlemci":      {"en":"GPU","de":"GPU","es":"GPU","fr":"GPU","pt":"GPU","ru":"GPU"},
    "grafik islemci":      {"en":"GPU","de":"GPU","es":"GPU","fr":"GPU","pt":"GPU","ru":"GPU"},
    "yapay zeka işlemci":  {"en":"AI Processor (NPU)","de":"KI-Prozessor (NPU)","es":"Procesador IA (NPU)","fr":"Processeur IA (NPU)","pt":"Processador de IA (NPU)","ru":"ИИ-процессор (NPU)"},
    "yapay zeka islemci":  {"en":"AI Processor (NPU)","de":"KI-Prozessor (NPU)","es":"Procesador IA (NPU)","fr":"Processeur IA (NPU)","pt":"Processador de IA (NPU)","ru":"ИИ-процессор (NPU)"},
    # Camera / phone / audio
    "vibrasyon":           {"en":"Vibration","de":"Vibration","es":"Vibración","fr":"Vibration","pt":"Vibração","ru":"Вибрация"},
    "titreşim":            {"en":"Vibration","de":"Vibration","es":"Vibración","fr":"Vibration","pt":"Vibração","ru":"Вибрация"},
    "titresim":            {"en":"Vibration","de":"Vibration","es":"Vibración","fr":"Vibration","pt":"Vibração","ru":"Вибрация"},
    "telefon görüşmesi":   {"en":"Phone calls","de":"Telefonanrufe","es":"Llamadas telefónicas","fr":"Appels téléphoniques","pt":"Chamadas telefônicas","ru":"Телефонные звонки"},
    "telefon gorusmesi":   {"en":"Phone calls","de":"Telefonanrufe","es":"Llamadas telefónicas","fr":"Appels téléphoniques","pt":"Chamadas telefônicas","ru":"Телефонные звонки"},
    "bluetooth üzerinden telefon üzerinden":
                            {"en":"Via phone with Bluetooth","de":"Über das Telefon via Bluetooth","es":"A través del teléfono por Bluetooth","fr":"Via le téléphone en Bluetooth","pt":"Pelo telefone via Bluetooth","ru":"Через телефон по Bluetooth"},
    # Resistance / waterproofing
    "5 atm":               {"en":"5 ATM","de":"5 ATM","es":"5 ATM","fr":"5 ATM","pt":"5 ATM","ru":"5 АТМ"},
    "10 atm":              {"en":"10 ATM","de":"10 ATM","es":"10 ATM","fr":"10 ATM","pt":"10 ATM","ru":"10 АТМ"},
    "3 atm":               {"en":"3 ATM","de":"3 ATM","es":"3 ATM","fr":"3 ATM","pt":"3 ATM","ru":"3 АТМ"},
    "ip68":                {"en":"IP68","de":"IP68","es":"IP68","fr":"IP68","pt":"IP68","ru":"IP68"},
    "ip67":                {"en":"IP67","de":"IP67","es":"IP67","fr":"IP67","pt":"IP67","ru":"IP67"},
    "ip6x":                {"en":"IP6X","de":"IP6X","es":"IP6X","fr":"IP6X","pt":"IP6X","ru":"IP6X"},
    "ip69":                {"en":"IP69","de":"IP69","es":"IP69","fr":"IP69","pt":"IP69","ru":"IP69"},
    "toza dayanıklı":      {"en":"Dust-resistant","de":"Staubgeschützt","es":"Resistente al polvo","fr":"Résistant à la poussière","pt":"Resistente a poeira","ru":"Пылезащищённый"},
    "toza dayanikli":      {"en":"Dust-resistant","de":"Staubgeschützt","es":"Resistente al polvo","fr":"Résistant à la poussière","pt":"Resistente a poeira","ru":"Пылезащищённый"},
    "suya dayanıklı":      {"en":"Water-resistant","de":"Wasserdicht","es":"Resistente al agua","fr":"Résistant à l'eau","pt":"Resistente à água","ru":"Водостойкий"},
    "suya dayanikli":      {"en":"Water-resistant","de":"Wasserdicht","es":"Resistente al agua","fr":"Résistant à l'eau","pt":"Resistente à água","ru":"Водостойкий"},
    # Language names
    "türkçe":              {"en":"Turkish","de":"Türkisch","es":"Turco","fr":"Turc","pt":"Turco","ru":"Турецкий"},
    "turkce":              {"en":"Turkish","de":"Türkisch","es":"Turco","fr":"Turc","pt":"Turco","ru":"Турецкий"},
    "ingilizce":           {"en":"English","de":"Englisch","es":"Inglés","fr":"Anglais","pt":"Inglês","ru":"Английский"},
    "almanca":             {"en":"German","de":"Deutsch","es":"Alemán","fr":"Allemand","pt":"Alemão","ru":"Немецкий"},
    "ispanyolca":          {"en":"Spanish","de":"Spanisch","es":"Español","fr":"Espagnol","pt":"Espanhol","ru":"Испанский"},
    "fransızca":           {"en":"French","de":"Französisch","es":"Francés","fr":"Français","pt":"Francês","ru":"Французский"},
    "fransizca":           {"en":"French","de":"Französisch","es":"Francés","fr":"Français","pt":"Francês","ru":"Французский"},
    "rusça":               {"en":"Russian","de":"Russisch","es":"Ruso","fr":"Russe","pt":"Russo","ru":"Русский"},
    "rusca":               {"en":"Russian","de":"Russisch","es":"Ruso","fr":"Russe","pt":"Russo","ru":"Русский"},
    "portekizce":          {"en":"Portuguese","de":"Portugiesisch","es":"Portugués","fr":"Portugais","pt":"Português","ru":"Португальский"},
    "italyanca":           {"en":"Italian","de":"Italienisch","es":"Italiano","fr":"Italien","pt":"Italiano","ru":"Итальянский"},
    "japonca":             {"en":"Japanese","de":"Japanisch","es":"Japonés","fr":"Japonais","pt":"Japonês","ru":"Японский"},
    "korece":              {"en":"Korean","de":"Koreanisch","es":"Coreano","fr":"Coréen","pt":"Coreano","ru":"Корейский"},
    "çince":               {"en":"Chinese","de":"Chinesisch","es":"Chino","fr":"Chinois","pt":"Chinês","ru":"Китайский"},
    "cince":               {"en":"Chinese","de":"Chinesisch","es":"Chino","fr":"Chinois","pt":"Chinês","ru":"Китайский"},
    "arapça":              {"en":"Arabic","de":"Arabisch","es":"Árabe","fr":"Arabe","pt":"Árabe","ru":"Арабский"},
    "arapca":              {"en":"Arabic","de":"Arabisch","es":"Árabe","fr":"Arabe","pt":"Árabe","ru":"Арабский"},
    # Watch / smart-watch apps and modes that NLLB destroys
    "rahatsız etmeyin":    {"en":"Do Not Disturb","de":"Nicht stören","es":"No molestar","fr":"Ne pas déranger","pt":"Não perturbar","ru":"Не беспокоить"},
    "rahatsiz etmeyin":    {"en":"Do Not Disturb","de":"Nicht stören","es":"No molestar","fr":"Ne pas déranger","pt":"Não perturbar","ru":"Не беспокоить"},
    "sesli komut":         {"en":"Voice command","de":"Sprachbefehl","es":"Comando de voz","fr":"Commande vocale","pt":"Comando de voz","ru":"Голосовая команда"},
    "sesli komuta":        {"en":"Voice command","de":"Sprachbefehl","es":"Comando de voz","fr":"Commande vocale","pt":"Comando de voz","ru":"Голосовая команда"},
    "hesap makinesi":      {"en":"Calculator","de":"Taschenrechner","es":"Calculadora","fr":"Calculatrice","pt":"Calculadora","ru":"Калькулятор"},
    "alarm":               {"en":"Alarm","de":"Alarm","es":"Alarma","fr":"Alarme","pt":"Alarme","ru":"Будильник"},
    "kronometre":          {"en":"Stopwatch","de":"Stoppuhr","es":"Cronómetro","fr":"Chronomètre","pt":"Cronômetro","ru":"Секундомер"},
    "zamanlayıcı":         {"en":"Timer","de":"Timer","es":"Temporizador","fr":"Minuteur","pt":"Temporizador","ru":"Таймер"},
    "zamanlayici":         {"en":"Timer","de":"Timer","es":"Temporizador","fr":"Minuteur","pt":"Temporizador","ru":"Таймер"},
    "dünya saatleri":      {"en":"World clocks","de":"Weltzeituhren","es":"Relojes mundiales","fr":"Horloges mondiales","pt":"Relógios mundiais","ru":"Мировые часы"},
    "dunya saatleri":      {"en":"World clocks","de":"Weltzeituhren","es":"Relojes mundiales","fr":"Horloges mondiales","pt":"Relógios mundiais","ru":"Мировые часы"},
    "takvim":              {"en":"Calendar","de":"Kalender","es":"Calendario","fr":"Calendrier","pt":"Calendário","ru":"Календарь"},
    "hatırlatıcılar":      {"en":"Reminders","de":"Erinnerungen","es":"Recordatorios","fr":"Rappels","pt":"Lembretes","ru":"Напоминания"},
    "hatirlaticilar":      {"en":"Reminders","de":"Erinnerungen","es":"Recordatorios","fr":"Rappels","pt":"Lembretes","ru":"Напоминания"},
    "ilaç hatırlatıcısı":  {"en":"Medication reminder","de":"Medikamentenerinnerung","es":"Recordatorio de medicación","fr":"Rappel de médicaments","pt":"Lembrete de medicação","ru":"Напоминание о лекарствах"},
    "ilac hatirlaticisi":  {"en":"Medication reminder","de":"Medikamentenerinnerung","es":"Recordatorio de medicación","fr":"Rappel de médicaments","pt":"Lembrete de medicação","ru":"Напоминание о лекарствах"},
    "müzik kontrolü":      {"en":"Music control","de":"Musiksteuerung","es":"Control de música","fr":"Contrôle musical","pt":"Controle de música","ru":"Управление музыкой"},
    "muzik kontrolu":      {"en":"Music control","de":"Musiksteuerung","es":"Control de música","fr":"Contrôle musical","pt":"Controle de música","ru":"Управление музыкой"},
    "müzik depolama":      {"en":"Music storage","de":"Musikspeicher","es":"Almacenamiento de música","fr":"Stockage musical","pt":"Armazenamento de música","ru":"Хранение музыки"},
    "muzik depolama":      {"en":"Music storage","de":"Musikspeicher","es":"Almacenamiento de música","fr":"Stockage musical","pt":"Armazenamento de música","ru":"Хранение музыки"},
    "telefonumu bul":      {"en":"Find My Phone","de":"Mein Handy finden","es":"Buscar mi teléfono","fr":"Localiser mon téléphone","pt":"Buscar meu telefone","ru":"Найти телефон"},
    "kamera kontrolü":     {"en":"Camera control","de":"Kamerasteuerung","es":"Control de cámara","fr":"Contrôle de l'appareil photo","pt":"Controle da câmera","ru":"Управление камерой"},
    "kamera kontrolu":     {"en":"Camera control","de":"Kamerasteuerung","es":"Control de cámara","fr":"Contrôle de l'appareil photo","pt":"Controle da câmera","ru":"Управление камерой"},
    "akıllı bildirimler":  {"en":"Smart notifications","de":"Intelligente Benachrichtigungen","es":"Notificaciones inteligentes","fr":"Notifications intelligentes","pt":"Notificações inteligentes","ru":"Умные уведомления"},
    "akilli bildirimler":  {"en":"Smart notifications","de":"Intelligente Benachrichtigungen","es":"Notificaciones inteligentes","fr":"Notifications intelligentes","pt":"Notificações inteligentes","ru":"Умные уведомления"},
    "akıllı ev":           {"en":"Smart home","de":"Smart Home","es":"Hogar inteligente","fr":"Maison connectée","pt":"Casa inteligente","ru":"Умный дом"},
    "akilli ev":           {"en":"Smart home","de":"Smart Home","es":"Hogar inteligente","fr":"Maison connectée","pt":"Casa inteligente","ru":"Умный дом"},
    "siri asistanı":       {"en":"Siri assistant","de":"Siri-Assistent","es":"Asistente Siri","fr":"Assistant Siri","pt":"Assistente Siri","ru":"Ассистент Siri"},
    "siri asistani":       {"en":"Siri assistant","de":"Siri-Assistent","es":"Asistente Siri","fr":"Assistant Siri","pt":"Assistente Siri","ru":"Ассистент Siri"},
    "akıllı sesli asistan":{"en":"Smart voice assistant","de":"Intelligenter Sprachassistent","es":"Asistente de voz inteligente","fr":"Assistant vocal intelligent","pt":"Assistente de voz inteligente","ru":"Умный голосовой помощник"},
    "akilli sesli asistan":{"en":"Smart voice assistant","de":"Intelligenter Sprachassistent","es":"Asistente de voz inteligente","fr":"Assistant vocal intelligent","pt":"Assistente de voz inteligente","ru":"Умный голосовой помощник"},
    "dahili medya oynatıcı":{"en":"Built-in media player","de":"Integrierter Medienplayer","es":"Reproductor multimedia integrado","fr":"Lecteur multimédia intégré","pt":"Reprodutor de mídia integrado","ru":"Встроенный медиаплеер"},
    "dahili medya oynatici":{"en":"Built-in media player","de":"Integrierter Medienplayer","es":"Reproductor multimedia integrado","fr":"Lecteur multimédia intégré","pt":"Reprodutor de mídia integrado","ru":"Встроенный медиаплеер"},
    "çevrimdışı çeviri":   {"en":"Offline translation","de":"Offline-Übersetzung","es":"Traducción sin conexión","fr":"Traduction hors ligne","pt":"Tradução offline","ru":"Перевод офлайн"},
    "cevrimdisi ceviri":   {"en":"Offline translation","de":"Offline-Übersetzung","es":"Traducción sin conexión","fr":"Traduction hors ligne","pt":"Tradução offline","ru":"Перевод офлайн"},
    "çevrimdışı haritalar":{"en":"Offline maps","de":"Offline-Karten","es":"Mapas sin conexión","fr":"Cartes hors ligne","pt":"Mapas offline","ru":"Офлайн-карты"},
    "cevrimdisi haritalar":{"en":"Offline maps","de":"Offline-Karten","es":"Mapas sin conexión","fr":"Cartes hors ligne","pt":"Mapas offline","ru":"Офлайн-карты"},
    "internet radyosu":    {"en":"Internet radio","de":"Internetradio","es":"Radio por Internet","fr":"Radio Internet","pt":"Rádio pela Internet","ru":"Интернет-радио"},
    "web tarayıcı":        {"en":"Web browser","de":"Webbrowser","es":"Navegador web","fr":"Navigateur web","pt":"Navegador web","ru":"Веб-браузер"},
    "web tarayici":        {"en":"Web browser","de":"Webbrowser","es":"Navegador web","fr":"Navigateur web","pt":"Navegador web","ru":"Веб-браузер"},
    "sesli kayıt":         {"en":"Voice recording","de":"Sprachaufnahme","es":"Grabación de voz","fr":"Enregistrement vocal","pt":"Gravação de voz","ru":"Голосовая запись"},
    "sesli kayit":         {"en":"Voice recording","de":"Sprachaufnahme","es":"Grabación de voz","fr":"Enregistrement vocal","pt":"Gravação de voz","ru":"Голосовая запись"},
    "sesli çeviri":        {"en":"Voice translation","de":"Sprachübersetzung","es":"Traducción de voz","fr":"Traduction vocale","pt":"Tradução de voz","ru":"Голосовой перевод"},
    "sesli ceviri":        {"en":"Voice translation","de":"Sprachübersetzung","es":"Traducción de voz","fr":"Traduction vocale","pt":"Tradução de voz","ru":"Голосовой перевод"},
    "sesli mesaj":         {"en":"Voice message","de":"Sprachnachricht","es":"Mensaje de voz","fr":"Message vocal","pt":"Mensagem de voz","ru":"Голосовое сообщение"},
    "sesli not":           {"en":"Voice memo","de":"Sprachnotiz","es":"Nota de voz","fr":"Mémo vocal","pt":"Memo de voz","ru":"Голосовая заметка"},
    "sesli uyarı":         {"en":"Audio alert","de":"Audio-Warnung","es":"Alerta sonora","fr":"Alerte sonore","pt":"Alerta sonoro","ru":"Звуковое оповещение"},
    "sesli uyari":         {"en":"Audio alert","de":"Audio-Warnung","es":"Alerta sonora","fr":"Alerte sonore","pt":"Alerta sonoro","ru":"Звуковое оповещение"},
    "yüksek sesli uyarı":  {"en":"Loud alert","de":"Lauter Alarm","es":"Alerta sonora alta","fr":"Alerte sonore forte","pt":"Alerta sonoro alto","ru":"Громкое оповещение"},
    "yuksek sesli uyari":  {"en":"Loud alert","de":"Lauter Alarm","es":"Alerta sonora alta","fr":"Alerte sonore forte","pt":"Alerta sonoro alto","ru":"Громкое оповещение"},
    "arama geçmişi":       {"en":"Search history","de":"Suchverlauf","es":"Historial de búsqueda","fr":"Historique de recherche","pt":"Histórico de pesquisa","ru":"История поиска"},
    "arama gecmisi":       {"en":"Search history","de":"Suchverlauf","es":"Historial de búsqueda","fr":"Historique de recherche","pt":"Histórico de pesquisa","ru":"История поиска"},
    "gelen aramaları yönet":{"en":"Manage incoming calls","de":"Eingehende Anrufe verwalten","es":"Gestionar llamadas entrantes","fr":"Gérer les appels entrants","pt":"Gerenciar chamadas recebidas","ru":"Управление входящими вызовами"},
    "gelen aramalari yonet":{"en":"Manage incoming calls","de":"Eingehende Anrufe verwalten","es":"Gestionar llamadas entrantes","fr":"Gérer les appels entrants","pt":"Gerenciar chamadas recebidas","ru":"Управление входящими вызовами"},
    "el hareketleriyle cihaz kontrolü":
                            {"en":"Hand-gesture device control","de":"Gerätesteuerung per Handgeste","es":"Control del dispositivo con gestos manuales","fr":"Contrôle de l'appareil par gestes","pt":"Controle do dispositivo por gestos","ru":"Управление устройством жестами"},
    "el hareketleriyle cihaz kontrolu":
                            {"en":"Hand-gesture device control","de":"Gerätesteuerung per Handgeste","es":"Control del dispositivo con gestos manuales","fr":"Contrôle de l'appareil par gestes","pt":"Controle do dispositivo por gestos","ru":"Управление устройством жестами"},
    "dalga grafiği":       {"en":"Waveform","de":"Wellendiagramm","es":"Gráfico de onda","fr":"Graphique d'onde","pt":"Gráfico de onda","ru":"График волны"},
    "dalga grafigi":       {"en":"Waveform","de":"Wellendiagramm","es":"Gráfico de onda","fr":"Graphique d'onde","pt":"Gráfico de onda","ru":"График волны"},
    "enerji tasarrufu modu":{"en":"Power-saving mode","de":"Energiesparmodus","es":"Modo de ahorro de energía","fr":"Mode économie d'énergie","pt":"Modo de economia de energia","ru":"Режим энергосбережения"},
    "uçak modu":           {"en":"Airplane mode","de":"Flugmodus","es":"Modo avión","fr":"Mode avion","pt":"Modo avião","ru":"Авиарежим"},
    "ucak modu":           {"en":"Airplane mode","de":"Flugmodus","es":"Modo avión","fr":"Mode avion","pt":"Modo avião","ru":"Авиарежим"},
    "bluetooth kulaklık uyumu":{"en":"Bluetooth headphone compatibility","de":"Bluetooth-Kopfhörer-Kompatibilität","es":"Compatibilidad con auriculares Bluetooth","fr":"Compatibilité casque Bluetooth","pt":"Compatibilidade com fones Bluetooth","ru":"Совместимость с Bluetooth-наушниками"},
    "bluetooth kulaklik uyumu":{"en":"Bluetooth headphone compatibility","de":"Bluetooth-Kopfhörer-Kompatibilität","es":"Compatibilidad con auriculares Bluetooth","fr":"Compatibilité casque Bluetooth","pt":"Compatibilidade com fones Bluetooth","ru":"Совместимость с Bluetooth-наушниками"},
    "telsiz (walkie-talkie)":{"en":"Walkie-Talkie","de":"Walkie-Talkie","es":"Walkie-Talkie","fr":"Walkie-Talkie","pt":"Walkie-Talkie","ru":"Walkie-Talkie"},
    "dijital taç":         {"en":"Digital Crown","de":"Digital Crown","es":"Digital Crown","fr":"Digital Crown","pt":"Digital Crown","ru":"Digital Crown"},
    "dijital tac":         {"en":"Digital Crown","de":"Digital Crown","es":"Digital Crown","fr":"Digital Crown","pt":"Digital Crown","ru":"Digital Crown"},
    "ultra geniş bant (uwb)":{"en":"Ultra-Wideband (UWB)","de":"Ultra-Breitband (UWB)","es":"Banda Ultra Ancha (UWB)","fr":"Bande ultra-large (UWB)","pt":"Banda ultra-larga (UWB)","ru":"Сверхширокополосный (UWB)"},
    "ultra genis bant (uwb)":{"en":"Ultra-Wideband (UWB)","de":"Ultra-Breitband (UWB)","es":"Banda Ultra Ancha (UWB)","fr":"Bande ultra-large (UWB)","pt":"Banda ultra-larga (UWB)","ru":"Сверхширокополосный (UWB)"},
    # Health/safety
    "acil arama (sos)":    {"en":"Emergency SOS","de":"Notruf SOS","es":"SOS de emergencia","fr":"SOS d'urgence","pt":"SOS de emergência","ru":"Экстренный вызов SOS"},
    "acil durum bilgileri":{"en":"Emergency information","de":"Notfallinformationen","es":"Información de emergencia","fr":"Informations d'urgence","pt":"Informações de emergência","ru":"Сведения о ЧС"},
    "canlı konum takibi":  {"en":"Live location tracking","de":"Live-Standortverfolgung","es":"Seguimiento de ubicación en vivo","fr":"Suivi de position en direct","pt":"Rastreamento de localização ao vivo","ru":"Отслеживание местоположения в реальном времени"},
    "canli konum takibi":  {"en":"Live location tracking","de":"Live-Standortverfolgung","es":"Seguimiento de ubicación en vivo","fr":"Suivi de position en direct","pt":"Rastreamento de localização ao vivo","ru":"Отслеживание местоположения в реальном времени"},
    "geri dönüş takibi":   {"en":"Backtrack","de":"Rückverfolgung","es":"Seguimiento de regreso","fr":"Itinéraire retour","pt":"Rastrear retorno","ru":"Обратный маршрут"},
    "geri donus takibi":   {"en":"Backtrack","de":"Rückverfolgung","es":"Seguimiento de regreso","fr":"Itinéraire retour","pt":"Rastrear retorno","ru":"Обратный маршрут"},
    "kaza algılama":       {"en":"Crash detection","de":"Unfallerkennung","es":"Detección de accidentes","fr":"Détection d'accident","pt":"Detecção de acidentes","ru":"Обнаружение аварий"},
    "kaza algilama":       {"en":"Crash detection","de":"Unfallerkennung","es":"Detección de accidentes","fr":"Détection d'accident","pt":"Detecção de acidentes","ru":"Обнаружение аварий"},
    "konum bilgisi paylaşma":{"en":"Share location","de":"Standort teilen","es":"Compartir ubicación","fr":"Partager la position","pt":"Compartilhar localização","ru":"Поделиться местоположением"},
    "konum bilgisi paylasma":{"en":"Share location","de":"Standort teilen","es":"Compartir ubicación","fr":"Partager la position","pt":"Compartilhar localização","ru":"Поделиться местоположением"},
    "uluslararası acil arama":{"en":"International emergency call","de":"Internationaler Notruf","es":"Llamada internacional de emergencia","fr":"Appel d'urgence international","pt":"Chamada internacional de emergência","ru":"Международный экстренный вызов"},
    "uluslararasi acil arama":{"en":"International emergency call","de":"Internationaler Notruf","es":"Llamada internacional de emergencia","fr":"Appel d'urgence international","pt":"Chamada internacional de emergência","ru":"Международный экстренный вызов"},
    "uv indeksi":          {"en":"UV index","de":"UV-Index","es":"Índice UV","fr":"Indice UV","pt":"Índice UV","ru":"УФ-индекс"},
    # Health metrics
    "kalp ritmi monitörü": {"en":"Heart-rate monitor","de":"Herzfrequenz-Monitor","es":"Monitor de ritmo cardíaco","fr":"Moniteur de fréquence cardiaque","pt":"Monitor de frequência cardíaca","ru":"Пульсометр"},
    "kalp ritmi monitoru": {"en":"Heart-rate monitor","de":"Herzfrequenz-Monitor","es":"Monitor de ritmo cardíaco","fr":"Moniteur de fréquence cardiaque","pt":"Monitor de frequência cardíaca","ru":"Пульсометр"},
    "kalori takibi":       {"en":"Calorie tracking","de":"Kalorienverfolgung","es":"Seguimiento de calorías","fr":"Suivi des calories","pt":"Monitoramento de calorias","ru":"Учёт калорий"},
    "uyku monitörü":       {"en":"Sleep monitor","de":"Schlafüberwachung","es":"Monitor de sueño","fr":"Suivi du sommeil","pt":"Monitor de sono","ru":"Мониторинг сна"},
    "uyku monitoru":       {"en":"Sleep monitor","de":"Schlafüberwachung","es":"Monitor de sueño","fr":"Suivi du sommeil","pt":"Monitor de sono","ru":"Мониторинг сна"},
    "hareketsizlik uyarısı":{"en":"Inactivity alert","de":"Inaktivitätswarnung","es":"Alerta de inactividad","fr":"Alerte d'inactivité","pt":"Alerta de inatividade","ru":"Уведомление о бездействии"},
    "hareketsizlik uyarisi":{"en":"Inactivity alert","de":"Inaktivitätswarnung","es":"Alerta de inactividad","fr":"Alerte d'inactivité","pt":"Alerta de inatividade","ru":"Уведомление о бездействии"},
    "kandaki oksijen seviyesi monitörü (spo2)":
                            {"en":"Blood oxygen monitor (SpO2)","de":"Blutsauerstoff-Monitor (SpO2)","es":"Monitor de oxígeno en sangre (SpO2)","fr":"Moniteur d'oxygène sanguin (SpO2)","pt":"Monitor de oxigênio no sangue (SpO2)","ru":"Монитор кислорода в крови (SpO2)"},
    "kandaki oksijen seviyesi monitoru (spo2)":
                            {"en":"Blood oxygen monitor (SpO2)","de":"Blutsauerstoff-Monitor (SpO2)","es":"Monitor de oxígeno en sangre (SpO2)","fr":"Moniteur d'oxygène sanguin (SpO2)","pt":"Monitor de oxigênio no sangue (SpO2)","ru":"Монитор кислорода в крови (SpO2)"},
    "kadın sağlığı takibi":{"en":"Women's health tracking","de":"Frauengesundheit-Tracking","es":"Seguimiento de salud femenina","fr":"Suivi de santé féminine","pt":"Monitoramento de saúde feminina","ru":"Мониторинг женского здоровья"},
    "kadin sagligi takibi":{"en":"Women's health tracking","de":"Frauengesundheit-Tracking","es":"Seguimiento de salud femenina","fr":"Suivi de santé féminine","pt":"Monitoramento de saúde feminina","ru":"Мониторинг женского здоровья"},
    "nefes egzersizleri":  {"en":"Breathing exercises","de":"Atemübungen","es":"Ejercicios de respiración","fr":"Exercices de respiration","pt":"Exercícios de respiração","ru":"Дыхательные упражнения"},
    "stres seviyesi göstergesi":{"en":"Stress-level indicator","de":"Stresslevel-Anzeige","es":"Indicador de nivel de estrés","fr":"Indicateur de niveau de stress","pt":"Indicador de nível de estresse","ru":"Индикатор уровня стресса"},
    "stres seviyesi gostergesi":{"en":"Stress-level indicator","de":"Stresslevel-Anzeige","es":"Indicador de nivel de estrés","fr":"Indicateur de niveau de stress","pt":"Indicador de nível de estresse","ru":"Индикатор уровня стресса"},
    "elektrokardiyogram (ekg)":{"en":"Electrocardiogram (ECG)","de":"Elektrokardiogramm (EKG)","es":"Electrocardiograma (ECG)","fr":"Électrocardiogramme (ECG)","pt":"Eletrocardiograma (ECG)","ru":"Электрокардиограмма (ЭКГ)"},
    "elektrikli kalp monitörü (ekg)":{"en":"Electrocardiogram (ECG)","de":"Elektrokardiogramm (EKG)","es":"Electrocardiograma (ECG)","fr":"Électrocardiogramme (ECG)","pt":"Eletrocardiograma (ECG)","ru":"Электрокардиограмма (ЭКГ)"},
    "elektrikli kalp monitoru (ekg)":{"en":"Electrocardiogram (ECG)","de":"Elektrokardiogramm (EKG)","es":"Electrocardiograma (ECG)","fr":"Électrocardiogramme (ECG)","pt":"Eletrocardiograma (ECG)","ru":"Электрокардиограмма (ЭКГ)"},
    "vücut sıcaklık ölçer":{"en":"Body temperature sensor","de":"Körpertemperatursensor","es":"Sensor de temperatura corporal","fr":"Capteur de température corporelle","pt":"Sensor de temperatura corporal","ru":"Датчик температуры тела"},
    "vucut sicaklik olcer":{"en":"Body temperature sensor","de":"Körpertemperatursensor","es":"Sensor de temperatura corporal","fr":"Capteur de température corporelle","pt":"Sensor de temperatura corporal","ru":"Датчик температуры тела"},
    "düzensiz ritim bildirimi":{"en":"Irregular rhythm notification","de":"Unregelmäßiger-Rhythmus-Hinweis","es":"Aviso de ritmo irregular","fr":"Notification de rythme irrégulier","pt":"Aviso de ritmo irregular","ru":"Уведомление о нерегулярном ритме"},
    "duzensiz ritim bildirimi":{"en":"Irregular rhythm notification","de":"Unregelmäßiger-Rhythmus-Hinweis","es":"Aviso de ritmo irregular","fr":"Notification de rythme irrégulier","pt":"Aviso de ritmo irregular","ru":"Уведомление о нерегулярном ритме"},
    "hipertansiyon bildirimi":{"en":"Hypertension notification","de":"Bluthochdruck-Hinweis","es":"Aviso de hipertensión","fr":"Alerte d'hypertension","pt":"Aviso de hipertensão","ru":"Уведомление о гипертонии"},
    "ruh hali takibi":     {"en":"Mood tracking","de":"Stimmungsverfolgung","es":"Seguimiento del estado de ánimo","fr":"Suivi de l'humeur","pt":"Monitoramento de humor","ru":"Отслеживание настроения"},
    "sağlık önerileri":    {"en":"Health suggestions","de":"Gesundheitsempfehlungen","es":"Sugerencias de salud","fr":"Conseils santé","pt":"Sugestões de saúde","ru":"Советы по здоровью"},
    "saglik onerileri":    {"en":"Health suggestions","de":"Gesundheitsempfehlungen","es":"Sugerencias de salud","fr":"Conseils santé","pt":"Sugestões de saúde","ru":"Советы по здоровью"},
    "tıbbi kimlik":        {"en":"Medical ID","de":"Medizinische ID","es":"ID médico","fr":"ID médical","pt":"ID médico","ru":"Медицинский ID"},
    "tibbi kimlik":        {"en":"Medical ID","de":"Medizinische ID","es":"ID médico","fr":"ID médical","pt":"ID médico","ru":"Медицинский ID"},
    "uyku apnesi bildirimi":{"en":"Sleep apnea notification","de":"Schlafapnoe-Hinweis","es":"Aviso de apnea del sueño","fr":"Notification d'apnée du sommeil","pt":"Aviso de apneia do sono","ru":"Уведомление об апноэ во сне"},
    # Sports / activities
    "adımsayar":           {"en":"Step counter","de":"Schrittzähler","es":"Podómetro","fr":"Podomètre","pt":"Pedômetro","ru":"Шагомер"},
    "adimsayar":           {"en":"Step counter","de":"Schrittzähler","es":"Podómetro","fr":"Podomètre","pt":"Pedômetro","ru":"Шагомер"},
    "mesafe ölçer":        {"en":"Distance meter","de":"Entfernungsmesser","es":"Medidor de distancia","fr":"Mesureur de distance","pt":"Medidor de distância","ru":"Измеритель расстояния"},
    "mesafe olcer":        {"en":"Distance meter","de":"Entfernungsmesser","es":"Medidor de distancia","fr":"Mesureur de distance","pt":"Medidor de distância","ru":"Измеритель расстояния"},
    "aktivite takibi ve geçmişi":{"en":"Activity tracking & history","de":"Aktivitätsverfolgung und -verlauf","es":"Seguimiento e historial de actividad","fr":"Suivi et historique d'activité","pt":"Monitoramento e histórico de atividades","ru":"Учёт активности и история"},
    "aktivite takibi ve gecmisi":{"en":"Activity tracking & history","de":"Aktivitätsverfolgung und -verlauf","es":"Seguimiento e historial de actividad","fr":"Suivi et historique d'activité","pt":"Monitoramento e histórico de atividades","ru":"Учёт активности и история"},
    "hava durumu":         {"en":"Weather","de":"Wetter","es":"Tiempo","fr":"Météo","pt":"Tempo","ru":"Погода"},
    "çoklu spor modu":     {"en":"Multi-sport mode","de":"Multisport-Modus","es":"Modo multideporte","fr":"Mode multisport","pt":"Modo multiesporte","ru":"Мультиспортивный режим"},
    "coklu spor modu":     {"en":"Multi-sport mode","de":"Multisport-Modus","es":"Modo multideporte","fr":"Mode multisport","pt":"Modo multiesporte","ru":"Мультиспортивный режим"},
    "akıllı antrenör":     {"en":"Smart coach","de":"Smarter Coach","es":"Entrenador inteligente","fr":"Coach intelligent","pt":"Treinador inteligente","ru":"Умный тренер"},
    "akilli antrenor":     {"en":"Smart coach","de":"Smarter Coach","es":"Entrenador inteligente","fr":"Coach intelligent","pt":"Treinador inteligente","ru":"Умный тренер"},
    "deniz suyu sıcaklık bilgisi":{"en":"Sea water temperature","de":"Meereswassertemperatur","es":"Temperatura del agua de mar","fr":"Température de l'eau de mer","pt":"Temperatura da água do mar","ru":"Температура морской воды"},
    "deniz suyu sicaklik bilgisi":{"en":"Sea water temperature","de":"Meereswassertemperatur","es":"Temperatura del agua de mar","fr":"Température de l'eau de mer","pt":"Temperatura da água do mar","ru":"Температура морской воды"},
    "geri dönüş rotası":   {"en":"Return route","de":"Rückweg","es":"Ruta de regreso","fr":"Itinéraire retour","pt":"Rota de retorno","ru":"Маршрут возврата"},
    "geri donus rotasi":   {"en":"Return route","de":"Rückweg","es":"Ruta de regreso","fr":"Itinéraire retour","pt":"Rota de retorno","ru":"Маршрут возврата"},
    "hedef belirleme":     {"en":"Goal setting","de":"Zielsetzung","es":"Establecimiento de objetivos","fr":"Définition d'objectifs","pt":"Definição de metas","ru":"Постановка целей"},
    "hız ölçümü":          {"en":"Speed measurement","de":"Geschwindigkeitsmessung","es":"Medición de velocidad","fr":"Mesure de vitesse","pt":"Medição de velocidade","ru":"Измерение скорости"},
    "hiz olcumu":          {"en":"Speed measurement","de":"Geschwindigkeitsmessung","es":"Medición de velocidad","fr":"Mesure de vitesse","pt":"Medição de velocidade","ru":"Измерение скорости"},
    "rota takibi":         {"en":"Route tracking","de":"Streckenverfolgung","es":"Seguimiento de ruta","fr":"Suivi d'itinéraire","pt":"Rastreamento de rota","ru":"Отслеживание маршрута"},
    "rüzgar bilgisi":      {"en":"Wind info","de":"Windinformationen","es":"Información del viento","fr":"Infos vent","pt":"Informações do vento","ru":"Информация о ветре"},
    "ruzgar bilgisi":      {"en":"Wind info","de":"Windinformationen","es":"Información del viento","fr":"Infos vent","pt":"Informações do vento","ru":"Информация о ветре"},
    "sanal antrenman partneri":{"en":"Virtual training partner","de":"Virtueller Trainingspartner","es":"Compañero de entrenamiento virtual","fr":"Partenaire d'entraînement virtuel","pt":"Parceiro de treino virtual","ru":"Виртуальный партнёр по тренировкам"},
    # Activity names (often standalone — NLLB negates them ("Don't swim"))
    "koşu":                {"en":"Running","de":"Laufen","es":"Correr","fr":"Course à pied","pt":"Corrida","ru":"Бег"},
    "kosu":                {"en":"Running","de":"Laufen","es":"Correr","fr":"Course à pied","pt":"Corrida","ru":"Бег"},
    "bisiklet":            {"en":"Cycling","de":"Fahrrad","es":"Ciclismo","fr":"Vélo","pt":"Ciclismo","ru":"Велоспорт"},
    "yürüyüş":             {"en":"Walking","de":"Gehen","es":"Caminar","fr":"Marche","pt":"Caminhada","ru":"Ходьба"},
    "yuruyus":             {"en":"Walking","de":"Gehen","es":"Caminar","fr":"Marche","pt":"Caminhada","ru":"Ходьба"},
    "yüzme":               {"en":"Swimming","de":"Schwimmen","es":"Natación","fr":"Natation","pt":"Natação","ru":"Плавание"},
    "yuzme":               {"en":"Swimming","de":"Schwimmen","es":"Natación","fr":"Natation","pt":"Natação","ru":"Плавание"},
    "yüzme (havuz)":       {"en":"Swimming (pool)","de":"Schwimmen (Pool)","es":"Natación (piscina)","fr":"Natation (piscine)","pt":"Natação (piscina)","ru":"Плавание (бассейн)"},
    "yuzme (havuz)":       {"en":"Swimming (pool)","de":"Schwimmen (Pool)","es":"Natación (piscina)","fr":"Natation (piscine)","pt":"Natação (piscina)","ru":"Плавание (бассейн)"},
    "yüzme (deniz)":       {"en":"Swimming (sea)","de":"Schwimmen (Meer)","es":"Natación (mar)","fr":"Natation (mer)","pt":"Natação (mar)","ru":"Плавание (море)"},
    "yuzme (deniz)":       {"en":"Swimming (sea)","de":"Schwimmen (Meer)","es":"Natación (mar)","fr":"Natation (mer)","pt":"Natação (mar)","ru":"Плавание (море)"},
    "eliptik bisiklet":    {"en":"Elliptical bike","de":"Crosstrainer","es":"Bicicleta elíptica","fr":"Vélo elliptique","pt":"Bicicleta elíptica","ru":"Эллиптический тренажёр"},
    "fitness":             {"en":"Fitness","de":"Fitness","es":"Fitness","fr":"Fitness","pt":"Fitness","ru":"Фитнес"},
    "yoga":                {"en":"Yoga","de":"Yoga","es":"Yoga","fr":"Yoga","pt":"Yoga","ru":"Йога"},
    "kürek çekme":         {"en":"Rowing","de":"Rudern","es":"Remo","fr":"Aviron","pt":"Remo","ru":"Гребля"},
    "kurek cekme":         {"en":"Rowing","de":"Rudern","es":"Remo","fr":"Aviron","pt":"Remo","ru":"Гребля"},
    "kayak":               {"en":"Skiing","de":"Skifahren","es":"Esquí","fr":"Ski","pt":"Esqui","ru":"Лыжный спорт"},
    "kardiyo":             {"en":"Cardio","de":"Cardio","es":"Cardio","fr":"Cardio","pt":"Cardio","ru":"Кардио"},
    "merdiven çıkma":      {"en":"Stair climbing","de":"Treppensteigen","es":"Subir escaleras","fr":"Montée d'escaliers","pt":"Subir escadas","ru":"Подъём по лестнице"},
    "merdiven cikma":      {"en":"Stair climbing","de":"Treppensteigen","es":"Subir escaleras","fr":"Montée d'escaliers","pt":"Subir escadas","ru":"Подъём по лестнице"},
    "golf":                {"en":"Golf","de":"Golf","es":"Golf","fr":"Golf","pt":"Golfe","ru":"Гольф"},
    "dayanıklılık":        {"en":"Endurance","de":"Ausdauer","es":"Resistencia","fr":"Endurance","pt":"Resistência","ru":"Выносливость"},
    "dayaniklilik":        {"en":"Endurance","de":"Ausdauer","es":"Resistencia","fr":"Endurance","pt":"Resistência","ru":"Выносливость"},
    "dayanıklılık/güç":    {"en":"Endurance/Strength","de":"Ausdauer/Kraft","es":"Resistencia/Fuerza","fr":"Endurance/Force","pt":"Resistência/Força","ru":"Выносливость/Сила"},
    "dayaniklilik/guc":    {"en":"Endurance/Strength","de":"Ausdauer/Kraft","es":"Resistencia/Fuerza","fr":"Endurance/Force","pt":"Resistência/Força","ru":"Выносливость/Сила"},
    "pilates":             {"en":"Pilates","de":"Pilates","es":"Pilates","fr":"Pilates","pt":"Pilates","ru":"Пилатес"},
    "snowboard":           {"en":"Snowboard","de":"Snowboard","es":"Snowboard","fr":"Snowboard","pt":"Snowboard","ru":"Сноуборд"},
    "güç egzersizleri":    {"en":"Strength exercises","de":"Kraftübungen","es":"Ejercicios de fuerza","fr":"Exercices de force","pt":"Exercícios de força","ru":"Силовые упражнения"},
    "guc egzersizleri":    {"en":"Strength exercises","de":"Kraftübungen","es":"Ejercicios de fuerza","fr":"Exercices de force","pt":"Exercícios de força","ru":"Силовые упражнения"},
    "hiit":                {"en":"HIIT","de":"HIIT","es":"HIIT","fr":"HIIT","pt":"HIIT","ru":"HIIT"},
    "dövüş sporları":      {"en":"Combat sports","de":"Kampfsport","es":"Deportes de combate","fr":"Sports de combat","pt":"Esportes de combate","ru":"Боевые виды спорта"},
    "dovus sporlari":      {"en":"Combat sports","de":"Kampfsport","es":"Deportes de combate","fr":"Sports de combat","pt":"Esportes de combate","ru":"Боевые виды спорта"},
    "dans":                {"en":"Dance","de":"Tanzen","es":"Baile","fr":"Danse","pt":"Dança","ru":"Танцы"},
    # Sensors
    "jiroskop":            {"en":"Gyroscope","de":"Gyroskop","es":"Giroscopio","fr":"Gyroscope","pt":"Giroscópio","ru":"Гироскоп"},
    "ivmeölçer":           {"en":"Accelerometer","de":"Beschleunigungssensor","es":"Acelerómetro","fr":"Accéléromètre","pt":"Acelerômetro","ru":"Акселерометр"},
    "ivmeolcer":           {"en":"Accelerometer","de":"Beschleunigungssensor","es":"Acelerómetro","fr":"Accéléromètre","pt":"Acelerômetro","ru":"Акселерометр"},
    "ortam ışığı sensörü": {"en":"Ambient light sensor","de":"Umgebungslichtsensor","es":"Sensor de luz ambiental","fr":"Capteur de lumière ambiante","pt":"Sensor de luz ambiente","ru":"Датчик освещённости"},
    "ortam isigi sensoru": {"en":"Ambient light sensor","de":"Umgebungslichtsensor","es":"Sensor de luz ambiental","fr":"Capteur de lumière ambiante","pt":"Sensor de luz ambiente","ru":"Датчик освещённости"},
    "pusula":              {"en":"Compass","de":"Kompass","es":"Brújula","fr":"Boussole","pt":"Bússola","ru":"Компас"},
    "barometre":           {"en":"Barometer","de":"Barometer","es":"Barómetro","fr":"Baromètre","pt":"Barômetro","ru":"Барометр"},
    "altimetre":           {"en":"Altimeter","de":"Höhenmesser","es":"Altímetro","fr":"Altimètre","pt":"Altímetro","ru":"Высотомер"},
    "termometre":          {"en":"Thermometer","de":"Thermometer","es":"Termómetro","fr":"Thermomètre","pt":"Termômetro","ru":"Термометр"},
    "derinlik sensörü":    {"en":"Depth sensor","de":"Tiefensensor","es":"Sensor de profundidad","fr":"Capteur de profondeur","pt":"Sensor de profundidade","ru":"Датчик глубины"},
    "derinlik sensoru":    {"en":"Depth sensor","de":"Tiefensensor","es":"Sensor de profundidad","fr":"Capteur de profondeur","pt":"Sensor de profundidade","ru":"Датчик глубины"},
    "gürültü sensörü":     {"en":"Noise sensor","de":"Geräuschsensor","es":"Sensor de ruido","fr":"Capteur de bruit","pt":"Sensor de ruído","ru":"Датчик шума"},
    "gurultu sensoru":     {"en":"Noise sensor","de":"Geräuschsensor","es":"Sensor de ruido","fr":"Capteur de bruit","pt":"Sensor de ruído","ru":"Датчик шума"},
    "su sıcaklık sensörü": {"en":"Water temperature sensor","de":"Wassertemperatursensor","es":"Sensor de temperatura del agua","fr":"Capteur de température de l'eau","pt":"Sensor de temperatura da água","ru":"Датчик температуры воды"},
    "su sicaklik sensoru": {"en":"Water temperature sensor","de":"Wassertemperatursensor","es":"Sensor de temperatura del agua","fr":"Capteur de température de l'eau","pt":"Sensor de temperatura da água","ru":"Датчик температуры воды"},
    # Charging / battery formats
    "kablosuz şarj":       {"en":"Wireless charging","de":"Kabelloses Laden","es":"Carga inalámbrica","fr":"Charge sans fil","pt":"Carregamento sem fio","ru":"Беспроводная зарядка"},
    "kablosuz sarj":       {"en":"Wireless charging","de":"Kabelloses Laden","es":"Carga inalámbrica","fr":"Charge sans fil","pt":"Carregamento sem fio","ru":"Беспроводная зарядка"},
    "hızlı şarj":          {"en":"Fast charging","de":"Schnellladung","es":"Carga rápida","fr":"Charge rapide","pt":"Carregamento rápido","ru":"Быстрая зарядка"},
    "hizli sarj":          {"en":"Fast charging","de":"Schnellladung","es":"Carga rápida","fr":"Charge rapide","pt":"Carregamento rápido","ru":"Быстрая зарядка"},
    "lityum iyon":         {"en":"Lithium-ion","de":"Lithium-Ionen","es":"Iones de litio","fr":"Lithium-ion","pt":"Íons de lítio","ru":"Литий-ионный"},
    "lityum-iyon":         {"en":"Lithium-ion","de":"Lithium-Ionen","es":"Iones de litio","fr":"Lithium-ion","pt":"Íons de lítio","ru":"Литий-ионный"},
    # Misc product-detail
    "akıllı saat":         {"en":"Smartwatch","de":"Smartwatch","es":"Smartwatch","fr":"Montre connectée","pt":"Smartwatch","ru":"Смарт-часы"},
    "akilli saat":         {"en":"Smartwatch","de":"Smartwatch","es":"Smartwatch","fr":"Montre connectée","pt":"Smartwatch","ru":"Смарт-часы"},
    "kordon":              {"en":"Strap","de":"Armband","es":"Correa","fr":"Bracelet","pt":"Pulseira","ru":"Ремешок"},
    "kordon rengi":        {"en":"Strap color","de":"Armbandfarbe","es":"Color de la correa","fr":"Couleur du bracelet","pt":"Cor da pulseira","ru":"Цвет ремешка"},
    "kordon malzemesi":    {"en":"Strap material","de":"Armbandmaterial","es":"Material de la correa","fr":"Matériau du bracelet","pt":"Material da pulseira","ru":"Материал ремешка"},
    "kasa malzemesi":      {"en":"Case material","de":"Gehäusematerial","es":"Material de la caja","fr":"Matériau du boîtier","pt":"Material da caixa","ru":"Материал корпуса"},
    "kasa rengi":          {"en":"Case color","de":"Gehäusefarbe","es":"Color de la caja","fr":"Couleur du boîtier","pt":"Cor da caixa","ru":"Цвет корпуса"},
    "kasa boyu":           {"en":"Case size","de":"Gehäusegröße","es":"Tamaño de la caja","fr":"Taille du boîtier","pt":"Tamanho da caixa","ru":"Размер корпуса"},
    "alüminyum alaşım":    {"en":"Aluminum alloy","de":"Aluminiumlegierung","es":"Aleación de aluminio","fr":"Alliage d'aluminium","pt":"Liga de alumínio","ru":"Алюминиевый сплав"},
    "aluminyum alasim":    {"en":"Aluminum alloy","de":"Aluminiumlegierung","es":"Aleación de aluminio","fr":"Alliage d'aluminium","pt":"Liga de alumínio","ru":"Алюминиевый сплав"},
    "ion-x cam":           {"en":"Ion-X glass","de":"Ion-X-Glas","es":"Vidrio Ion-X","fr":"Verre Ion-X","pt":"Vidro Ion-X","ru":"Стекло Ion-X"},
    "gürültü önleyici mikrofon":{"en":"Noise-cancelling microphone","de":"Geräuschunterdrückendes Mikrofon","es":"Micrófono con cancelación de ruido","fr":"Microphone à réduction de bruit","pt":"Microfone com cancelamento de ruído","ru":"Микрофон с шумоподавлением"},
    "gurultu onleyici mikrofon":{"en":"Noise-cancelling microphone","de":"Geräuschunterdrückendes Mikrofon","es":"Micrófono con cancelación de ruido","fr":"Microphone à réduction de bruit","pt":"Microfone com cancelamento de ruído","ru":"Микрофон с шумоподавлением"},
    # Body part terms NLLB confused ("Weight on the meat" / "Body weighs fire")
    "vücut ağırlığı":      {"en":"Body weight","de":"Körpergewicht","es":"Peso corporal","fr":"Poids du corps","pt":"Peso corporal","ru":"Масса тела"},
    "vucut agirligi":      {"en":"Body weight","de":"Körpergewicht","es":"Peso corporal","fr":"Poids du corps","pt":"Peso corporal","ru":"Масса тела"},
    "cihaz ağırlığı":      {"en":"Device weight","de":"Gerätegewicht","es":"Peso del dispositivo","fr":"Poids de l'appareil","pt":"Peso do dispositivo","ru":"Вес устройства"},
    "cihaz agirligi":      {"en":"Device weight","de":"Gerätegewicht","es":"Peso del dispositivo","fr":"Poids de l'appareil","pt":"Peso do dispositivo","ru":"Вес устройства"},
    "iOS için":            {"en":"For iOS","de":"Für iOS","es":"Para iOS","fr":"Pour iOS","pt":"Para iOS","ru":"Для iOS"},
    "ios için":            {"en":"For iOS","de":"Für iOS","es":"Para iOS","fr":"Pour iOS","pt":"Para iOS","ru":"Для iOS"},
    "ios icin":            {"en":"For iOS","de":"Für iOS","es":"Para iOS","fr":"Pour iOS","pt":"Para iOS","ru":"Для iOS"},
    "android için":        {"en":"For Android","de":"Für Android","es":"Para Android","fr":"Pour Android","pt":"Para Android","ru":"Для Android"},
    "android icin":        {"en":"For Android","de":"Für Android","es":"Para Android","fr":"Pour Android","pt":"Para Android","ru":"Для Android"},
})

# ─── Round 3 overrides: exact real-Epey atom forms (2026-05-29) ──────────
# Captured directly from Apple Watch Series 11 page after dumping raw TR
# strings. Many of the previous Round-2 keys were close but not EXACT to
# what Epey ships (e.g. real atom is "Çizilmeye Dirençli" not "Dayanıklı",
# "Vücut Ateş Ölçer" not "Sıcaklık Ölçer", "Yonga Seti (Chipset)" with
# parenthetical, etc.). Keys here are the EXACT real forms.
OVERRIDES.update({
    # Display features
    "çizilmeye dirençli":   {"en":"Scratch-resistant","de":"Kratzfest","es":"Resistente a rayones","fr":"Résistant aux rayures","pt":"Resistente a riscos","ru":"Устойчивый к царапинам"},
    "cizilmeye direncli":   {"en":"Scratch-resistant","de":"Kratzfest","es":"Resistente a rayones","fr":"Résistant aux rayures","pt":"Resistente a riscos","ru":"Устойчивый к царапинам"},
    "sürekli açık (always-on)":{"en":"Always-On","de":"Always-On","es":"Always-On","fr":"Always-On","pt":"Always-On","ru":"Always-On"},
    "surekli acik (always-on)":{"en":"Always-On","de":"Always-On","es":"Always-On","fr":"Always-On","pt":"Always-On","ru":"Always-On"},
    "geniş açılı oled":     {"en":"Wide-angle OLED","de":"Weitwinkel-OLED","es":"OLED de gran angular","fr":"OLED grand angle","pt":"OLED de grande angular","ru":"Широкоугольный OLED"},
    "genis acili oled":     {"en":"Wide-angle OLED","de":"Weitwinkel-OLED","es":"OLED de gran angular","fr":"OLED grand angle","pt":"OLED de grande angular","ru":"Широкоугольный OLED"},
    "ion-x cam":            {"en":"Ion-X glass","de":"Ion-X-Glas","es":"Vidrio Ion-X","fr":"Verre Ion-X","pt":"Vidro Ion-X","ru":"Стекло Ion-X"},
    # Colors / gold variants
    "pembe altın":          {"en":"Rose Gold","de":"Roségold","es":"Oro rosa","fr":"Or rose","pt":"Ouro rosa","ru":"Розовое золото"},
    "pembe altin":          {"en":"Rose Gold","de":"Roségold","es":"Oro rosa","fr":"Or rose","pt":"Ouro rosa","ru":"Розовое золото"},
    # Phone over Bluetooth
    "bluetooth ile telefon üzerinden":
                             {"en":"Via phone over Bluetooth","de":"Über das Telefon via Bluetooth","es":"Por teléfono vía Bluetooth","fr":"Via le téléphone en Bluetooth","pt":"Via telefone por Bluetooth","ru":"Через телефон по Bluetooth"},
    "bluetooth ile telefon uzerinden":
                             {"en":"Via phone over Bluetooth","de":"Über das Telefon via Bluetooth","es":"Por teléfono vía Bluetooth","fr":"Via le téléphone en Bluetooth","pt":"Via telefone por Bluetooth","ru":"Через телефон по Bluetooth"},
    # Services / apps — exact forms found on Epey
    "müzik çalar kontrolü": {"en":"Music player control","de":"Musikplayer-Steuerung","es":"Control del reproductor de música","fr":"Contrôle du lecteur de musique","pt":"Controle do reprodutor de música","ru":"Управление музыкальным плеером"},
    "muzik calar kontrolu": {"en":"Music player control","de":"Musikplayer-Steuerung","es":"Control del reproductor de música","fr":"Contrôle du lecteur de musique","pt":"Controle do reprodutor de música","ru":"Управление музыкальным плеером"},
    "kamera kumandası":     {"en":"Camera remote","de":"Kamera-Fernsteuerung","es":"Control remoto de cámara","fr":"Télécommande d'appareil photo","pt":"Controle remoto da câmera","ru":"Пульт камеры"},
    "kamera kumandasi":     {"en":"Camera remote","de":"Kamera-Fernsteuerung","es":"Control remoto de cámara","fr":"Télécommande d'appareil photo","pt":"Controle remoto da câmera","ru":"Пульт камеры"},
    "siri asistan":         {"en":"Siri Assistant","de":"Siri-Assistent","es":"Asistente Siri","fr":"Assistant Siri","pt":"Assistente Siri","ru":"Ассистент Siri"},
    "gelen aramaları yönetme":{"en":"Manage incoming calls","de":"Eingehende Anrufe verwalten","es":"Gestionar llamadas entrantes","fr":"Gérer les appels entrants","pt":"Gerenciar chamadas recebidas","ru":"Управление входящими вызовами"},
    "gelen aramalari yonetme":{"en":"Manage incoming calls","de":"Eingehende Anrufe verwalten","es":"Gestionar llamadas entrantes","fr":"Gérer les appels entrants","pt":"Gerenciar chamadas recebidas","ru":"Управление входящими вызовами"},
    "bluetooth kulaklık ile eşleşme":{"en":"Bluetooth headphone pairing","de":"Bluetooth-Kopfhörer-Kopplung","es":"Emparejamiento con auriculares Bluetooth","fr":"Appairage casque Bluetooth","pt":"Pareamento com fones Bluetooth","ru":"Сопряжение с Bluetooth-наушниками"},
    "bluetooth kulaklik ile eslesme":{"en":"Bluetooth headphone pairing","de":"Bluetooth-Kopfhörer-Kopplung","es":"Emparejamiento con auriculares Bluetooth","fr":"Appairage casque Bluetooth","pt":"Pareamento com fones Bluetooth","ru":"Сопряжение с Bluetooth-наушниками"},
    "bas konuş (walkie-talkie)":{"en":"Walkie-Talkie","de":"Walkie-Talkie","es":"Walkie-Talkie","fr":"Walkie-Talkie","pt":"Walkie-Talkie","ru":"Walkie-Talkie"},
    "bas konus (walkie-talkie)":{"en":"Walkie-Talkie","de":"Walkie-Talkie","es":"Walkie-Talkie","fr":"Walkie-Talkie","pt":"Walkie-Talkie","ru":"Walkie-Talkie"},
    "el hareketleri ile cihaz kontrolü":{"en":"Hand-gesture device control","de":"Gerätesteuerung per Handgeste","es":"Control del dispositivo con gestos manuales","fr":"Contrôle de l'appareil par gestes de la main","pt":"Controle do dispositivo por gestos","ru":"Управление устройством жестами руки"},
    "el hareketleri ile cihaz kontrolu":{"en":"Hand-gesture device control","de":"Gerätesteuerung per Handgeste","es":"Control del dispositivo con gestos manuales","fr":"Contrôle de l'appareil par gestes de la main","pt":"Controle do dispositivo por gestos","ru":"Управление устройством жестами руки"},
    "gelgit grafiği":       {"en":"Tide chart","de":"Gezeitendiagramm","es":"Gráfico de mareas","fr":"Graphique des marées","pt":"Tabela de marés","ru":"График приливов"},
    "gelgit grafigi":       {"en":"Tide chart","de":"Gezeitendiagramm","es":"Gráfico de mareas","fr":"Graphique des marées","pt":"Tabela de marés","ru":"График приливов"},
    "güç tasarruf modu":    {"en":"Power-saving mode","de":"Energiesparmodus","es":"Modo de ahorro de energía","fr":"Mode économie d'énergie","pt":"Modo de economia de energia","ru":"Режим энергосбережения"},
    "guc tasarruf modu":    {"en":"Power-saving mode","de":"Energiesparmodus","es":"Modo de ahorro de energía","fr":"Mode économie d'énergie","pt":"Modo de economia de energia","ru":"Режим энергосбережения"},
    "internet radyo":       {"en":"Internet radio","de":"Internetradio","es":"Radio por Internet","fr":"Radio Internet","pt":"Rádio pela Internet","ru":"Интернет-радио"},
    "i̇nternet radyo":       {"en":"Internet radio","de":"Internetradio","es":"Radio por Internet","fr":"Radio Internet","pt":"Rádio pela Internet","ru":"Интернет-радио"},
    "rahatsız etmeyin modu":{"en":"Do Not Disturb mode","de":"Nicht-stören-Modus","es":"Modo No molestar","fr":"Mode Ne pas déranger","pt":"Modo Não perturbar","ru":"Режим «Не беспокоить»"},
    "rahatsiz etmeyin modu":{"en":"Do Not Disturb mode","de":"Nicht-stören-Modus","es":"Modo No molestar","fr":"Mode Ne pas déranger","pt":"Modo Não perturbar","ru":"Режим «Не беспокоить»"},
    "ses ile komut verme":  {"en":"Voice command","de":"Sprachbefehl","es":"Comando por voz","fr":"Commande vocale","pt":"Comando por voz","ru":"Голосовая команда"},
    "ses kaydı":            {"en":"Voice recording","de":"Sprachaufnahme","es":"Grabación de voz","fr":"Enregistrement vocal","pt":"Gravação de voz","ru":"Голосовая запись"},
    "ses kaydi":            {"en":"Voice recording","de":"Sprachaufnahme","es":"Grabación de voz","fr":"Enregistrement vocal","pt":"Gravação de voz","ru":"Голосовая запись"},
    "sesli not (voice memo)":{"en":"Voice Memo","de":"Sprachnotiz","es":"Memo de voz","fr":"Mémo vocal","pt":"Memo de voz","ru":"Голосовая заметка"},
    "ultra geniş bant (uwb)":{"en":"Ultra-Wideband (UWB)","de":"Ultra-Breitband (UWB)","es":"Banda Ultra Ancha (UWB)","fr":"Bande ultra-large (UWB)","pt":"Banda ultra-larga (UWB)","ru":"Сверхширокополосный (UWB)"},
    "ultra genis bant (uwb)":{"en":"Ultra-Wideband (UWB)","de":"Ultra-Breitband (UWB)","es":"Banda Ultra Ancha (UWB)","fr":"Bande ultra-large (UWB)","pt":"Banda ultra-larga (UWB)","ru":"Сверхширокополосный (UWB)"},
    "web tarayıcı":         {"en":"Web browser","de":"Webbrowser","es":"Navegador web","fr":"Navigateur web","pt":"Navegador web","ru":"Веб-браузер"},
    "web tarayici":         {"en":"Web browser","de":"Webbrowser","es":"Navegador web","fr":"Navigateur web","pt":"Navegador web","ru":"Веб-браузер"},
    # Safety
    "acil durum araması (sos)":{"en":"Emergency SOS","de":"Notruf SOS","es":"SOS de emergencia","fr":"SOS d'urgence","pt":"SOS de emergência","ru":"Экстренный вызов SOS"},
    "acil durum aramasi (sos)":{"en":"Emergency SOS","de":"Notruf SOS","es":"SOS de emergencia","fr":"SOS d'urgence","pt":"SOS de emergência","ru":"Экстренный вызов SOS"},
    "acil durum bilgileri": {"en":"Emergency info","de":"Notfallinformationen","es":"Información de emergencia","fr":"Informations d'urgence","pt":"Informações de emergência","ru":"Сведения о ЧС"},
    "akıllı ev uyumu":      {"en":"Smart Home support","de":"Smart-Home-Unterstützung","es":"Compatibilidad con Smart Home","fr":"Compatibilité maison connectée","pt":"Suporte para Casa Inteligente","ru":"Поддержка умного дома"},
    "akilli ev uyumu":      {"en":"Smart Home support","de":"Smart-Home-Unterstützung","es":"Compatibilidad con Smart Home","fr":"Compatibilité maison connectée","pt":"Suporte para Casa Inteligente","ru":"Поддержка умного дома"},
    "geriye dönük konum takibi":{"en":"Backtrack","de":"Rückverfolgung","es":"Seguimiento de regreso","fr":"Itinéraire retour","pt":"Rastrear retorno","ru":"Обратный маршрут"},
    "geriye donuk konum takibi":{"en":"Backtrack","de":"Rückverfolgung","es":"Seguimiento de regreso","fr":"Itinéraire retour","pt":"Rastrear retorno","ru":"Обратный маршрут"},
    "uv indeksi":           {"en":"UV index","de":"UV-Index","es":"Índice UV","fr":"Indice UV","pt":"Índice UV","ru":"УФ-индекс"},
    "uv i̇ndeksi":           {"en":"UV index","de":"UV-Index","es":"Índice UV","fr":"Indice UV","pt":"Índice UV","ru":"УФ-индекс"},
    # Health (exact Epey forms)
    "nabız (kalp atış hızı) monitörü":{"en":"Heart-rate monitor","de":"Herzfrequenz-Monitor","es":"Monitor de ritmo cardíaco","fr":"Moniteur de fréquence cardiaque","pt":"Monitor de frequência cardíaca","ru":"Пульсометр"},
    "nabiz (kalp atis hizi) monitoru":{"en":"Heart-rate monitor","de":"Herzfrequenz-Monitor","es":"Monitor de ritmo cardíaco","fr":"Moniteur de fréquence cardiaque","pt":"Monitor de frequência cardíaca","ru":"Пульсометр"},
    "kandaki oksijen seviyesi (spo2) monitörü":{"en":"Blood oxygen monitor (SpO2)","de":"Blutsauerstoff-Monitor (SpO2)","es":"Monitor de oxígeno en sangre (SpO2)","fr":"Moniteur d'oxygène sanguin (SpO2)","pt":"Monitor de oxigênio no sangue (SpO2)","ru":"Монитор кислорода в крови (SpO2)"},
    "kandaki oksijen seviyesi (spo2) monitoru":{"en":"Blood oxygen monitor (SpO2)","de":"Blutsauerstoff-Monitor (SpO2)","es":"Monitor de oxígeno en sangre (SpO2)","fr":"Moniteur d'oxygène sanguin (SpO2)","pt":"Monitor de oxigênio no sangue (SpO2)","ru":"Монитор кислорода в крови (SpO2)"},
    "kadın sağlığı takipçisi":{"en":"Women's health tracker","de":"Frauengesundheit-Tracker","es":"Seguidor de salud femenina","fr":"Suivi de santé féminine","pt":"Monitor de saúde feminina","ru":"Трекер женского здоровья"},
    "kadin sagligi takipcisi":{"en":"Women's health tracker","de":"Frauengesundheit-Tracker","es":"Seguidor de salud femenina","fr":"Suivi de santé féminine","pt":"Monitor de saúde feminina","ru":"Трекер женского здоровья"},
    "stres seviyesi gösterimi":{"en":"Stress-level display","de":"Stresslevel-Anzeige","es":"Indicador de nivel de estrés","fr":"Affichage du niveau de stress","pt":"Exibição do nível de estresse","ru":"Индикатор уровня стресса"},
    "stres seviyesi gosterimi":{"en":"Stress-level display","de":"Stresslevel-Anzeige","es":"Indicador de nivel de estrés","fr":"Affichage du niveau de stress","pt":"Exibição do nível de estresse","ru":"Индикатор уровня стресса"},
    "elektriksel kalp monitörü (ekg/ecg)":{"en":"Electrocardiogram (ECG)","de":"Elektrokardiogramm (EKG)","es":"Electrocardiograma (ECG)","fr":"Électrocardiogramme (ECG)","pt":"Eletrocardiograma (ECG)","ru":"Электрокардиограмма (ЭКГ)"},
    "elektriksel kalp monitoru (ekg/ecg)":{"en":"Electrocardiogram (ECG)","de":"Elektrokardiogramm (EKG)","es":"Electrocardiograma (ECG)","fr":"Électrocardiogramme (ECG)","pt":"Eletrocardiograma (ECG)","ru":"Электрокардиограмма (ЭКГ)"},
    "vücut ateş ölçer":     {"en":"Body temperature sensor","de":"Körpertemperatursensor","es":"Sensor de temperatura corporal","fr":"Capteur de température corporelle","pt":"Sensor de temperatura corporal","ru":"Датчик температуры тела"},
    "vucut ates olcer":     {"en":"Body temperature sensor","de":"Körpertemperatursensor","es":"Sensor de temperatura corporal","fr":"Capteur de température corporelle","pt":"Sensor de temperatura corporal","ru":"Датчик температуры тела"},
    "hiper tansiyon bildirimi":{"en":"Hypertension notification","de":"Bluthochdruck-Hinweis","es":"Aviso de hipertensión","fr":"Alerte d'hypertension","pt":"Aviso de hipertensão","ru":"Уведомление о гипертонии"},
    "tıbbi kimlik bilgileri":{"en":"Medical ID","de":"Medizinische ID","es":"ID médico","fr":"ID médical","pt":"ID médico","ru":"Медицинский ID"},
    "tibbi kimlik bilgileri":{"en":"Medical ID","de":"Medizinische ID","es":"ID médico","fr":"ID médical","pt":"ID médico","ru":"Медицинский ID"},
    "sağlık tavsiyesi":     {"en":"Health advice","de":"Gesundheitstipps","es":"Consejos de salud","fr":"Conseils santé","pt":"Conselhos de saúde","ru":"Советы по здоровью"},
    "saglik tavsiyesi":     {"en":"Health advice","de":"Gesundheitstipps","es":"Consejos de salud","fr":"Conseils santé","pt":"Conselhos de saúde","ru":"Советы по здоровью"},
    # Sports
    "akıllı koç":           {"en":"Smart coach","de":"Smarter Coach","es":"Entrenador inteligente","fr":"Coach intelligent","pt":"Treinador inteligente","ru":"Умный тренер"},
    "akilli koc":           {"en":"Smart coach","de":"Smarter Coach","es":"Entrenador inteligente","fr":"Coach intelligent","pt":"Treinador inteligente","ru":"Умный тренер"},
    "deniz suyu sıcaklığı bilgileri":{"en":"Sea water temperature info","de":"Meereswassertemperatur-Info","es":"Información de temperatura del mar","fr":"Infos température de l'eau de mer","pt":"Informações da temperatura do mar","ru":"Информация о температуре морской воды"},
    "deniz suyu sicakligi bilgileri":{"en":"Sea water temperature info","de":"Meereswassertemperatur-Info","es":"Información de temperatura del mar","fr":"Infos température de l'eau de mer","pt":"Informações da temperatura do mar","ru":"Информация о температуре морской воды"},
    "hız ölçer":            {"en":"Speedometer","de":"Geschwindigkeitsmesser","es":"Velocímetro","fr":"Compteur de vitesse","pt":"Velocímetro","ru":"Спидометр"},
    "hiz olcer":            {"en":"Speedometer","de":"Geschwindigkeitsmesser","es":"Velocímetro","fr":"Compteur de vitesse","pt":"Velocímetro","ru":"Спидометр"},
    "rota (parkur) takibi": {"en":"Route tracking","de":"Streckenverfolgung","es":"Seguimiento de ruta","fr":"Suivi d'itinéraire","pt":"Rastreamento de rota","ru":"Отслеживание маршрута"},
    "rüzgar bilgileri":     {"en":"Wind info","de":"Windinformationen","es":"Información del viento","fr":"Infos vent","pt":"Informações do vento","ru":"Информация о ветре"},
    "ruzgar bilgileri":     {"en":"Wind info","de":"Windinformationen","es":"Información del viento","fr":"Infos vent","pt":"Informações do vento","ru":"Информация о ветре"},
    "sanal antreman partneri":{"en":"Virtual training partner","de":"Virtueller Trainingspartner","es":"Compañero de entrenamiento virtual","fr":"Partenaire d'entraînement virtuel","pt":"Parceiro de treino virtual","ru":"Виртуальный партнёр по тренировкам"},
    "merdiven tırmanma":    {"en":"Stair climbing","de":"Treppensteigen","es":"Subir escaleras","fr":"Montée d'escaliers","pt":"Subir escadas","ru":"Подъём по лестнице"},
    "merdiven tirmanma":    {"en":"Stair climbing","de":"Treppensteigen","es":"Subir escaleras","fr":"Montée d'escaliers","pt":"Subir escadas","ru":"Подъём по лестнице"},
    "kuvvet egzersizleri":  {"en":"Strength exercises","de":"Kraftübungen","es":"Ejercicios de fuerza","fr":"Exercices de force","pt":"Exercícios de força","ru":"Силовые упражнения"},
    # Chipset / processor compound
    "yonga seti (chipset)": {"en":"Chipset","de":"Chipsatz","es":"Chipset","fr":"Chipset","pt":"Chipset","ru":"Чипсет"},
    "cpu mimarisi":         {"en":"CPU architecture","de":"CPU-Architektur","es":"Arquitectura de CPU","fr":"Architecture CPU","pt":"Arquitetura de CPU","ru":"Архитектура CPU"},
    "cpu çekirdeği":        {"en":"CPU cores","de":"CPU-Kerne","es":"Núcleos de CPU","fr":"Cœurs CPU","pt":"Núcleos de CPU","ru":"Ядра CPU"},
    "cpu cekirdegi":        {"en":"CPU cores","de":"CPU-Kerne","es":"Núcleos de CPU","fr":"Cœurs CPU","pt":"Núcleos de CPU","ru":"Ядра CPU"},
    "grafik işlemci (gpu)": {"en":"GPU","de":"GPU","es":"GPU","fr":"GPU","pt":"GPU","ru":"GPU"},
    "grafik islemci (gpu)": {"en":"GPU","de":"GPU","es":"GPU","fr":"GPU","pt":"GPU","ru":"GPU"},
    "yapay zeka işlemcisi (npu)":{"en":"AI processor (NPU)","de":"KI-Prozessor (NPU)","es":"Procesador IA (NPU)","fr":"Processeur IA (NPU)","pt":"Processador de IA (NPU)","ru":"ИИ-процессор (NPU)"},
    "yapay zeka islemcisi (npu)":{"en":"AI processor (NPU)","de":"KI-Prozessor (NPU)","es":"Procesador IA (NPU)","fr":"Processeur IA (NPU)","pt":"Processador de IA (NPU)","ru":"ИИ-процессор (NPU)"},
    "apple neural engine (ane)":{"en":"Apple Neural Engine (ANE)","de":"Apple Neural Engine (ANE)","es":"Apple Neural Engine (ANE)","fr":"Apple Neural Engine (ANE)","pt":"Apple Neural Engine (ANE)","ru":"Apple Neural Engine (ANE)"},
    "bellek (ram)":         {"en":"Memory (RAM)","de":"Speicher (RAM)","es":"Memoria (RAM)","fr":"Mémoire (RAM)","pt":"Memória (RAM)","ru":"Память (ОЗУ)"},
    "dahili depolama":      {"en":"Internal storage","de":"Interner Speicher","es":"Almacenamiento interno","fr":"Stockage interne","pt":"Armazenamento interno","ru":"Внутренняя память"},
    # Battery / charging values
    "lithium ion":          {"en":"Lithium-ion","de":"Lithium-Ionen","es":"Iones de litio","fr":"Lithium-ion","pt":"Íons de lítio","ru":"Литий-ионный"},
    "lithium-ion":          {"en":"Lithium-ion","de":"Lithium-Ionen","es":"Iones de litio","fr":"Lithium-ion","pt":"Íons de lítio","ru":"Литий-ионный"},
    "ortalama kullanımda batarya ömrü":{"en":"Average battery life","de":"Durchschnittliche Akkulaufzeit","es":"Duración media de batería","fr":"Autonomie moyenne","pt":"Duração média da bateria","ru":"Средний срок работы аккумулятора"},
    "ortalama kullanimda batarya omru":{"en":"Average battery life","de":"Durchschnittliche Akkulaufzeit","es":"Duración media de batería","fr":"Autonomie moyenne","pt":"Duração média da bateria","ru":"Средний срок работы аккумулятора"},
    "az kullanımda batarya ömrü":{"en":"Low-use battery life","de":"Akkulaufzeit bei geringer Nutzung","es":"Duración con uso bajo","fr":"Autonomie en usage faible","pt":"Duração com uso baixo","ru":"Срок работы при низкой нагрузке"},
    "az kullanimda batarya omru":{"en":"Low-use battery life","de":"Akkulaufzeit bei geringer Nutzung","es":"Duración con uso bajo","fr":"Autonomie en usage faible","pt":"Duração com uso baixo","ru":"Срок работы при низкой нагрузке"},
    "batarya dolum süresi": {"en":"Battery charging time","de":"Ladezeit","es":"Tiempo de carga","fr":"Temps de charge","pt":"Tempo de carregamento","ru":"Время зарядки"},
    "batarya dolum suresi": {"en":"Battery charging time","de":"Ladezeit","es":"Tiempo de carga","fr":"Temps de charge","pt":"Tempo de carregamento","ru":"Время зарядки"},
    "şarj biçimi":          {"en":"Charging type","de":"Ladeart","es":"Tipo de carga","fr":"Type de charge","pt":"Tipo de carregamento","ru":"Тип зарядки"},
    "sarj bicimi":          {"en":"Charging type","de":"Ladeart","es":"Tipo de carga","fr":"Type de charge","pt":"Tipo de carregamento","ru":"Тип зарядки"},
    "24 sa":                {"en":"24 hours","de":"24 Stunden","es":"24 horas","fr":"24 heures","pt":"24 horas","ru":"24 часа"},
    "60 dk":                {"en":"60 minutes","de":"60 Minuten","es":"60 minutos","fr":"60 minutes","pt":"60 minutos","ru":"60 минут"},
    # Section headers
    "ekran özellikleri":    {"en":"Display features","de":"Bildschirmmerkmale","es":"Características de pantalla","fr":"Caractéristiques de l'écran","pt":"Características da tela","ru":"Характеристики экрана"},
    "ekran ozellikleri":    {"en":"Display features","de":"Bildschirmmerkmale","es":"Características de pantalla","fr":"Caractéristiques de l'écran","pt":"Características da tela","ru":"Характеристики экрана"},
    "ekran çözünürlüğü":    {"en":"Display resolution","de":"Bildschirmauflösung","es":"Resolución de pantalla","fr":"Résolution de l'écran","pt":"Resolução da tela","ru":"Разрешение экрана"},
    "ekran cozunurlugu":    {"en":"Display resolution","de":"Bildschirmauflösung","es":"Resolución de pantalla","fr":"Résolution de l'écran","pt":"Resolução da tela","ru":"Разрешение экрана"},
    "piksel yoğunluğu":     {"en":"Pixel density","de":"Pixeldichte","es":"Densidad de píxeles","fr":"Densité de pixels","pt":"Densidade de pixels","ru":"Плотность пикселей"},
    "piksel yogunlugu":     {"en":"Pixel density","de":"Pixeldichte","es":"Densidad de píxeles","fr":"Densité de pixels","pt":"Densidade de pixels","ru":"Плотность пикселей"},
    "azami parlaklık":      {"en":"Max brightness","de":"Maximale Helligkeit","es":"Brillo máximo","fr":"Luminosité maximale","pt":"Brilho máximo","ru":"Максимальная яркость"},
    "azami parlaklik":      {"en":"Max brightness","de":"Maximale Helligkeit","es":"Brillo máximo","fr":"Luminosité maximale","pt":"Brilho máximo","ru":"Максимальная яркость"},
    "ekran renk sayısı":    {"en":"Display color count","de":"Bildschirmfarben","es":"Número de colores de pantalla","fr":"Nombre de couleurs d'écran","pt":"Número de cores da tela","ru":"Количество цветов экрана"},
    "ekran renk sayisi":    {"en":"Display color count","de":"Bildschirmfarben","es":"Número de colores de pantalla","fr":"Nombre de couleurs d'écran","pt":"Número de cores da tela","ru":"Количество цветов экрана"},
    "ekran teknolojisi":    {"en":"Display technology","de":"Bildschirmtechnologie","es":"Tecnología de pantalla","fr":"Technologie d'écran","pt":"Tecnologia da tela","ru":"Технология экрана"},
    "ekran şekli":          {"en":"Display shape","de":"Bildschirmform","es":"Forma de pantalla","fr":"Forme de l'écran","pt":"Formato da tela","ru":"Форма экрана"},
    "ekran sekli":          {"en":"Display shape","de":"Bildschirmform","es":"Forma de pantalla","fr":"Forme de l'écran","pt":"Formato da tela","ru":"Форма экрана"},
    "gövde ağırlık":        {"en":"Body weight","de":"Körpergewicht","es":"Peso del cuerpo","fr":"Poids du corps","pt":"Peso do corpo","ru":"Вес корпуса"},
    "govde agirlik":        {"en":"Body weight","de":"Körpergewicht","es":"Peso del cuerpo","fr":"Poids du corps","pt":"Peso do corpo","ru":"Вес корпуса"},
    "cihaz boyu":           {"en":"Device height","de":"Gerätehöhe","es":"Altura del dispositivo","fr":"Hauteur de l'appareil","pt":"Altura do dispositivo","ru":"Высота устройства"},
    "cihaz eni":            {"en":"Device width","de":"Gerätebreite","es":"Ancho del dispositivo","fr":"Largeur de l'appareil","pt":"Largura do dispositivo","ru":"Ширина устройства"},
    "cihaz kalınlığı":      {"en":"Device thickness","de":"Gerätedicke","es":"Espesor del dispositivo","fr":"Épaisseur de l'appareil","pt":"Espessura do dispositivo","ru":"Толщина устройства"},
    "cihaz kalinligi":      {"en":"Device thickness","de":"Gerätedicke","es":"Espesor del dispositivo","fr":"Épaisseur de l'appareil","pt":"Espessura do dispositivo","ru":"Толщина устройства"},
    "cihaz işletim sistemi":{"en":"Device OS","de":"Geräte-Betriebssystem","es":"Sistema operativo del dispositivo","fr":"Système d'exploitation","pt":"Sistema operacional do dispositivo","ru":"ОС устройства"},
    "cihaz isletim sistemi":{"en":"Device OS","de":"Geräte-Betriebssystem","es":"Sistema operativo del dispositivo","fr":"Système d'exploitation","pt":"Sistema operacional do dispositivo","ru":"ОС устройства"},
    "işletim sistemi versiyonu":{"en":"OS version","de":"Betriebssystemversion","es":"Versión del SO","fr":"Version du système","pt":"Versão do SO","ru":"Версия ОС"},
    "isletim sistemi versiyonu":{"en":"OS version","de":"Betriebssystemversion","es":"Versión del SO","fr":"Version du système","pt":"Versão do SO","ru":"Версия ОС"},
    "uyumlu işletim sistemi":{"en":"Compatible OS","de":"Kompatibles Betriebssystem","es":"SO compatible","fr":"Système compatible","pt":"SO compatível","ru":"Совместимая ОС"},
    "uyumlu isletim sistemi":{"en":"Compatible OS","de":"Kompatibles Betriebssystem","es":"SO compatible","fr":"Système compatible","pt":"SO compatível","ru":"Совместимая ОС"},
    "mikrofon özellikleri": {"en":"Microphone features","de":"Mikrofon-Eigenschaften","es":"Características del micrófono","fr":"Propriétés du microphone","pt":"Características do microfone","ru":"Особенности микрофона"},
    "mikrofon ozellikleri": {"en":"Microphone features","de":"Mikrofon-Eigenschaften","es":"Características del micrófono","fr":"Propriétés du microphone","pt":"Características do microfone","ru":"Особенности микрофона"},
    "telefon görüşmesi şekli":{"en":"Phone call type","de":"Telefongesprächs-Art","es":"Tipo de llamada","fr":"Type d'appel téléphonique","pt":"Tipo de chamada","ru":"Тип телефонного звонка"},
    "telefon gorusmesi sekli":{"en":"Phone call type","de":"Telefongesprächs-Art","es":"Tipo de llamada","fr":"Type d'appel téléphonique","pt":"Tipo de chamada","ru":"Тип телефонного звонка"},
    "toza dayanıklılık":    {"en":"Dust resistance","de":"Staubbeständigkeit","es":"Resistencia al polvo","fr":"Résistance à la poussière","pt":"Resistência à poeira","ru":"Пылестойкость"},
    "toza dayaniklilik":    {"en":"Dust resistance","de":"Staubbeständigkeit","es":"Resistencia al polvo","fr":"Résistance à la poussière","pt":"Resistência à poeira","ru":"Пылестойкость"},
    "toza dayanıklılık özellikleri":{"en":"Dust-resistance features","de":"Staubbeständigkeits-Eigenschaften","es":"Características de resistencia al polvo","fr":"Caractéristiques de résistance à la poussière","pt":"Características de resistência a poeira","ru":"Особенности пылестойкости"},
    "toza dayaniklilik ozellikleri":{"en":"Dust-resistance features","de":"Staubbeständigkeits-Eigenschaften","es":"Características de resistencia al polvo","fr":"Caractéristiques de résistance à la poussière","pt":"Características de resistência a poeira","ru":"Особенности пылестойкости"},
    "suya dayanıklılık":    {"en":"Water resistance","de":"Wasserbeständigkeit","es":"Resistencia al agua","fr":"Résistance à l'eau","pt":"Resistência à água","ru":"Водостойкость"},
    "suya dayaniklilik":    {"en":"Water resistance","de":"Wasserbeständigkeit","es":"Resistencia al agua","fr":"Résistance à l'eau","pt":"Resistência à água","ru":"Водостойкость"},
    "suya dayanıklılık özellikleri":{"en":"Water-resistance features","de":"Wasserdichte Eigenschaften","es":"Características de resistencia al agua","fr":"Caractéristiques de résistance à l'eau","pt":"Características de resistência a água","ru":"Особенности водостойкости"},
    "suya dayaniklilik ozellikleri":{"en":"Water-resistance features","de":"Wasserdichte Eigenschaften","es":"Características de resistencia al agua","fr":"Caractéristiques de résistance à l'eau","pt":"Características de resistência a água","ru":"Особенности водостойкости"},
    "dil desteği":          {"en":"Language support","de":"Sprachunterstützung","es":"Soporte de idiomas","fr":"Support linguistique","pt":"Suporte de idiomas","ru":"Поддержка языков"},
    "dil destegi":          {"en":"Language support","de":"Sprachunterstützung","es":"Soporte de idiomas","fr":"Support linguistique","pt":"Suporte de idiomas","ru":"Поддержка языков"},
    "servis ve uygulamalar":{"en":"Services & apps","de":"Dienste und Anwendungen","es":"Servicios y aplicaciones","fr":"Services et applications","pt":"Serviços e aplicativos","ru":"Сервисы и приложения"},
    "güvenlik ve koruma":   {"en":"Safety & security","de":"Sicherheit und Schutz","es":"Seguridad y protección","fr":"Sécurité et protection","pt":"Segurança e proteção","ru":"Безопасность и защита"},
    "guvenlik ve koruma":   {"en":"Safety & security","de":"Sicherheit und Schutz","es":"Seguridad y protección","fr":"Sécurité et protection","pt":"Segurança e proteção","ru":"Безопасность и защита"},
    "sağlık ve yaşam":      {"en":"Health & life","de":"Gesundheit und Leben","es":"Salud y vida","fr":"Santé et vie","pt":"Saúde e vida","ru":"Здоровье и жизнь"},
    "saglik ve yasam":      {"en":"Health & life","de":"Gesundheit und Leben","es":"Salud y vida","fr":"Santé et vie","pt":"Saúde e vida","ru":"Здоровье и жизнь"},
    "spor ve aktivite":     {"en":"Sport & activity","de":"Sport und Aktivität","es":"Deporte y actividad","fr":"Sport et activité","pt":"Esporte e atividade","ru":"Спорт и активность"},
    "desteklenen aktiviteler":{"en":"Supported activities","de":"Unterstützte Aktivitäten","es":"Actividades compatibles","fr":"Activités prises en charge","pt":"Atividades suportadas","ru":"Поддерживаемые активности"},
    "diğer sensörler":      {"en":"Other sensors","de":"Andere Sensoren","es":"Otros sensores","fr":"Autres capteurs","pt":"Outros sensores","ru":"Другие датчики"},
    "diger sensorler":      {"en":"Other sensors","de":"Andere Sensoren","es":"Otros sensores","fr":"Autres capteurs","pt":"Outros sensores","ru":"Другие датчики"},
    "batarya özellikleri":  {"en":"Battery features","de":"Akku-Eigenschaften","es":"Características de batería","fr":"Caractéristiques de batterie","pt":"Características da bateria","ru":"Характеристики батареи"},
    "batarya ozellikleri":  {"en":"Battery features","de":"Akku-Eigenschaften","es":"Características de batería","fr":"Caractéristiques de batterie","pt":"Características da bateria","ru":"Характеристики батареи"},
    "batarya teknolojisi":  {"en":"Battery technology","de":"Akkutechnologie","es":"Tecnología de batería","fr":"Technologie de batterie","pt":"Tecnologia da bateria","ru":"Технология аккумулятора"},
    "konum bilgisi":        {"en":"Location info","de":"Standortinformation","es":"Información de ubicación","fr":"Informations de localisation","pt":"Informações de localização","ru":"Информация о местоположении"},
    "konum bilgisi özellikleri":{"en":"Location features","de":"Standort-Eigenschaften","es":"Características de ubicación","fr":"Caractéristiques de localisation","pt":"Recursos de localização","ru":"Особенности местоположения"},
    "konum bilgisi ozellikleri":{"en":"Location features","de":"Standort-Eigenschaften","es":"Características de ubicación","fr":"Caractéristiques de localisation","pt":"Recursos de localização","ru":"Особенности местоположения"},
    "sim desteği":          {"en":"SIM support","de":"SIM-Unterstützung","es":"Compatibilidad SIM","fr":"Prise en charge SIM","pt":"Suporte SIM","ru":"Поддержка SIM"},
    "sim destegi":          {"en":"SIM support","de":"SIM-Unterstützung","es":"Compatibilidad SIM","fr":"Prise en charge SIM","pt":"Suporte SIM","ru":"Поддержка SIM"},
    "hafıza kartı desteği": {"en":"Memory card support","de":"Speicherkarten-Unterstützung","es":"Compatibilidad con tarjeta de memoria","fr":"Prise en charge carte mémoire","pt":"Suporte para cartão de memória","ru":"Поддержка карт памяти"},
    "hafiza karti destegi": {"en":"Memory card support","de":"Speicherkarten-Unterstützung","es":"Compatibilidad con tarjeta de memoria","fr":"Prise en charge carte mémoire","pt":"Suporte para cartão de memória","ru":"Поддержка карт памяти"},
    "wi-fi özellikleri":    {"en":"Wi-Fi features","de":"Wi-Fi-Funktionen","es":"Características Wi-Fi","fr":"Caractéristiques Wi-Fi","pt":"Recursos de Wi-Fi","ru":"Возможности Wi-Fi"},
    "wi-fi ozellikleri":    {"en":"Wi-Fi features","de":"Wi-Fi-Funktionen","es":"Características Wi-Fi","fr":"Caractéristiques Wi-Fi","pt":"Recursos de Wi-Fi","ru":"Возможности Wi-Fi"},
    "bluetooth versiyonu":  {"en":"Bluetooth version","de":"Bluetooth-Version","es":"Versión de Bluetooth","fr":"Version Bluetooth","pt":"Versão Bluetooth","ru":"Версия Bluetooth"},
    "ürün ailesi":          {"en":"Product family","de":"Produktfamilie","es":"Familia de productos","fr":"Famille de produits","pt":"Família de produtos","ru":"Семейство продуктов"},
    "urun ailesi":          {"en":"Product family","de":"Produktfamilie","es":"Familia de productos","fr":"Famille de produits","pt":"Família de produtos","ru":"Семейство продуктов"},
    "çıkış yılı":           {"en":"Release year","de":"Erscheinungsjahr","es":"Año de lanzamiento","fr":"Année de sortie","pt":"Ano de lançamento","ru":"Год выпуска"},
    "cikis yili":           {"en":"Release year","de":"Erscheinungsjahr","es":"Año de lanzamiento","fr":"Année de sortie","pt":"Ano de lançamento","ru":"Год выпуска"},
    "türü":                 {"en":"Type","de":"Typ","es":"Tipo","fr":"Type","pt":"Tipo","ru":"Тип"},
    "seri":                 {"en":"Series","de":"Serie","es":"Serie","fr":"Série","pt":"Série","ru":"Серия"},
    # ─── Round 4: residue from all-categories sweep ────────────────────
    # Yonga Seti compounds (anakart)
    "yonga seti üreticisi": {"en":"Chipset manufacturer","de":"Chipsatz-Hersteller","es":"Fabricante del chipset","fr":"Fabricant du chipset","pt":"Fabricante do chipset","ru":"Производитель чипсета"},
    "yonga seti ureticisi": {"en":"Chipset manufacturer","de":"Chipsatz-Hersteller","es":"Fabricante del chipset","fr":"Fabricant du chipset","pt":"Fabricante do chipset","ru":"Производитель чипсета"},
    "yonga seti modeli":    {"en":"Chipset model","de":"Chipsatz-Modell","es":"Modelo del chipset","fr":"Modèle du chipset","pt":"Modelo do chipset","ru":"Модель чипсета"},
    "yonga seti çıkış yılı":{"en":"Chipset release year","de":"Chipsatz-Erscheinungsjahr","es":"Año de lanzamiento del chipset","fr":"Année de sortie du chipset","pt":"Ano de lançamento do chipset","ru":"Год выпуска чипсета"},
    "yonga seti cikis yili":{"en":"Chipset release year","de":"Chipsatz-Erscheinungsjahr","es":"Año de lanzamiento del chipset","fr":"Année de sortie du chipset","pt":"Ano de lançamento do chipset","ru":"Год выпуска чипсета"},
    "işlemci / yonga seti": {"en":"Processor / Chipset","de":"Prozessor / Chipsatz","es":"Procesador / Chipset","fr":"Processeur / Chipset","pt":"Processador / Chipset","ru":"Процессор / Чипсет"},
    "islemci / yonga seti": {"en":"Processor / Chipset","de":"Prozessor / Chipsatz","es":"Procesador / Chipset","fr":"Processeur / Chipset","pt":"Processador / Chipset","ru":"Процессор / Чипсет"},
    "nand yongası":         {"en":"NAND chip","de":"NAND-Chip","es":"Chip NAND","fr":"Puce NAND","pt":"Chip NAND","ru":"NAND-чип"},
    "nand yongasi":         {"en":"NAND chip","de":"NAND-Chip","es":"Chip NAND","fr":"Puce NAND","pt":"Chip NAND","ru":"NAND-чип"},
    # Tech initialisms / brand names — proper-noun passthrough across 6 langs.
    "netflix":              {"en":"Netflix","de":"Netflix","es":"Netflix","fr":"Netflix","pt":"Netflix","ru":"Netflix"},
    "vulkan":               {"en":"Vulkan","de":"Vulkan","es":"Vulkan","fr":"Vulkan","pt":"Vulkan","ru":"Vulkan"},
    "blackwell":            {"en":"Blackwell","de":"Blackwell","es":"Blackwell","fr":"Blackwell","pt":"Blackwell","ru":"Blackwell"},
    "vrm":                  {"en":"VRM","de":"VRM","es":"VRM","fr":"VRM","pt":"VRM","ru":"VRM"},
    "bds":                  {"en":"BDS","de":"BDS","es":"BDS","fr":"BDS","pt":"BDS","ru":"BDS"},
    "mihc":                 {"en":"MIHC","de":"MIHC","es":"MIHC","fr":"MIHC","pt":"MIHC","ru":"MIHC"},
    "nas":                  {"en":"NAS","de":"NAS","es":"NAS","fr":"NAS","pt":"NAS","ru":"NAS"},
    "vlan":                 {"en":"VLAN","de":"VLAN","es":"VLAN","fr":"VLAN","pt":"VLAN","ru":"VLAN"},
    "pfc":                  {"en":"PFC","de":"PFC","es":"PFC","fr":"PFC","pt":"PFC","ru":"PFC"},
    "ssd":                  {"en":"SSD","de":"SSD","es":"SSD","fr":"SSD","pt":"SSD","ru":"SSD"},
    "nvme":                 {"en":"NVMe","de":"NVMe","es":"NVMe","fr":"NVMe","pt":"NVMe","ru":"NVMe"},
    "udimm":                {"en":"UDIMM","de":"UDIMM","es":"UDIMM","fr":"UDIMM","pt":"UDIMM","ru":"UDIMM"},
    "sodimm":               {"en":"SODIMM","de":"SODIMM","es":"SODIMM","fr":"SODIMM","pt":"SODIMM","ru":"SODIMM"},
    "rdimm":                {"en":"RDIMM","de":"RDIMM","es":"RDIMM","fr":"RDIMM","pt":"RDIMM","ru":"RDIMM"},
    "gif":                  {"en":"GIF","de":"GIF","es":"GIF","fr":"GIF","pt":"GIF","ru":"GIF"},
    "ax3000":               {"en":"AX3000","de":"AX3000","es":"AX3000","fr":"AX3000","pt":"AX3000","ru":"AX3000"},
    "ax1800":               {"en":"AX1800","de":"AX1800","es":"AX1800","fr":"AX1800","pt":"AX1800","ru":"AX1800"},
    "ax5400":               {"en":"AX5400","de":"AX5400","es":"AX5400","fr":"AX5400","pt":"AX5400","ru":"AX5400"},
    "ax6000":               {"en":"AX6000","de":"AX6000","es":"AX6000","fr":"AX6000","pt":"AX6000","ru":"AX6000"},
    "timelapse":            {"en":"TimeLapse","de":"TimeLapse","es":"TimeLapse","fr":"TimeLapse","pt":"TimeLapse","ru":"TimeLapse"},
    "spotlight":            {"en":"Spotlight","de":"Spotlight","es":"Spotlight","fr":"Spotlight","pt":"Spotlight","ru":"Spotlight"},
    "modem":                {"en":"Modem","de":"Modem","es":"Módem","fr":"Modem","pt":"Modem","ru":"Модем"},
    "web":                  {"en":"Web","de":"Web","es":"Web","fr":"Web","pt":"Web","ru":"Web"},
    "stereo":               {"en":"Stereo","de":"Stereo","es":"Estéreo","fr":"Stéréo","pt":"Estéreo","ru":"Стерео"},
    "panorama":             {"en":"Panorama","de":"Panorama","es":"Panorama","fr":"Panorama","pt":"Panorama","ru":"Панорама"},
    # Bulut (cloud)
    "bulut":                {"en":"Cloud","de":"Cloud","es":"Nube","fr":"Cloud","pt":"Nuvem","ru":"Облако"},
    "bulut depolama":       {"en":"Cloud storage","de":"Cloud-Speicher","es":"Almacenamiento en la nube","fr":"Stockage cloud","pt":"Armazenamento em nuvem","ru":"Облачное хранилище"},
    # Photography / camera
    "flaş":                 {"en":"Flash","de":"Blitz","es":"Flash","fr":"Flash","pt":"Flash","ru":"Вспышка"},
    "flas":                 {"en":"Flash","de":"Blitz","es":"Flash","fr":"Flash","pt":"Flash","ru":"Вспышка"},
    "makro (macro) çekim":  {"en":"Macro shooting","de":"Makroaufnahme","es":"Fotografía macro","fr":"Prise de vue macro","pt":"Fotografia macro","ru":"Макросъёмка"},
    "makro (macro) cekim":  {"en":"Macro shooting","de":"Makroaufnahme","es":"Fotografía macro","fr":"Prise de vue macro","pt":"Fotografia macro","ru":"Макросъёмка"},
    "diyafram":             {"en":"Aperture","de":"Blende","es":"Apertura","fr":"Ouverture","pt":"Abertura","ru":"Диафрагма"},
    "fotoğraf çekebilme":   {"en":"Photo capture","de":"Fotoaufnahme","es":"Captura de fotos","fr":"Prise de photo","pt":"Captura de foto","ru":"Съёмка фото"},
    "fotograf cekebilme":   {"en":"Photo capture","de":"Fotoaufnahme","es":"Captura de fotos","fr":"Prise de photo","pt":"Captura de foto","ru":"Съёмка фото"},
    # Sports (watch activities — beyond what we had)
    "tenis":                {"en":"Tennis","de":"Tennis","es":"Tenis","fr":"Tennis","pt":"Tênis","ru":"Теннис"},
    "basketbol":            {"en":"Basketball","de":"Basketball","es":"Baloncesto","fr":"Basketball","pt":"Basquete","ru":"Баскетбол"},
    "futbol":               {"en":"Football","de":"Fußball","es":"Fútbol","fr":"Football","pt":"Futebol","ru":"Футбол"},
    "atlayış":              {"en":"Jumping","de":"Springen","es":"Salto","fr":"Saut","pt":"Salto","ru":"Прыжки"},
    "atlayis":              {"en":"Jumping","de":"Springen","es":"Salto","fr":"Saut","pt":"Salto","ru":"Прыжки"},
    # Smart watch features
    "güneşte görünür":      {"en":"Sunlight-visible","de":"In Sonne ablesbar","es":"Visible al sol","fr":"Visible au soleil","pt":"Visível ao sol","ru":"Виден на солнце"},
    "gunes te gorunur":     {"en":"Sunlight-visible","de":"In Sonne ablesbar","es":"Visible al sol","fr":"Visible au soleil","pt":"Visível ao sol","ru":"Виден на солнце"},
    "sms ile çağrı reddetme":{"en":"Reject calls via SMS","de":"Anrufe per SMS abweisen","es":"Rechazar llamadas por SMS","fr":"Rejeter les appels par SMS","pt":"Rejeitar chamadas por SMS","ru":"Отклонение вызовов через SMS"},
    "sms ile cagri reddetme":{"en":"Reject calls via SMS","de":"Anrufe per SMS abweisen","es":"Rechazar llamadas por SMS","fr":"Rejeter les appels par SMS","pt":"Rejeitar chamadas por SMS","ru":"Отклонение вызовов через SMS"},
    "kandaki oksijen takibi":{"en":"Blood oxygen tracking","de":"Blutsauerstoff-Tracking","es":"Seguimiento de oxígeno en sangre","fr":"Suivi de l'oxygène sanguin","pt":"Monitoramento de oxigênio no sangue","ru":"Мониторинг кислорода в крови"},
    # Drone / robot vacuum / generic
    "engelden kaçınma":     {"en":"Obstacle avoidance","de":"Hindernisvermeidung","es":"Evitación de obstáculos","fr":"Évitement d'obstacles","pt":"Evitar obstáculos","ru":"Объезд препятствий"},
    "engelden kacinma":     {"en":"Obstacle avoidance","de":"Hindernisvermeidung","es":"Evitación de obstáculos","fr":"Évitement d'obstacles","pt":"Evitar obstáculos","ru":"Объезд препятствий"},
    "titreşim engelleme türü":{"en":"Vibration-isolation type","de":"Vibrationsdämpfungstyp","es":"Tipo de aislamiento de vibración","fr":"Type d'isolation des vibrations","pt":"Tipo de isolamento de vibração","ru":"Тип гашения вибрации"},
    "titresim engelleme turu":{"en":"Vibration-isolation type","de":"Vibrationsdämpfungstyp","es":"Tipo de aislamiento de vibración","fr":"Type d'isolation des vibrations","pt":"Tipo de isolamento de vibração","ru":"Тип гашения вибрации"},
    "emiş gücü":            {"en":"Suction power","de":"Saugleistung","es":"Potencia de succión","fr":"Puissance d'aspiration","pt":"Potência de sucção","ru":"Мощность всасывания"},
    "emis gucu":            {"en":"Suction power","de":"Saugleistung","es":"Potencia de succión","fr":"Puissance d'aspiration","pt":"Potência de sucção","ru":"Мощность всасывания"},
    "haritalama yöntemi":   {"en":"Mapping method","de":"Kartierungsmethode","es":"Método de mapeo","fr":"Méthode de cartographie","pt":"Método de mapeamento","ru":"Метод картографирования"},
    "haritalama yontemi":   {"en":"Mapping method","de":"Kartierungsmethode","es":"Método de mapeo","fr":"Méthode de cartographie","pt":"Método de mapeamento","ru":"Метод картографирования"},
    # Modem / router (hüzmeleme = beamforming!)
    "hüzmeleme":            {"en":"Beamforming","de":"Beamforming","es":"Beamforming","fr":"Beamforming","pt":"Beamforming","ru":"Beamforming"},
    "huzmeleme":            {"en":"Beamforming","de":"Beamforming","es":"Beamforming","fr":"Beamforming","pt":"Beamforming","ru":"Beamforming"},
    # Generic UI / orientation
    "yatay":                {"en":"Horizontal","de":"Horizontal","es":"Horizontal","fr":"Horizontal","pt":"Horizontal","ru":"Горизонтальный"},
    "dikey":                {"en":"Vertical","de":"Vertikal","es":"Vertical","fr":"Vertical","pt":"Vertical","ru":"Вертикальный"},
    "kavisli (curved)":     {"en":"Curved","de":"Gebogen","es":"Curvo","fr":"Incurvé","pt":"Curvo","ru":"Изогнутый"},
    "kavisli":              {"en":"Curved","de":"Gebogen","es":"Curvo","fr":"Incurvé","pt":"Curvo","ru":"Изогнутый"},
    # PSU / power
    "sertifika":            {"en":"Certification","de":"Zertifizierung","es":"Certificación","fr":"Certification","pt":"Certificação","ru":"Сертификация"},
    "fazla voltaj koruması":{"en":"Overvoltage protection","de":"Überspannungsschutz","es":"Protección contra sobretensión","fr":"Protection contre les surtensions","pt":"Proteção contra sobretensão","ru":"Защита от перенапряжения"},
    "fazla voltaj korumasi":{"en":"Overvoltage protection","de":"Überspannungsschutz","es":"Protección contra sobretensión","fr":"Protection contre les surtensions","pt":"Proteção contra sobretensão","ru":"Защита от перенапряжения"},
    "akım koruması":        {"en":"Overcurrent protection","de":"Überstromschutz","es":"Protección contra sobrecorriente","fr":"Protection contre les surintensités","pt":"Proteção contra sobrecorrente","ru":"Защита от перегрузки по току"},
    "akim korumasi":        {"en":"Overcurrent protection","de":"Überstromschutz","es":"Protección contra sobrecorriente","fr":"Protection contre les surintensités","pt":"Proteção contra sobrecorrente","ru":"Защита от перегрузки по току"},
    "kısa devre koruması":  {"en":"Short-circuit protection","de":"Kurzschlussschutz","es":"Protección contra cortocircuitos","fr":"Protection contre les courts-circuits","pt":"Proteção contra curto-circuito","ru":"Защита от короткого замыкания"},
    "kisa devre korumasi":  {"en":"Short-circuit protection","de":"Kurzschlussschutz","es":"Protección contra cortocircuitos","fr":"Protection contre les courts-circuits","pt":"Proteção contra curto-circuito","ru":"Защита от короткого замыкания"},
    # Powerbank / accessory
    "tutma askısı":         {"en":"Carrying strap","de":"Tragriemen","es":"Correa de transporte","fr":"Dragonne","pt":"Alça de suporte","ru":"Ремешок для переноски"},
    "tutma askisi":         {"en":"Carrying strap","de":"Tragriemen","es":"Correa de transporte","fr":"Dragonne","pt":"Alça de suporte","ru":"Ремешок для переноски"},
    "depolama":             {"en":"Storage","de":"Speicher","es":"Almacenamiento","fr":"Stockage","pt":"Armazenamento","ru":"Хранилище"},
    "kullanım kılavuzu":    {"en":"User manual","de":"Benutzerhandbuch","es":"Manual del usuario","fr":"Guide d'utilisation","pt":"Manual do usuário","ru":"Руководство пользователя"},
    "kullanim kilavuzu":    {"en":"User manual","de":"Benutzerhandbuch","es":"Manual del usuario","fr":"Guide d'utilisation","pt":"Manual do usuário","ru":"Руководство пользователя"},
    # Headphone polar pattern
    "tek yönlü (cardioid)": {"en":"Cardioid","de":"Niere (Cardioid)","es":"Cardioide","fr":"Cardioïde","pt":"Cardioide","ru":"Кардиоида"},
    "tek yonlu (cardioid)": {"en":"Cardioid","de":"Niere (Cardioid)","es":"Cardioide","fr":"Cardioïde","pt":"Cardioide","ru":"Кардиоида"},
    # CPU primitives
    "çarpan kilidi":        {"en":"Multiplier lock","de":"Multiplikator-Sperre","es":"Bloqueo del multiplicador","fr":"Verrouillage du multiplicateur","pt":"Bloqueio do multiplicador","ru":"Блокировка множителя"},
    "carpan kilidi":        {"en":"Multiplier lock","de":"Multiplikator-Sperre","es":"Bloqueo del multiplicador","fr":"Verrouillage du multiplicateur","pt":"Bloqueio do multiplicador","ru":"Блокировка множителя"},
    "cpu (işlemci)":        {"en":"CPU","de":"CPU","es":"CPU","fr":"CPU","pt":"CPU","ru":"CPU"},
    "cpu (islemci)":        {"en":"CPU","de":"CPU","es":"CPU","fr":"CPU","pt":"CPU","ru":"CPU"},
    # Mic features
    "ses alış yönü":        {"en":"Audio pickup direction","de":"Aufnahmecharakteristik","es":"Patrón polar","fr":"Diagramme polaire","pt":"Padrão polar","ru":"Направленность"},
    "ses alis yonu":        {"en":"Audio pickup direction","de":"Aufnahmecharakteristik","es":"Patrón polar","fr":"Diagramme polaire","pt":"Padrão polar","ru":"Направленность"},
    # Gaming controller
    "kontrolcü üzerinde":   {"en":"On the controller","de":"Auf dem Controller","es":"En el controlador","fr":"Sur le contrôleur","pt":"No controle","ru":"На контроллере"},
    "kontrolcu uzerinde":   {"en":"On the controller","de":"Auf dem Controller","es":"En el controlador","fr":"Sur le contrôleur","pt":"No controle","ru":"На контроллере"},
    "tv kullanımı":         {"en":"TV usage","de":"TV-Nutzung","es":"Uso con TV","fr":"Utilisation TV","pt":"Uso com TV","ru":"Использование с ТВ"},
    "tv kullanimi":         {"en":"TV usage","de":"TV-Nutzung","es":"Uso con TV","fr":"Utilisation TV","pt":"Uso com TV","ru":"Использование с ТВ"},
    "oynarken şarj etme":   {"en":"Charge while playing","de":"Laden während des Spielens","es":"Carga mientras se juega","fr":"Charge pendant le jeu","pt":"Carregamento durante o jogo","ru":"Зарядка во время игры"},
    "oynarken sarj etme":   {"en":"Charge while playing","de":"Laden während des Spielens","es":"Carga mientras se juega","fr":"Charge pendant le jeu","pt":"Carregamento durante o jogo","ru":"Зарядка во время игры"},
    "şarj olma":            {"en":"Chargeable","de":"Aufladbar","es":"Recargable","fr":"Rechargeable","pt":"Recarregável","ru":"Перезаряжаемый"},
    "sarj olma":            {"en":"Chargeable","de":"Aufladbar","es":"Recargable","fr":"Rechargeable","pt":"Recarregável","ru":"Перезаряжаемый"},
    # VR / glasses
    "bağımsız çalışabilme": {"en":"Standalone operation","de":"Eigenständiger Betrieb","es":"Funcionamiento independiente","fr":"Fonctionnement autonome","pt":"Operação autônoma","ru":"Автономная работа"},
    "bagimsiz calisabilme": {"en":"Standalone operation","de":"Eigenständiger Betrieb","es":"Funcionamiento independiente","fr":"Fonctionnement autonome","pt":"Operação autônoma","ru":"Автономная работа"},
    "gözlük ile kullanabilme":{"en":"Glasses-compatible","de":"Brillenkompatibel","es":"Compatible con gafas","fr":"Compatible avec lunettes","pt":"Compatível com óculos","ru":"Совместимо с очками"},
    "gozluk ile kullanabilme":{"en":"Glasses-compatible","de":"Brillenkompatibel","es":"Compatible con gafas","fr":"Compatible avec lunettes","pt":"Compatível com óculos","ru":"Совместимо с очками"},
    "ayarlanabilir":        {"en":"Adjustable","de":"Einstellbar","es":"Ajustable","fr":"Réglable","pt":"Ajustável","ru":"Регулируемый"},
    # Generic accessories / materials
    "kablo":                {"en":"Cable","de":"Kabel","es":"Cable","fr":"Câble","pt":"Cabo","ru":"Кабель"},
    "kablolu kullanabilme": {"en":"Can be used wired","de":"Kabelgebundener Betrieb möglich","es":"Compatible con uso por cable","fr":"Utilisable filaire","pt":"Pode ser usado com fio","ru":"Возможно проводное использование"},
    "duvar":                {"en":"Wall","de":"Wand","es":"Pared","fr":"Mural","pt":"Parede","ru":"Настенный"},
    "malzeme":              {"en":"Material","de":"Material","es":"Material","fr":"Matériau","pt":"Material","ru":"Материал"},
    "bağlantı":             {"en":"Connection","de":"Anschluss","es":"Conexión","fr":"Connexion","pt":"Conexão","ru":"Подключение"},
    "baglanti":             {"en":"Connection","de":"Anschluss","es":"Conexión","fr":"Connexion","pt":"Conexão","ru":"Подключение"},
    "mini":                 {"en":"Mini","de":"Mini","es":"Mini","fr":"Mini","pt":"Mini","ru":"Mini"},
    "ev & ofis":            {"en":"Home & Office","de":"Heim & Büro","es":"Hogar y oficina","fr":"Maison et bureau","pt":"Casa e Escritório","ru":"Дом и офис"},
    # Printer
    "tarayıcı":             {"en":"Scanner","de":"Scanner","es":"Escáner","fr":"Scanner","pt":"Scanner","ru":"Сканер"},
    "tarayici":             {"en":"Scanner","de":"Scanner","es":"Escáner","fr":"Scanner","pt":"Scanner","ru":"Сканер"},
    # Tablet camera aperture compound
    "f/1.8 diyafram":       {"en":"f/1.8 aperture","de":"f/1.8 Blende","es":"f/1.8 apertura","fr":"f/1.8 ouverture","pt":"f/1.8 abertura","ru":"f/1.8 диафрагма"},
    "f/2.0 diyafram":       {"en":"f/2.0 aperture","de":"f/2.0 Blende","es":"f/2.0 apertura","fr":"f/2.0 ouverture","pt":"f/2.0 abertura","ru":"f/2.0 диафрагма"},
    "f/2.2 diyafram":       {"en":"f/2.2 aperture","de":"f/2.2 Blende","es":"f/2.2 apertura","fr":"f/2.2 ouverture","pt":"f/2.2 abertura","ru":"f/2.2 диафрагма"},
    "f/2.4 diyafram":       {"en":"f/2.4 aperture","de":"f/2.4 Blende","es":"f/2.4 apertura","fr":"f/2.4 ouverture","pt":"f/2.4 abertura","ru":"f/2.4 диафрагма"},
    "f/2.8 diyafram":       {"en":"f/2.8 aperture","de":"f/2.8 Blende","es":"f/2.8 apertura","fr":"f/2.8 ouverture","pt":"f/2.8 abertura","ru":"f/2.8 диафрагма"},
    # Battery / brightness composite phrases NLLB hallucinates ("15 hours per minute").
    "15 dakikada 8 saatlik kullanım":{"en":"8 hours of use from 15 minutes of charging","de":"8 Stunden Nutzung mit 15 Minuten Laden","es":"8 horas de uso con 15 minutos de carga","fr":"8 heures d'utilisation avec 15 minutes de charge","pt":"8 horas de uso com 15 minutos de carga","ru":"8 часов работы после 15 минут зарядки"},
    "15 dakikada 8 saatlik kullanim":{"en":"8 hours of use from 15 minutes of charging","de":"8 Stunden Nutzung mit 15 Minuten Laden","es":"8 horas de uso con 15 minutos de carga","fr":"8 heures d'utilisation avec 15 minutes de charge","pt":"8 horas de uso com 15 minutos de carga","ru":"8 часов работы после 15 минут зарядки"},
    "30 dakikada %80 dolum":{"en":"80% in 30 minutes","de":"80% in 30 Minuten","es":"80% en 30 minutos","fr":"80% en 30 minutes","pt":"80% em 30 minutos","ru":"80% за 30 минут"},
    "30 dakikada %80 sarj":{"en":"80% in 30 minutes","de":"80% in 30 Minuten","es":"80% en 30 minutos","fr":"80% en 30 minutes","pt":"80% em 30 minutos","ru":"80% за 30 минут"},
    "2000 nit":             {"en":"2000 nits","de":"2000 nits","es":"2000 nits","fr":"2000 nits","pt":"2000 nits","ru":"2000 нит"},
    "1000 nit":             {"en":"1000 nits","de":"1000 nits","es":"1000 nits","fr":"1000 nits","pt":"1000 nits","ru":"1000 нит"},
    "1500 nit":             {"en":"1500 nits","de":"1500 nits","es":"1500 nits","fr":"1500 nits","pt":"1500 nits","ru":"1500 нит"},
    "3000 nit":             {"en":"3000 nits","de":"3000 nits","es":"3000 nits","fr":"3000 nits","pt":"3000 nits","ru":"3000 нит"},
    "renkli":               {"en":"Color","de":"Farbe","es":"Color","fr":"Couleur","pt":"Cor","ru":"Цветной"},
})


import re as _re

# Regex-driven overrides for "<number> <turkish-unit>" patterns NLLB butchers.
# "1 Adet" → "1 piece", "5 fan" → "5 fans", etc. Each tuple is (regex,
# {lang: template_with_{n}}).
PATTERN_OVERRIDES = [
    (_re.compile(r"^(\d+)\s+adet$", _re.IGNORECASE),
        {"en":"{n}","de":"{n} Stück","es":"{n} unidades","fr":"{n} pièces","pt":"{n} unidades","ru":"{n} штук"}),
    (_re.compile(r"^(\d+)\s+tane$", _re.IGNORECASE),
        {"en":"{n}","de":"{n} Stück","es":"{n} unidades","fr":"{n} pièces","pt":"{n} unidades","ru":"{n} штук"}),
    (_re.compile(r"^(\d+)\s+(?:fan|fanlı|fanli)$", _re.IGNORECASE),
        {"en":"{n} fans","de":"{n} Lüfter","es":"{n} ventiladores","fr":"{n} ventilateurs","pt":"{n} ventiladores","ru":"{n} вентиляторов"}),
    (_re.compile(r"^(\d+)\s+(?:gün|gun)$", _re.IGNORECASE),
        {"en":"{n} days","de":"{n} Tage","es":"{n} días","fr":"{n} jours","pt":"{n} dias","ru":"{n} дней"}),
    (_re.compile(r"^(\d+(?:[.,]\d+)?)\s+(?:saat|hour)$", _re.IGNORECASE),
        {"en":"{n} hours","de":"{n} Stunden","es":"{n} horas","fr":"{n} heures","pt":"{n} horas","ru":"{n} часов"}),
    (_re.compile(r"^(\d+)\s+dakika$", _re.IGNORECASE),
        {"en":"{n} minutes","de":"{n} Minuten","es":"{n} minutos","fr":"{n} minutes","pt":"{n} minutos","ru":"{n} минут"}),
    (_re.compile(r"^(\d+(?:[.,]\d+)?)\s+(?:inç|inc|İnç|Inc)$", _re.IGNORECASE),
        {"en":"{n} inch","de":"{n} Zoll","es":"{n} pulgadas","fr":"{n} pouces","pt":"{n} polegadas","ru":"{n} дюймов"}),
    (_re.compile(r"^(\d+)\s+(?:çekirdek|cekirdek|çekirdekli|cekirdekli|core|coreli)$", _re.IGNORECASE),
        {"en":"{n} cores","de":"{n} Kerne","es":"{n} núcleos","fr":"{n} cœurs","pt":"{n} núcleos","ru":"{n} ядер"}),
    (_re.compile(r"^(\d+)\s+(?:hücreli|hucreli|cell|cells)$", _re.IGNORECASE),
        {"en":"{n}-cell","de":"{n}-Zellen","es":"{n} celdas","fr":"{n} cellules","pt":"{n} células","ru":"{n}-секционный"}),
    (_re.compile(r"^(\d+)\s+(?:mikrofonlu|mikrofon|microphone|microphones)$", _re.IGNORECASE),
        {"en":"{n} microphones","de":"{n} Mikrofone","es":"{n} micrófonos","fr":"{n} microphones","pt":"{n} microfones","ru":"{n} микрофонов"}),
    (_re.compile(r"^(\d+)\s+sayfa$", _re.IGNORECASE),
        {"en":"{n} pages","de":"{n} Seiten","es":"{n} páginas","fr":"{n} pages","pt":"{n} páginas","ru":"{n} страниц"}),
    (_re.compile(r"^(\d+)\s+(?:döngü|dongu)$", _re.IGNORECASE),
        {"en":"{n} cycles","de":"{n} Zyklen","es":"{n} ciclos","fr":"{n} cycles","pt":"{n} ciclos","ru":"{n} циклов"}),
    (_re.compile(r"^(\d+)\s+lümen$", _re.IGNORECASE),
        {"en":"{n} lumens","de":"{n} Lumen","es":"{n} lúmenes","fr":"{n} lumens","pt":"{n} lúmens","ru":"{n} люмен"}),
    (_re.compile(r"^(\d+)\.?\s*nesil$", _re.IGNORECASE),
        {"en":"{n}th gen","de":"{n}. Generation","es":"{n}ª generación","fr":"{n}e génération","pt":"{n}ª geração","ru":"{n}-го поколения"}),
    (_re.compile(r"^(\d+)\s+yıl$", _re.IGNORECASE),
        {"en":"{n} years","de":"{n} Jahre","es":"{n} años","fr":"{n} ans","pt":"{n} anos","ru":"{n} лет"}),
    (_re.compile(r"^(\d+)\s+(?:hafta|week|weeks)$", _re.IGNORECASE),
        {"en":"{n} weeks","de":"{n} Wochen","es":"{n} semanas","fr":"{n} semaines","pt":"{n} semanas","ru":"{n} недель"}),
    # Display brightness: NLLB renders FR "nœuds" (knots), ES "nitos", PT "nitros" — all wrong.
    (_re.compile(r"^(\d+(?:[.,]\d+)?)\s+nit$", _re.IGNORECASE),
        {"en":"{n} nits","de":"{n} nits","es":"{n} nits","fr":"{n} nits","pt":"{n} nits","ru":"{n} нит"}),
    (_re.compile(r"^(\d+(?:[.,]\d+)?)\s+ppi$", _re.IGNORECASE),
        {"en":"{n} PPI","de":"{n} PPI","es":"{n} PPI","fr":"{n} PPI","pt":"{n} PPI","ru":"{n} PPI"}),
    (_re.compile(r"^(\d+(?:[.,]\d+)?)\s*mah$", _re.IGNORECASE),
        {"en":"{n} mAh","de":"{n} mAh","es":"{n} mAh","fr":"{n} mAh","pt":"{n} mAh","ru":"{n} мАч"}),
    # Aspect ratio "16:10" / "32:9" / "19.5:9" — NLLB reads these as times.
    (_re.compile(r"^(\d+(?:[.,]\d+)?:\d+(?:[.,]\d+)?)$"),
        {"en":"{n}","de":"{n}","es":"{n}","fr":"{n}","pt":"{n}","ru":"{n}"}),
    # Bare degree value "-5 º", "178 º", "120º" — NLLB renders as age.
    (_re.compile(r"^(-?\d+(?:[.,]\d+)?)\s*[º°]$"),
        {"en":"{n}°","de":"{n}°","es":"{n}°","fr":"{n}°","pt":"{n}°","ru":"{n}°"}),
    # "X kg / g" weight — pass through verbatim (units identical across langs).
    (_re.compile(r"^(\d+(?:[.,]\d+)?\s+(?:kg|g|mg|cm|mm|km))$", _re.IGNORECASE),
        {"en":"{n}","de":"{n}","es":"{n}","fr":"{n}","pt":"{n}","ru":"{n}"}),
]

# ─── German-source overrides (Geizhals → EN+TR direction) ──────────────
# NLLB DE→EN sometimes goes literal/wrong ("Kabelloses Laden" → "Wireless
# store", "Schnellladung" → "Rapid loading"). DE→TR additionally leaks
# English (Energie → "Energy sınıfı"). These are curated for product
# specs commonly found on Geizhals.
DE_OVERRIDES: Dict[str, Dict[str, str]] = {
    # Battery / charging
    "akkulaufzeit":          {"en":"Battery life",                "tr":"Pil ömrü"},
    "akkukapazität":         {"en":"Battery capacity",            "tr":"Pil kapasitesi"},
    "akku":                  {"en":"Battery",                     "tr":"Pil"},
    "batterie":              {"en":"Battery",                     "tr":"Pil"},
    "kabelloses laden":      {"en":"Wireless charging",           "tr":"Kablosuz şarj"},
    "kabelloses aufladen":   {"en":"Wireless charging",           "tr":"Kablosuz şarj"},
    "schnellladung":         {"en":"Fast charging",               "tr":"Hızlı şarj"},
    "schnellladen":          {"en":"Fast charging",               "tr":"Hızlı şarj"},
    "ladezeit":              {"en":"Charging time",               "tr":"Şarj süresi"},
    "ladeleistung":          {"en":"Charging power",              "tr":"Şarj gücü"},
    # Display
    "bildschirmgröße":       {"en":"Display size",                "tr":"Ekran boyutu"},
    "bildschirmauflösung":   {"en":"Display resolution",          "tr":"Ekran çözünürlüğü"},
    "bildschirmdiagonale":   {"en":"Display diagonal",            "tr":"Ekran köşegeni"},
    "auflösung":             {"en":"Resolution",                  "tr":"Çözünürlük"},
    "bildschirm":            {"en":"Display",                     "tr":"Ekran"},
    "display":               {"en":"Display",                     "tr":"Ekran"},
    "helligkeit":            {"en":"Brightness",                  "tr":"Parlaklık"},
    "bildwiederholrate":     {"en":"Refresh rate",                "tr":"Yenileme hızı"},
    # Camera
    "hauptkamera":           {"en":"Main camera",                 "tr":"Ana kamera"},
    "frontkamera":           {"en":"Front camera",                "tr":"Ön kamera"},
    "rückkamera":            {"en":"Rear camera",                 "tr":"Arka kamera"},
    "frontkamera-auflösung": {"en":"Front camera resolution",     "tr":"Ön kamera çözünürlüğü"},
    "kameraauflösung":       {"en":"Camera resolution",           "tr":"Kamera çözünürlüğü"},
    "blende":                {"en":"Aperture",                    "tr":"Diyafram"},
    "videoaufnahme":         {"en":"Video recording",             "tr":"Video kaydı"},
    "videoauflösung":        {"en":"Video resolution",            "tr":"Video çözünürlüğü"},
    # Connectivity
    "bluetooth":             {"en":"Bluetooth",                   "tr":"Bluetooth"},
    "bluetooth-version":     {"en":"Bluetooth version",           "tr":"Bluetooth sürümü"},
    "wlan":                  {"en":"Wi-Fi",                       "tr":"Wi-Fi"},
    "wifi":                  {"en":"Wi-Fi",                       "tr":"Wi-Fi"},
    "nfc":                   {"en":"NFC",                         "tr":"NFC"},
    "anschluss":             {"en":"Connector",                   "tr":"Bağlantı"},
    "anschlüsse":            {"en":"Connectors",                  "tr":"Bağlantılar"},
    "schnittstelle":         {"en":"Interface",                   "tr":"Arayüz"},
    "schnittstellen":        {"en":"Interfaces",                  "tr":"Arayüzler"},
    # Hardware
    "prozessor":             {"en":"Processor",                   "tr":"İşlemci"},
    "prozessortyp":          {"en":"Processor type",              "tr":"İşlemci türü"},
    "prozessortakt":         {"en":"Processor frequency",         "tr":"İşlemci hızı"},
    "kerne":                 {"en":"Cores",                       "tr":"Çekirdek"},
    "anzahl kerne":          {"en":"Core count",                  "tr":"Çekirdek sayısı"},
    "speicher":              {"en":"Memory",                      "tr":"Bellek"},
    "arbeitsspeicher":       {"en":"RAM",                         "tr":"RAM"},
    "interner speicher":     {"en":"Internal storage",            "tr":"Dahili depolama"},
    "speicherkapazität":     {"en":"Storage capacity",            "tr":"Depolama kapasitesi"},
    "grafikkarte":           {"en":"Graphics card",               "tr":"Ekran kartı"},
    "chipsatz":              {"en":"Chipset",                     "tr":"Yonga seti"},
    # Body / design
    "abmessungen":           {"en":"Dimensions",                  "tr":"Boyutlar"},
    "gewicht":               {"en":"Weight",                      "tr":"Ağırlık"},
    "höhe":                  {"en":"Height",                      "tr":"Yükseklik"},
    "breite":                {"en":"Width",                       "tr":"Genişlik"},
    "tiefe":                 {"en":"Depth",                       "tr":"Derinlik"},
    "dicke":                 {"en":"Thickness",                   "tr":"Kalınlık"},
    "gehäusematerial":       {"en":"Case material",               "tr":"Kasa malzemesi"},
    "rahmenmaterial":        {"en":"Frame material",              "tr":"Çerçeve malzemesi"},
    "farbe":                 {"en":"Color",                       "tr":"Renk"},
    "farben":                {"en":"Colors",                      "tr":"Renkler"},
    # Resistance / durability
    "wasserdicht":           {"en":"Waterproof",                  "tr":"Su geçirmez"},
    "staubdicht":            {"en":"Dustproof",                   "tr":"Toz geçirmez"},
    "wasserbeständig":       {"en":"Water-resistant",             "tr":"Suya dayanıklı"},
    "staubbeständig":        {"en":"Dust-resistant",              "tr":"Toza dayanıklı"},
    # Sensors
    "fingerabdrucksensor":   {"en":"Fingerprint sensor",          "tr":"Parmak izi sensörü"},
    "fingerabdruckleser":    {"en":"Fingerprint reader",          "tr":"Parmak izi okuyucu"},
    "gesichtserkennung":     {"en":"Face recognition",            "tr":"Yüz tanıma"},
    "sensoren":              {"en":"Sensors",                     "tr":"Sensörler"},
    # OS / software
    "betriebssystem":        {"en":"Operating system",            "tr":"İşletim sistemi"},
    "android":               {"en":"Android",                     "tr":"Android"},
    "ios":                   {"en":"iOS",                         "tr":"iOS"},
    "funktionen":            {"en":"Features",                    "tr":"Özellikler"},
    "merkmale":              {"en":"Features",                    "tr":"Özellikler"},
    "eigenschaften":         {"en":"Properties",                  "tr":"Özellikler"},
    # SIM / network
    "sim-karte":             {"en":"SIM card",                    "tr":"SIM kart"},
    "sim-typ":               {"en":"SIM type",                    "tr":"SIM türü"},
    "mobilfunk":             {"en":"Mobile network",              "tr":"Mobil ağ"},
    # Energy / EU label
    "energieklasse":         {"en":"Energy class",                "tr":"Enerji sınıfı"},
    "energieeffizienzklasse":{"en":"Energy efficiency class",     "tr":"Enerji verimliliği sınıfı"},
    "energieverbrauch":      {"en":"Energy consumption",          "tr":"Enerji tüketimi"},
    # Common booleans
    "ja":                    {"en":"Yes",                         "tr":"Evet"},
    "nein":                  {"en":"No",                          "tr":"Hayır"},
    "vorhanden":             {"en":"Yes",                         "tr":"Var"},
    "nicht vorhanden":       {"en":"No",                          "tr":"Yok"},
}

def _de_override_lookup(text: str) -> Optional[Dict[str, str]]:
    if not text: return None
    k = " ".join(text.lower().split())
    return DE_OVERRIDES.get(k)


# Residue cleaner for TR target: strip English-word leaks from DE→TR
# ("Energy sınıfı" → "Enerji sınıfı", "Wireless store" → already handled
# by override).
_TR_RESIDUE_RULES = [
    (_re.compile(r"\bEnergy\b"),             "Enerji"),
    (_re.compile(r"\bBattery\b"),            "Pil"),
    (_re.compile(r"\bMemory\b"),             "Bellek"),
    (_re.compile(r"\bStorage\b"),            "Depolama"),
    (_re.compile(r"\bDisplay\b"),            "Ekran"),
    (_re.compile(r"\bCamera\b"),             "Kamera"),
    (_re.compile(r"\bSize\b"),               "Boyut"),
    (_re.compile(r"\bResolution\b"),         "Çözünürlük"),
    (_re.compile(r"\bWireless\b"),           "Kablosuz"),
    (_re.compile(r"\bCharging\b"),           "Şarj"),
    (_re.compile(r"\bFast\b"),               "Hızlı"),
    (_re.compile(r"\bFeatures\b"),           "Özellikler"),
    (_re.compile(r"\s{2,}"),                 " "),
]

def _clean_residue_tr(text: str) -> str:
    if not text: return text
    s = text
    for pat, repl in _TR_RESIDUE_RULES:
        s = pat.sub(repl, s)
    return s.strip()


def _norm_tr(s: str) -> str:
    """Lowercase Turkish-aware: İ→i, I→ı, then collapse whitespace and strip a
    trailing combining-dot (U+0307) that Python's str.lower() leaves on İ."""
    if not s: return ""
    # Map dotted/dotless I before lower() so we get consistent ASCII-ish keys.
    s = s.replace("İ", "i").replace("I", "ı")
    s = s.lower().replace("̇", "")
    return " ".join(s.split())

# Proper-noun / passthrough atoms: keep identical across all 6 langs.
# NLLB-600M loves to add articles to single brand words ("Le GPS", "Il est 2")
# or translate model/brand identifiers ("PowerVR" → "Le PowerVR"). Listed
# lowercased; the override returns the input text verbatim (per-lang).
_PASSTHROUGH = {
    "bluetooth", "wi-fi", "wifi", "wlan", "nfc", "gps", "glonass", "galileo",
    "beidou", "qzss", "michibiki", "powervr", "spotify", "gymkit", "vo2max",
    "hiit", "fitness", "yoga", "pilates", "snowboard", "cardio", "golf",
    "ltpo oled", "ltpo 3.0", "ion-x", "apple watch", "apple watch series 11",
    "apple s10 sip", "apple u2", "apple w3", "apple neural engine",
    "watchos", "ios", "android", "siri", "alexa", "google assistant",
    "ip6x", "ip67", "ip68", "ip69", "5 atm", "10 atm", "3 atm",
    "uwb", "ane", "spo2", "ecg", "ekg", "npu", "gpu", "cpu", "ram", "sip",
    "digital crown", "always-on", "walkie-talkie", "voice memo",
    # Round-4 brand / initialism passthrough — FR was adding "Le" prefix.
    "blackwell", "vulkan", "vrm", "bds", "mihc", "nas", "vlan", "pfc",
    "ssd", "hdd", "nvme", "udimm", "sodimm", "rdimm", "gif", "jpeg", "png",
    "ax3000", "ax1800", "ax5400", "ax6000", "wi-fi 6", "wi-fi 7",
    "timelapse", "spotlight", "stereo", "panorama", "netflix", "youtube",
    "amazon prime", "disney+", "hbo", "twitch", "discord",
    "intel", "amd", "nvidia", "qualcomm", "mediatek", "samsung", "apple",
    "lg", "sony", "microsoft", "asus", "msi", "gigabyte", "razer",
    "logitech", "tp-link", "huawei", "xiaomi", "lenovo", "dell", "hp",
    "rgb", "argb", "hdr", "hdr10", "hdr10+", "dolby vision", "dolby atmos",
    "wpa", "wpa2", "wpa3", "wep", "mesh", "qos",
    "windows 10", "windows 11", "macos", "linux", "chromeos",
    "usb", "usb-a", "usb-b", "usb-c", "usb 2.0", "usb 3.0", "usb 3.1", "usb 3.2",
    "hdmi", "displayport", "vga", "dvi", "thunderbolt", "rj45", "rj-45",
    "ddr3", "ddr4", "ddr5", "lpddr4", "lpddr5", "lpddr5x",
    "pcie", "sata", "m.2", "m2", "esata", "msata",
}

# ─── Residue cleaner ────────────────────────────────────────────────────
# NLLB occasionally leaks Turkish suffixes/words into EN/DE output when it
# can't fully parse compound atoms (e.g. "Wireless Charging Etme",
# "Focus Takibi", "Services ve Applications", "Type-C'den Type-C'ye").
# These regexes strip / rewrite those leaks on the model's raw output before
# we cache & return. Applied only to EN / DE targets (TR is source).
_RESIDUE_RULES = [
    # Turkish conjunctions/particles between English words.
    (_re.compile(r"\s+ve\s+", _re.IGNORECASE),                " and "),
    (_re.compile(r"\s+ya da\s+", _re.IGNORECASE),             " or "),
    (_re.compile(r"\s+veya\s+", _re.IGNORECASE),              " or "),
    (_re.compile(r"\s+ile\s+", _re.IGNORECASE),               " with "),
    (_re.compile(r"\s+için\s+", _re.IGNORECASE),              " for "),
    # Common verb-noun TR suffix that survives: "Charging Etme" → "Charging"
    (_re.compile(r"\bEtme\b"),                                ""),
    (_re.compile(r"\bEtmek\b"),                               ""),
    # "Focus Takibi" → "Focus tracking"; "X Takibi" generic Turkish "tracking" suffix
    (_re.compile(r"\bTakibi\b"),                              "tracking"),
    (_re.compile(r"\bTakip\b"),                               "tracking"),
    # "Tipik" leaks alongside "Battery Capacity"
    (_re.compile(r"\(Tipik\)"),                               "(typical)"),
    (_re.compile(r"\bTipik\b"),                               "typical"),
    # "Audioli command" — bad TR "Sesli komut" → "Voice command"
    (_re.compile(r"\bAudioli\s+command\b", _re.IGNORECASE),   "Voice command"),
    (_re.compile(r"\bAudiole\s+command\b", _re.IGNORECASE),   "Voice command"),
    # "Displaya Dual Tapping" — TR locative "a" on Display
    (_re.compile(r"\bDisplaya\b"),                            "Display"),
    # "Kolay Interface" — TR "Kolay" = Easy
    (_re.compile(r"\bKolay\s+Interface\b"),                   "Easy Interface"),
    (_re.compile(r"\bKolay\b"),                               "Easy"),
    # "Enerji Class" — TR "Enerji" = Energy
    (_re.compile(r"\bEnerji\b"),                              "Energy"),
    (_re.compile(r"\bAntreman\b"),                            "Training"),
    (_re.compile(r"\bParkur\b"),                              "Course"),
    # "Type-C'den Type-C'ye" — TR ablative/dative on USB
    (_re.compile(r"'den\b"),                                  ""),
    (_re.compile(r"'ye\b"),                                   ""),
    (_re.compile(r"'ten\b"),                                  ""),
    (_re.compile(r"'ya\b"),                                   ""),
    (_re.compile(r"'ta\b"),                                   ""),
    (_re.compile(r"'da\b"),                                   ""),
    (_re.compile(r"'de\b"),                                   ""),
    # "30 minutesda %55 Dolum" — TR fragment percentage charge
    (_re.compile(r"(\d+)\s*minutesda\s*%(\d+)\s*Dolum", _re.IGNORECASE),
        r"\2% in \1 minutes"),
    (_re.compile(r"(\d+)\s*saatlik\s+kullanım", _re.IGNORECASE),
        r"\1 hours of use"),
    # "Focus Takibi" remained — clean it
    (_re.compile(r"\bDolum\b"),                               "charge"),
    # Standalone TR "Var/Yok" if they slipped in
    (_re.compile(r"^Var$"),                                   "Yes"),
    (_re.compile(r"^Yok$"),                                   "No"),
    # Collapse double spaces left after deletions
    (_re.compile(r"\s{2,}"),                                  " "),
    (_re.compile(r"\s+([.,;:!?\)])"),                         r"\1"),
    (_re.compile(r"\(\s+"),                                   "("),
]
_RESIDUE_RULES_DE = [
    (_re.compile(r"\s+ve\s+", _re.IGNORECASE),                " und "),
    (_re.compile(r"\s+ya da\s+", _re.IGNORECASE),             " oder "),
    (_re.compile(r"\s+veya\s+", _re.IGNORECASE),              " oder "),
    (_re.compile(r"\s+ile\s+", _re.IGNORECASE),               " mit "),
    (_re.compile(r"\s+için\s+", _re.IGNORECASE),              " für "),
    (_re.compile(r"\bEtme\b"),                                ""),
    (_re.compile(r"\bEtmek\b"),                               ""),
    (_re.compile(r"\bTakibi\b"),                              "-Tracking"),
    (_re.compile(r"\bTakip\b"),                               "Tracking"),
    (_re.compile(r"\(Tipik\)"),                               "(typisch)"),
    (_re.compile(r"\bTipik\b"),                               "typisch"),
    (_re.compile(r"\bAudioli\s+command\b", _re.IGNORECASE),   "Sprachbefehl"),
    (_re.compile(r"\bAudiole\s+command\b", _re.IGNORECASE),   "Sprachbefehl"),
    (_re.compile(r"\bDisplaya\b"),                            "Display"),
    (_re.compile(r"\bKolay\s+Interface\b"),                   "Einfacher Modus"),
    (_re.compile(r"\bKolay\b"),                               "Einfach"),
    (_re.compile(r"\bEnerji\b"),                              "Energie"),
    (_re.compile(r"\bAntreman\b"),                            "Training"),
    (_re.compile(r"\bParkur\b"),                              "Strecke"),
    (_re.compile(r"'den\b"),                                  ""),
    (_re.compile(r"'ye\b"),                                   ""),
    (_re.compile(r"'ten\b"),                                  ""),
    (_re.compile(r"'ya\b"),                                   ""),
    (_re.compile(r"'ta\b"),                                   ""),
    (_re.compile(r"'da\b"),                                   ""),
    (_re.compile(r"'de\b"),                                   ""),
    (_re.compile(r"(\d+)\s*minutesda\s*%(\d+)\s*Dolum", _re.IGNORECASE),
        r"\2% in \1 Minuten"),
    (_re.compile(r"(\d+)\s*Minutenda\s*%(\d+)\s*Dolum", _re.IGNORECASE),
        r"\2% in \1 Minuten"),
    (_re.compile(r"(\d+)\s*saatlik\s+kullanım", _re.IGNORECASE),
        r"\1 Stunden Nutzung"),
    (_re.compile(r"\bDolum\b"),                               "Laden"),
    (_re.compile(r"^Var$"),                                   "Ja"),
    (_re.compile(r"^Yok$"),                                   "Nein"),
    (_re.compile(r"\s{2,}"),                                  " "),
    (_re.compile(r"\s+([.,;:!?\)])"),                         r"\1"),
    (_re.compile(r"\(\s+"),                                   "("),
]
# Turkish characters that should NEVER appear in EN/DE final output.
_TR_LEAK_CHARS = _re.compile(r"[ğĞşŞıİ]")

def _clean_residue(text: str, lang: str) -> str:
    """Apply residue rules to a translated string. Returns cleaned text."""
    if not text: return text
    s = text
    rules = _RESIDUE_RULES_DE if lang == "de" else _RESIDUE_RULES
    for pat, repl in rules:
        s = pat.sub(repl, s)
    return s.strip()


def _override_lookup(text: str) -> Optional[Dict[str, str]]:
    """Return per-language override map or None. Case/whitespace insensitive.
    Checks exact-match table first, passthrough table, single-digit numerics,
    then numeric+unit pattern table."""
    if not text: return None
    stripped = text.strip()
    # Try plain lower first (matches existing ASCII keys), then Turkish-aware.
    k = " ".join(text.lower().split())
    hit = OVERRIDES.get(k)
    if hit is None:
        hit = OVERRIDES.get(_norm_tr(text))
    if hit is not None:
        return hit
    # Bare single-digit / short numeric values ("2", "5.3", "64-bit", "1.6")
    # — NLLB sentences these. Pass through identically.
    if _re.fullmatch(r"[\d.,\-x]+(?:[\s\-]?bit)?", stripped, _re.IGNORECASE):
        return {lc: stripped for lc in LANGS}
    # Brand / proper-noun passthrough.
    if k in _PASSTHROUGH:
        return {lc: stripped for lc in LANGS}
    for pat, tmpl in PATTERN_OVERRIDES:
        m = pat.match(stripped)
        if m:
            n = m.group(1)
            return {lang: tpl.format(n=n) for lang, tpl in tmpl.items()}
    return None

# ─── Cache ───────────────────────────────────────────────────────────────
_cache_lock = threading.Lock()
_cache: Dict[str, Dict[str, str]] = {}      # cache[srclang][f"{srctext}|||{tgtlang}"] = translation
_cache_dirty = False

def _cache_key(src_lang: str, src_text: str, tgt_lang: str) -> str:
    return f"{src_lang}|||{src_text}|||{tgt_lang}"

def _cache_lookup(src_lang: str, src_text: str, tgt_lang: str) -> Optional[str]:
    with _cache_lock:
        return _cache.get(_cache_key(src_lang, src_text, tgt_lang))

def _cache_store(src_lang: str, src_text: str, tgt_lang: str, translation: str) -> None:
    global _cache_dirty
    with _cache_lock:
        _cache[_cache_key(src_lang, src_text, tgt_lang)] = translation
        _cache_dirty = True

def _load_cache() -> None:
    global _cache
    try:
        if CACHE_FILE.exists():
            with CACHE_FILE.open("r", encoding="utf-8") as f:
                _cache = json.load(f) or {}
        print(f"[worker] cache loaded: {len(_cache)} entries", flush=True)
    except Exception as e:
        print(f"[worker] cache load failed: {e}; starting empty", flush=True)
        _cache = {}

def _save_cache(force: bool = False) -> None:
    global _cache_dirty
    with _cache_lock:
        if not _cache_dirty and not force: return
        try:
            tmp = CACHE_FILE.with_suffix(".tmp")
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(_cache, f, ensure_ascii=False)
            tmp.replace(CACHE_FILE)
            _cache_dirty = False
        except Exception as e:
            print(f"[worker] cache save failed: {e}", flush=True)

# ─── Model loading ───────────────────────────────────────────────────────
_translator: Optional[ctranslate2.Translator] = None
_sp_source: Optional[spm.SentencePieceProcessor] = None
_sp_target: Optional[spm.SentencePieceProcessor] = None
_model_lock = threading.Lock()
_model_ready = False

def _load_model() -> None:
    """Lazy-loaded so a /health probe before the model finishes still answers."""
    global _translator, _sp_source, _sp_target, _model_ready
    with _model_lock:
        if _model_ready: return
        if not MODEL_DIR.is_dir():
            raise FileNotFoundError(
                f"NLLB CTranslate2 model not found at {MODEL_DIR}. "
                "Run: huggingface-cli download "
                "entai2965/nllb-200-distilled-600M-ctranslate2 "
                f"--local-dir {MODEL_DIR} --local-dir-use-symlinks=False"
            )
        t0 = time.time()
        print(f"[worker] loading NLLB from {MODEL_DIR} on {DEVICE}/{COMPUTE_TYPE}...", flush=True)
        _translator = ctranslate2.Translator(
            str(MODEL_DIR),
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            inter_threads=1,
            intra_threads=4,
        )
        # NLLB CT2 ships with sentencepiece.bpe.model — both source and target
        # tokenize the same way for this model.
        sp_path = MODEL_DIR / "sentencepiece.bpe.model"
        if not sp_path.exists():
            # alt name some converters produce
            alt = MODEL_DIR / "tokenizer.model"
            if alt.exists(): sp_path = alt
        _sp_source = spm.SentencePieceProcessor()
        _sp_source.Load(str(sp_path))
        _sp_target = _sp_source  # NLLB shares the BPE vocab between src/tgt
        _model_ready = True
        print(f"[worker] model ready in {time.time() - t0:.1f}s", flush=True)

def warm_up() -> None:
    try:
        _load_model()
        # tiny translation to JIT-warm the CUDA kernels
        out = _translate_batch(["Bilgisayar"], "tur_Latn", ["eng_Latn"])
        print(f"[worker] warmup ok: {out}", flush=True)
    except Exception as e:
        print(f"[worker] warmup failed: {e}", flush=True)
        traceback.print_exc()

# ─── Core translation ────────────────────────────────────────────────────
def _translate_batch(texts: List[str], src_code: str, tgt_codes: List[str]) -> Dict[str, Dict[str, str]]:
    """
    Translate every text into every requested target language. Returns
        { src_text: { tgt_lang_short: translated_text, ... }, ... }
    where tgt_lang_short is whatever short code (en/de/es/...) we passed in
    via the reverse-lookup table.
    """
    if not _model_ready: _load_model()
    assert _translator is not None and _sp_source is not None

    # Encode every source once, prepend source-lang token so NLLB knows the
    # input language. This list is reused for every target.
    encoded_sources: List[List[str]] = []
    for t in texts:
        # NLLB takes the source language token at the START of the source
        # sequence and the target language token as the decoder prefix.
        pieces = _sp_source.EncodeAsPieces(t)
        encoded_sources.append([src_code] + pieces + ["</s>"])

    # Map Flores codes back to short codes (en/de/...).
    short_from_code = {v: k for k, v in LANG_CODE.items()}

    out: Dict[str, Dict[str, str]] = {t: {} for t in texts}
    for tgt_code in tgt_codes:
        # If source == target, return verbatim (NLLB still works but waste).
        if tgt_code == src_code:
            short = short_from_code[tgt_code]
            for t in texts: out[t][short] = t
            continue
        # Decoder prefix forces NLLB to emit the right language.
        target_prefix = [[tgt_code]] * len(encoded_sources)
        results = _translator.translate_batch(
            encoded_sources,
            target_prefix=target_prefix,
            max_batch_size=BATCH_SIZE,
            beam_size=BEAM_SIZE,
            return_scores=False,
            max_decoding_length=MAX_DECODING_LENGTH,
            no_repeat_ngram_size=3,
            length_penalty=1.0,
            repetition_penalty=1.05,
        )
        short = short_from_code.get(tgt_code, tgt_code)
        for src_text, res in zip(texts, results):
            # Strip the target_prefix tokens at the front of the hypothesis.
            pieces = res.hypotheses[0] if res.hypotheses else []
            if pieces and pieces[0] == tgt_code:
                pieces = pieces[1:]
            # NLLB sometimes leaves </s> in the output — chop it.
            if pieces and pieces[-1] == "</s>":
                pieces = pieces[:-1]
            decoded = _sp_target.DecodePieces(pieces) if pieces else ""
            if "▁" in decoded: decoded = decoded.replace("▁", " ").strip()
            out[src_text][short] = decoded.strip()
    return out

# ─── HTTP server ─────────────────────────────────────────────────────────
STATE = {
    "busy": False, "startedAt": 0, "jobId": 0,
    "totalTexts": 0, "totalTargets": 0,
    "itemsTotal": 0, "itemsDone": 0,
    "lastBatchMs": 0, "lastUpdate": 0,
}

def _now() -> float: return time.time()
def _ms(s: float) -> int: return int(s * 1000)

def _clean(raw) -> str:
    s = str(raw or "").replace(" ", " ")
    return " ".join(s.split()).strip()

class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass  # silence default access log

    def _json(self, status: int, body):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self): self._json(200, {"ok": True})

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {
                "ok": True, "model": MODEL_LABEL, "modelReady": _model_ready,
                "cache": len(_cache), "device": DEVICE,
                "beam": BEAM_SIZE, "batchSize": BATCH_SIZE, "threads": TRANSLATE_THREADS,
                "ts": _ms(_now()),
            })
        if self.path == "/status":
            now = _now()
            ratio = 0.0
            if STATE["itemsTotal"] > 0:
                ratio = STATE["itemsDone"] / STATE["itemsTotal"]
            return self._json(200, {**STATE, "modelReady": _model_ready,
                                    "progress": ratio, "cacheSize": len(_cache),
                                    "ts": _ms(now)})
        return self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path == "/clear-cache":
            global _cache, _cache_dirty
            with _cache_lock:
                n = len(_cache); _cache = {}; _cache_dirty = True
            _save_cache(force=True)
            print(f"[worker] cache cleared via /clear-cache · {n} keys removed", flush=True)
            return self._json(200, {"ok": True, "cleared": n})

        if self.path != "/translate":
            return self._json(404, {"error": "not_found"})

        length = int(self.headers.get("Content-Length") or 0)
        try:
            raw = self.rfile.read(length) if length else b""
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception as e:
            return self._json(400, {"error": "invalid_json", "detail": str(e)})

        src_short = str(body.get("from") or body.get("source") or "tr").lower().strip()
        if src_short not in LANGS:
            return self._json(400, {"error": "invalid_source_lang", "detail": src_short})
        src_code = LANG_CODE[src_short]

        raw_texts = body.get("texts") or []
        if not isinstance(raw_texts, list):
            return self._json(400, {"error": "texts_required"})
        seen, texts = set(), []
        for r in raw_texts:
            t = _clean(r)
            if t and t not in seen:
                seen.add(t); texts.append(t)
        if not texts: return self._json(400, {"error": "texts_required"})
        texts = texts[:500]

        tgt_shorts = [str(x or "").lower() for x in (body.get("to") or [])]
        tgt_shorts = [l for l in tgt_shorts if l in LANGS]
        if not tgt_shorts: return self._json(400, {"error": "targets_required"})
        tgt_codes = [LANG_CODE[s] for s in tgt_shorts]

        started = _now()
        STATE["busy"] = True
        STATE["startedAt"] = started
        STATE["jobId"] += 1
        STATE["totalTexts"] = len(texts)
        STATE["totalTargets"] = len(tgt_codes)
        STATE["itemsTotal"] = len(texts) * len(tgt_codes)
        STATE["itemsDone"] = 0
        STATE["lastUpdate"] = started

        # Override + cache lookup pass — only translate atoms that aren't
        # cached for every requested target. Overrides (curated map of
        # short primitives NLLB botches) win over cache and the model.
        missing_texts: List[str] = []
        result: Dict[str, Dict[str, str]] = {t: {} for t in texts}
        for t in texts:
            if src_short == "tr":
                ov = _override_lookup(t)
            elif src_short == "de":
                ov = _de_override_lookup(t)
            else:
                ov = None
            for short in tgt_shorts:
                if ov is not None and short in ov:
                    result[t][short] = ov[short]
                    continue
                hit = _cache_lookup(src_short, t, short)
                if hit is not None:
                    result[t][short] = hit
            if any(short not in result[t] for short in tgt_shorts):
                missing_texts.append(t)

        if missing_texts:
            try:
                fresh = _translate_batch(missing_texts, src_code, tgt_codes)
            except Exception as e:
                STATE["busy"] = False
                traceback.print_exc()
                return self._json(500, {"error": "translate_failed", "detail": str(e)})
            # _translate_batch returns short codes already (en/de). Apply
            # the appropriate residue cleaner per (source, target):
            #   TR source → EN/DE cleaner strips TR suffixes ("ve","Etme")
            #   DE source → TR cleaner strips EN leaks ("Energy sınıfı")
            for t, langs in fresh.items():
                for short, val in langs.items():
                    if short == src_short:
                        cleaned = val
                    elif src_short == "tr":
                        cleaned = _clean_residue(val, short)
                    elif src_short == "de" and short == "tr":
                        cleaned = _clean_residue_tr(val)
                    else:
                        cleaned = val
                    _cache_store(src_short, t, short, cleaned)
                    result[t][short] = cleaned
            _save_cache()

        STATE["itemsDone"] = STATE["itemsTotal"]
        STATE["busy"] = False
        STATE["lastBatchMs"] = _ms(_now() - started)
        STATE["lastUpdate"] = _now()

        return self._json(200, {
            "provider": "nllb-ct2",
            "model": MODEL_LABEL,
            "device": DEVICE,
            "from": src_short,
            "count": len(texts),
            "to": tgt_shorts,
            "elapsedMs": _ms(_now() - started),
            "translations": result,
            # No residue fallback needed any more — NLLB nails it. Return
            # an empty list to keep the JSON contract identical to the
            # Argos worker.
            "residueAtoms": [],
        })


class _ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    _load_cache()
    threading.Thread(target=warm_up, daemon=True).start()
    server = _ThreadedHTTPServer((HOST, PORT), _Handler)
    print(f"[worker] NLLB-200 worker listening on http://{HOST}:{PORT}", flush=True)
    print(f"[worker] model dir: {MODEL_DIR}", flush=True)
    print(f"[worker] device={DEVICE} compute={COMPUTE_TYPE} beam={BEAM_SIZE} "
          f"batch={BATCH_SIZE} threads={TRANSLATE_THREADS}", flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        _save_cache(force=True)
        print("[worker] shutdown", flush=True)


if __name__ == "__main__":
    main()
