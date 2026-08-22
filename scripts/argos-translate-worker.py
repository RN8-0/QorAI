"""
Qor AI local translation worker (GPU-accelerated).

Drop-in replacement for scripts/local-translate-worker.mjs. Listens on the
same host:port and speaks the same JSON contract:

  POST /translate   { from, texts: [...], to: [tr,en,de,es,fr,pt,ru] }
                 -> { provider, model, from, count, to, elapsedMs,
                      translations: { "<src>": { en: "...", de: "...", ... }, ... } }

  GET  /health    -> { ok, model, cache, modelReady, ... }
  GET  /status    -> live job state (busy, progress, etaMs, batchDone, ...)

Backend: Argos Translate language packages running on CTranslate2 with the
CUDA execution provider. We bypass Argos's high-level translate() so we can
batch all atoms in a single GPU pass and pivot through English ONCE per
target language instead of once per atom.

Model is loaded lazily on first request and shared by all subsequent calls.
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

# Force Argos to look up packages on GPU. CTranslate2 honours `device='cuda'`
# when we construct the Translator directly, so this is mostly informational.
os.environ.setdefault("ARGOS_DEVICE_TYPE", "cuda")

# On Windows, CTranslate2 lazy-loads cublas / cudnn / cuda-runtime DLLs the
# first time a CUDA op runs (NOT at import time), so just calling
# os.add_dll_directory isn't enough — the runtime LoadLibrary call needs
# the directories on PATH too. The pip-installed NVIDIA wheels drop the
# DLLs under venv/Lib/site-packages/nvidia/<lib>/bin.
if sys.platform == "win32":
    _venv_root = Path(sys.executable).parent.parent
    _nvidia_root = _venv_root / "Lib" / "site-packages" / "nvidia"
    if _nvidia_root.is_dir():
        _added: List[str] = []
        for sub in _nvidia_root.iterdir():
            bin_dir = sub / "bin"
            if bin_dir.is_dir():
                _added.append(str(bin_dir))
                if hasattr(os, "add_dll_directory"):
                    try:
                        os.add_dll_directory(str(bin_dir))
                    except (OSError, FileNotFoundError):
                        pass
        if _added:
            os.environ["PATH"] = os.pathsep.join(_added) + os.pathsep + os.environ.get("PATH", "")
            print(f"[worker] CUDA DLL paths registered: {len(_added)}", flush=True)

import argostranslate.package           # noqa: E402
import ctranslate2                      # noqa: E402
import sentencepiece as spm             # noqa: E402

# ─── Configuration ───────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get("QORAI_TRANSLATE_PORT", "8797"))
HOST = os.environ.get("QORAI_TRANSLATE_HOST", "127.0.0.1")
CACHE_FILE = HERE / ".local-translate-cache.json"
# Strict GPU enforcement — user wants the GPU pushed and CPU left alone.
# Set QORAI_TRANSLATE_FORCE_CPU=1 to allow CPU fallback (debug only).
FORCE_CPU = os.environ.get("QORAI_TRANSLATE_FORCE_CPU", "0") == "1"
_cuda_count = ctranslate2.get_cuda_device_count()
if _cuda_count > 0 and not FORCE_CPU:
    DEVICE = "cuda"
elif FORCE_CPU:
    DEVICE = "cpu"
else:
    # No GPU detected — fail loudly so the user knows. Per user request:
    # CPU should NOT be used for translation. Set QORAI_TRANSLATE_FORCE_CPU=1
    # to override (e.g. CI machines without a GPU).
    raise SystemExit(
        "[worker] No CUDA device detected. Translation requires a GPU. "
        "Install CUDA + cudnn + cublas for ctranslate2, or set "
        "QORAI_TRANSLATE_FORCE_CPU=1 to allow CPU fallback."
    )
# int8_float16 gives ~2x speed vs float16 on consumer GPUs (Turing+) at
# negligible quality cost; fall back to int8 on CPU.
COMPUTE_TYPE = "int8_float16" if DEVICE == "cuda" else "int8"
# CTranslate2 will internally split into sub-batches of this size. 96 fits
# on a 4 GB GPU (GTX 1650) for the small Argos models — bumped from 64 to
# pack more atoms per kernel launch (single biggest GPU throughput win on
# 80 MB Argos models). Drop to 64 via QORAI_TRANSLATE_BATCH=64 if you OOM.
# Argos models are tiny (~80 MB each) so we can afford a wider beam without
# blowing VRAM. beam=4 catches mixed-language compounds ("1 x Uyku Modunda
# Charging Support", "keyboard mit DE layout") that beam=1 was leaving half
# in the source language. Roughly 20% slower per atom — still <1s/product.
BATCH_SIZE = int(os.environ.get("QORAI_TRANSLATE_BATCH", "96"))
BEAM_SIZE = int(os.environ.get("QORAI_TRANSLATE_BEAM", "4"))
# Per-lang thread pool size. CT2 releases the GIL during translate_batch so
# more threads = more overlapping GPU streams. 8 saturates a small GPU when
# all 11 target langs share VRAM (each lang's CTranslate2 model is ~80 MB).
TRANSLATE_THREADS = int(os.environ.get("QORAI_TRANSLATE_THREADS", "8"))
MODEL_LABEL = f"argos-translate/{DEVICE}/{COMPUTE_TYPE}"

# Supported language codes (must match the admin pipeline). Non-EN sources
# pivot through EN at runtime.
#
# Almanca 2026-08-21'de hem HEDEF hem KAYNAK olarak kaldirildi. Burada
# ("de", "...") anahtarli 42 glossary satiri duruyordu; tek kaynagi Geizhals'ti
# ve o da kaldirildi. Olculdu (2026-08-22): katalogda geizhals kaynakli urun
# 0/107.449. Erisilemeyen sozluk satiri, sonraki okuyucuya "demek ki Almanca
# hala var" diye okunur.
LANGS = {"tr", "en", "es", "fr", "pt", "ru"}

# Tiny deterministic glossary for short technical atoms where MT models are
# weakest. This stays in-process and costs ~0 ms; it prevents broken outputs
# like "5088 mAh (?? eSIM)" or "C02-carbone" from entering the shared dict.
_EXACT_GLOSSARY: Dict[Tuple[str, str], Dict[str, str]] = {
    ("tr", "yalnızca esim"): {
        "en": "Only eSIM", "es": "Solo eSIM",
        "fr": "eSIM uniquement", "pt": "Apenas eSIM", "ru": "Только eSIM",
    },
    ("tr", "silikon-karbon"): {
        "en": "Silicon-carbon", "es": "Silicio-carbono", "fr": "Silicium-carbone",
        "pt": "Silício-carbono", "ru": "Кремний-углерод",
    },
}

# ─── State ───────────────────────────────────────────────────────────────
_pkg_lock = threading.Lock()
# (from_code, to_code) -> (ctranslate2.Translator, sentencepiece.SentencePieceProcessor)
_pkgs: Dict[Tuple[str, str], Tuple[ctranslate2.Translator, spm.SentencePieceProcessor]] = {}

# Persistent cache so a restart keeps the dictionary warm.
_cache_lock = threading.Lock()
_cache: Dict[str, Dict[str, str]] = {}
_cache_dirty = False
_last_save = 0.0

STATE = {
    "busy": False,
    "startedAt": 0,
    "jobId": 0,
    "totalTexts": 0,
    "totalTargets": 0,
    "lang": None,
    "langIndex": 0,
    "langTotal": 0,
    "batchDone": 0,
    "batchTotal": 0,
    "itemsDone": 0,
    "itemsTotal": 0,
    "lastBatchMs": 0,
    "avgBatchMs": 0,
    "lastUpdate": 0,
    "modelReady": False,
    "warming": False,
}


# ─── Helpers ─────────────────────────────────────────────────────────────
def _now() -> float:
    return time.time()


def _ms(seconds: float) -> int:
    return int(seconds * 1000)


def _clean(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


def _norm(text: str) -> str:
    return _clean(text).lower()


def _glossary_lookup(src_lang: str, text: str, tgt_lang: str) -> Optional[str]:
    if src_lang == tgt_lang:
        return _clean(text)

    s = _clean(text)
    key = _norm(s)
    exact = _EXACT_GLOSSARY.get((src_lang, key))
    if exact and exact.get(tgt_lang):
        return exact[tgt_lang]

    # Turkish numeric spec atoms seen constantly in Epey payloads.
    if src_lang == "tr":
        import re

        tr_exact = {
            "usb 3.x adedi": {
                "en": "USB 3.x count", "es": "Cantidad USB 3.x", "fr": "Nombre USB 3.x",
                "pt": "Quantidade USB 3.x", "ru": "Количество USB 3.x",
            },
            "kart okuyucu specifications": {
                "en": "Card reader specifications",
                "es": "Especificaciones del lector de tarjetas",
                "fr": "Spécifications du lecteur de carte",
                "pt": "Especificações do leitor de cartão",
                "ru": "Характеристики кардридера",
            },
            "klavye specifications": {
                "en": "Keyboard specifications",
                "es": "Especificaciones del teclado",
                "fr": "Spécifications du clavier",
                "pt": "Especificações do teclado",
                "ru": "Характеристики клавиатуры",
            },
            "minirsel processing (npu)": {
                "en": "Neural processing (NPU)",
                "es": "Procesamiento neuronal (NPU)",
                "fr": "Traitement neuronal (NPU)",
                "pt": "Processamento neural (NPU)",
                "ru": "Нейронная обработка (NPU)",
            },
            "npu (sinirsel trading unit) name": {
                "en": "NPU (neural processing unit) name",
                "es": "Nombre de NPU (unidad de procesamiento neuronal)",
                "fr": "Nom du NPU (unité de traitement neuronal)",
                "pt": "Nome da NPU (unidade de processamento neural)",
                "ru": "Название NPU (нейронного процессорного блока)",
            },
            "pil specifications": {
                "en": "Battery specifications",
                "es": "Especificaciones de la batería",
                "fr": "Spécifications de la batterie",
                "pt": "Especificações da bateria",
                "ru": "Характеристики батареи",
            },
            "pil özellikleri": {
                "en": "Battery specifications",
                "es": "Especificaciones de la batería",
                "fr": "Spécifications de la batterie",
                "pt": "Especificações da bateria",
                "ru": "Характеристики батареи",
            },
            "li-po (lityum-polymer)": {
                "en": "Li-Po (lithium polymer)",
                "es": "Li-Po (polímero de litio)",
                "fr": "Li-Po (lithium-polymère)",
                "pt": "Li-Po (polímero de lítio)",
                "ru": "Li-Po (литий-полимер)",
            },
            "eyesafe (göz health certification)": {
                "en": "Eyesafe (eye health certification)",
                "es": "Eyesafe (certificación de salud ocular)",
                "fr": "Eyesafe (certification de santé oculaire)",
                "pt": "Eyesafe (certificação de saúde ocular)",
                "ru": "Eyesafe (сертификация защиты зрения)",
            },
            "eyesafe (göz sağlığı sertifikası)": {
                "en": "Eyesafe (eye health certification)",
                "es": "Eyesafe (certificación de salud ocular)",
                "fr": "Eyesafe (certification de santé oculaire)",
                "pt": "Eyesafe (certificação de saúde ocular)",
                "ru": "Eyesafe (сертификация защиты зрения)",
            },
            "hızlı": {
                "en": "Fast charging", "es": "Carga rápida", "fr": "Charge rapide",
                "pt": "Carregamento rápido", "ru": "Быстрая зарядка",
            },
            "non-flammable mat display": {
                "en": "Anti-glare matte display",
                "es": "Pantalla mate antirreflejo",
                "fr": "Écran mat antireflet",
                "pt": "Tela fosca antirreflexo",
                "ru": "Матовый антибликовый дисплей",
            },
        }
        if key in tr_exact:
            return tr_exact[key].get(tgt_lang)

        m = re.fullmatch(r"(\d{4})\s+([1-4])\.?\s*çeyrek", s, flags=re.I)
        if m:
            year, quarter = m.group(1), m.group(2)
            return {
                "en": f"{year} Q{quarter}", "es": f"{year} T{quarter}", "fr": f"{year} T{quarter}",
                "pt": f"{year} T{quarter}", "ru": f"{year} {quarter} кв.",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*adet", s, flags=re.I)
        if m:
            return m.group(1)

        m = re.fullmatch(r"(\d+)\s*x\s*(\d+)\s*piksel", s, flags=re.I)
        if m:
            w, h = m.group(1), m.group(2)
            return {
                "en": f"{w} x {h} pixels",
                "es": f"{w} x {h} píxeles",
                "fr": f"{w} x {h} pixels",
                "pt": f"{w} x {h} pixels",
                "ru": f"{w} x {h} пикселей",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(dakika|dk)", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} minutes", "es": f"{n} minutos", "fr": f"{n} minutes",
                "pt": f"{n} minutos", "ru": f"{n} минут",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*saat", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} hours", "es": f"{n} horas", "fr": f"{n} heures",
                "pt": f"{n} horas", "ru": f"{n} часов",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*döngü", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} cycles", "es": f"{n} ciclos", "fr": f"{n} cycles",
                "pt": f"{n} ciclos", "ru": f"{n} циклов",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+)\s*elementli\s+lens", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n}-element lens",
                "es": f"Lente de {n} elementos",
                "fr": f"Objectif à {n} éléments",
                "pt": f"Lente de {n} elementos",
                "ru": f"{n}-элементный объектив",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*milyar", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} billion", "es": f"{n} mil millones", "fr": f"{n} milliard",
                "pt": f"{n} bilhão", "ru": f"{n} млрд",
            }.get(tgt_lang)

        m = re.fullmatch(r"(.+?)\s*\(\s*yalnızca\s+esim\s*\)", s, flags=re.I)
        if m:
            prefix = m.group(1).strip()
            suffix = {
                "en": "Only eSIM", "es": "Solo eSIM",
                "fr": "eSIM uniquement", "pt": "Apenas eSIM",
                "ru": "Только eSIM",
            }.get(tgt_lang)
            return f"{prefix} ({suffix})" if suffix else None

        m = re.fullmatch(r"(.+?)\s+teknolojisi", s, flags=re.I)
        if m:
            prefix = m.group(1)
            return {
                "en": f"{prefix} technology", "es": f"Tecnología {prefix}", "fr": f"Technologie {prefix}",
                "pt": f"Tecnologia {prefix}", "ru": f"Технология {prefix}",
            }.get(tgt_lang)

        m = re.fullmatch(r"(.+?)\s+dijital\s+zoom", s, flags=re.I)
        if m:
            prefix = m.group(1)
            return {
                "en": f"{prefix} digital zoom", "es": f"Zoom digital {prefix}", "fr": f"Zoom numérique {prefix}",
                "pt": f"Zoom digital {prefix}", "ru": f"{prefix} цифровой зум",
            }.get(tgt_lang)

    # Almanca KAYNAK yolu 2026-08-21 kaldirildi (tek kaynagi Geizhals'ti;
    # katalogda geizhals kaynakli urun 0/107.449 — olculdu 2026-08-22).
    # Burada src_lang == "de" icin 91 satirlik bir exact-match tablosu vardi.
def _cache_key(src_lang: str, text: str) -> str:
    return f"{src_lang}\t{_clean(text)}"


def _cache_lookup(src_lang: str, text: str, tgt_lang: str) -> Optional[str]:
    override = _glossary_lookup(src_lang, text, tgt_lang)
    if override:
        return override
    with _cache_lock:
        entry = _cache.get(_cache_key(src_lang, text))
        if entry and entry.get(tgt_lang):
            return entry[tgt_lang]
    return None


def _cache_store(src_lang: str, text: str, tgt_lang: str, translation: str) -> None:
    global _cache_dirty
    with _cache_lock:
        key = _cache_key(src_lang, text)
        entry = _cache.setdefault(key, {})
        if entry.get(tgt_lang) != translation:
            entry[tgt_lang] = translation
            _cache_dirty = True


def _load_cache() -> None:
    global _cache
    if not CACHE_FILE.exists():
        return
    try:
        with CACHE_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            _cache = data
            print(f"[worker] cache loaded · {len(_cache)} keys", flush=True)
    except Exception as e:
        print(f"[worker] cache load failed: {e}", flush=True)


def _save_cache(force: bool = False) -> None:
    global _cache_dirty, _last_save
    with _cache_lock:
        if not _cache_dirty and not force:
            return
        if not force and (_now() - _last_save) < 2.0:
            return
        snapshot = dict(_cache)
        _cache_dirty = False
        _last_save = _now()
    try:
        tmp = CACHE_FILE.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False)
        tmp.replace(CACHE_FILE)
    except Exception as e:
        print(f"[worker] cache save failed: {e}", flush=True)


# ─── Model loading ───────────────────────────────────────────────────────
def _find_package(from_code: str, to_code: str):
    for p in argostranslate.package.get_installed_packages():
        if p.from_code == from_code and p.to_code == to_code:
            return p
    return None


def _get_pkg(from_code: str, to_code: str):
    """Return (ctranslate2.Translator, SentencePieceProcessor) or None."""
    key = (from_code, to_code)
    cached = _pkgs.get(key)
    if cached is not None:
        return cached
    with _pkg_lock:
        cached = _pkgs.get(key)
        if cached is not None:
            return cached
        pkg = _find_package(from_code, to_code)
        if pkg is None:
            return None
        pkg_path = Path(str(pkg.package_path))
        model_dir = pkg_path / "model"
        sp_path = pkg_path / "sentencepiece.model"
        if not model_dir.exists() or not sp_path.exists():
            return None
        print(f"[worker] loading {from_code}->{to_code} · {DEVICE}/{COMPUTE_TYPE}", flush=True)
        try:
            # On CUDA, intra_threads only controls host-side helpers (data
            # copy, sampling, beam-search book-keeping). Keep it low (2) so
            # the GPU does the real work and the CPU stays free for other
            # tasks. inter_threads=1 (model-parallel) is already optimal —
            # CT2 streams all batches through one model instance.
            translator = ctranslate2.Translator(
                str(model_dir),
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                inter_threads=1,
                intra_threads=2,
            )
        except Exception as e:
            # If int8_float16 isn't supported on this card, fall back.
            print(f"[worker] {from_code}->{to_code} load failed ({e}); retrying float16", flush=True)
            translator = ctranslate2.Translator(
                str(model_dir),
                device=DEVICE,
                compute_type="float16" if DEVICE == "cuda" else "int8",
            )
        sp = spm.SentencePieceProcessor()
        sp.load(str(sp_path))
        _pkgs[key] = (translator, sp)
        return _pkgs[key]


def _ensure_pivot_chain(from_code: str, to_code: str) -> List[Tuple[str, str]]:
    """
    Return the list of hops needed to translate from_code -> to_code.
    Prefers direct package; otherwise pivots through English.
    """
    if from_code == to_code:
        return []
    if _get_pkg(from_code, to_code) is not None:
        return [(from_code, to_code)]
    if from_code != "en" and to_code != "en":
        # Pivot via English.
        chain = []
        if _get_pkg(from_code, "en") is not None:
            chain.append((from_code, "en"))
        else:
            return []
        if _get_pkg("en", to_code) is not None:
            chain.append(("en", to_code))
        else:
            return []
        return chain
    return []


def warm_up() -> None:
    """Eagerly load all packages so first /translate is fast."""
    STATE["warming"] = True
    print(f"[worker] device={DEVICE} · compute_type={COMPUTE_TYPE} · batch={BATCH_SIZE}", flush=True)
    installed = argostranslate.package.get_installed_packages()
    print(f"[worker] {len(installed)} packages installed", flush=True)
    for p in installed:
        _get_pkg(p.from_code, p.to_code)
    STATE["modelReady"] = True
    STATE["warming"] = False
    print("[worker] all packages loaded — ready", flush=True)


# ─── Translation ─────────────────────────────────────────────────────────
# Pre-translation glossary: applied to the SOURCE text BEFORE Argos sees
# it. Replaces the handful of TR / DE spec words that the model regularly
# leaves untranslated inside compound atoms (e.g. "f/1.8 Diyafram" →
# "f/1.8 Aperture" → Argos passes that through unchanged → en->X hop
# translates "Aperture" naturally).
#
# Each key is matched case-insensitively as a whole word. Hyphenated /
# parenthesised forms are also matched. The table is keyed by SOURCE
# language so the same English replacement is reused for every target.
_PRE_FIX = {
    "tr": {
        # Camera / optics
        "Diyafram": "Aperture",
        "Düzeltme": "Correction",
        "Düzeltmesi": "Correction",
        "Kata Kadar": "up to",
        "kata kadar": "up to",
        "Hoparlör": "Speaker",
        "Hoparlörü": "Speaker",
        "Hoparlörler": "Speakers",
        # Body / sensors
        "Ön": "Front",
        "Arka": "Rear",
        "Ivme": "Acceleration",
        "İvme": "Acceleration",
        # Performance
        "Performans": "Performance",
        "Verimlilik": "Efficiency",
        "Coreli": "Core",
        "Çekirdek": "Core",
        "Çekirdekli": "Core",
        "İşlemci": "Processor",
        # UI / dictation
        "Standlı": "with stand",
        "Standsız": "without stand",
        "Standı": "stand",
        "Stant": "Stand",
        # Misc
        "Aydınlatma": "Lighting",
        "Aydınlatmalı": "Backlit",
        "Soğutma": "Cooling",
        "Buhar": "Steam",
        "Şarj": "Charging",
        "Hızlı": "Fast",
        "Kayıt": "Recording",
        "Kayıtlı": "Recorded",
        "Açılı": "Angle",
        "Açı": "Angle",
        "Genişliği": "Width",
        "Yüksekliği": "Height",
        "Derinliği": "Depth",
        "Yüzölçümü": "Area",
        "İnç": "Inch",
        "Piksel": "Pixel",
        "Çözünürlük": "Resolution",
        "Düşük": "Low",
        "Yüksek": "High",
        "Orta": "Medium",
        "Ekran Altı": "Under-Display",
        "Ekran Üstü": "Above-Display",
        "Sertifikası": "Certificate",
        "Sertifika": "Certificate",
        "Güncellemesi": "Update",
        "Güncelleme": "Update",
        "Güvenlik": "Security",
        "Garantisi": "Guarantee",
        "Garanti": "Guarantee",
        "Yıl": "Year",
        "Yıllık": "Year",
        "Dakika": "Minutes",
        "Saat": "Hour",
        "Saniye": "Second",
        "Döngü": "Cycle",
        "Sanal": "Virtual",
        "Artırma": "Expansion",
        "Ters": "Reverse",
        "Kablosuz": "Wireless",
        "Kablolu": "Wired",
        "Yapay Zeka": "Artificial Intelligence",
        "Sahne Tanıma": "Scene Recognition",
        "Parmak İzi": "Fingerprint",
        "Yüz Tanıma": "Face Recognition",
        "Su Geçirmez": "Waterproof",
        "Toz Geçirmez": "Dustproof",
        "Su Dayanımı": "Water Resistance",
        "Elementli": "Element",
        "Dijital": "Digital",
        "Analog": "Analog",
        "Tipi": "Type",
        "Tip": "Type",
        "Sayısı": "Count",
        "Sayı": "Count",
        "Modu": "Mode",
        "Mod": "Mode",
        "Modunda": "in Mode",
    },
}

# Build a single compiled regex per source language: longest keys first so
# "Yapay Zeka Sahne Tanıma" beats "Yapay Zeka" alone.
import re as _re
_PRE_FIX_COMPILED: Dict[str, List[Tuple[_re.Pattern, str]]] = {}
for _lang, _table in _PRE_FIX.items():
    _ordered = sorted(_table.items(), key=lambda kv: -len(kv[0]))
    _PRE_FIX_COMPILED[_lang] = [
        # Match whole-word with Unicode boundaries. Use lookahead/lookbehind
        # so we work inside "f/1.8 Diyafram" and similar token clusters.
        (_re.compile(r"(?<![A-Za-zÀ-ÿığşçöüİĞŞÇÖÜ])" + _re.escape(k) + r"(?![A-Za-zÀ-ÿığşçöüİĞŞÇÖÜ])"), v)
        for k, v in _ordered
    ]


def _apply_pre_fix(text: str, src_lang: str) -> str:
    rules = _PRE_FIX_COMPILED.get(src_lang)
    if not rules or not text:
        return text
    for pat, rep in rules:
        text = pat.sub(rep, text)
    return text


# Word-level overrides applied AFTER Argos returns. Argos models are tiny
# and occasionally pick the wrong English sense for a TR/DE word
# ("Kayıt" → "Registration" instead of "Recording", "mit" → ""). This
# table fixes the handful of known mistranslations we see in spec atoms
# without needing a second model pass.
_POST_FIX = {
    # TR source → various targets. Each rule fixes a known Argos mistranslation
    # or a Turkish word that Argos passed through verbatim into the English hop.
    # Order matters: longer phrases first, then single words.
    "tr->en": [
        # --- Argos sense errors -----------------------------------------------
        (r"\bRegistration\b", "Recording"),
        (r"\bRegistrations\b", "Recordings"),
        (r"\bInscription\b", "Recording"),
        (r"\bDisplay Six\b", "Under-Display"),
        (r"\bScreen Six\b", "Under-Screen"),
        (r"\bshow six\b", "under-display"),
        (r"\bShow Six\b", "Under-Display"),
        # f/N Diyafram → Argos sometimes maps "Diyafram" to "mm" / "m2". Force.
        (r"\b(f/\d+(?:[.,]\d+)?)\s+(?:mm|m2|m²)\b", r"\1 Aperture"),
        # --- Turkish words that survive the TR->EN hop verbatim ---------------
        (r"\bKata Kadar\b", "up to"),
        (r"\bkata kadar\b", "up to"),
        (r"\bDiyafram(?:ı|sı)?\b", "Aperture"),
        (r"\bdiyafram(?:ı|sı)?\b", "aperture"),
        (r"\bDüzeltme(?:si)?\b", "Correction"),
        (r"\bdüzeltme(?:si)?\b", "correction"),
        (r"\bHoparlör(?:ler|leri|ü|leri)?\b", "Speaker"),
        (r"\bhoparlör(?:ler|leri|ü|leri)?\b", "speaker"),
        (r"\bİvme(?:ölçer)?\b", "Accelerometer"),
        (r"\bivme(?:ölçer)?\b", "accelerometer"),
        (r"\bIvme(?:ölçer)?\b", "Accelerometer"),
        (r"\bPerformans\b", "Performance"),
        (r"\bperformans\b", "performance"),
        (r"\bVerimlilik\b", "Efficiency"),
        (r"\bverimlilik\b", "efficiency"),
        (r"\bÇekirdek(?:li|leri)?\b", "Core"),
        (r"\bçekirdek(?:li|leri)?\b", "core"),
        (r"\bCoreli\b", "Core"),
        (r"\bcoreli\b", "core"),
        (r"\b16 Core Motor\b", "16 Core Neural Engine"),  # special case
        (r"\bCore Motor\b", "Core Neural Engine"),  # generic catch
        (r"\bAydınlatma(?:lı)?\b", "Lighting"),
        (r"\baydınlatma(?:lı)?\b", "lighting"),
        (r"\bArka\b", "Rear"),
        (r"\bÖn(?=\s)", "Front"),
        (r"\bGüvenlik\b", "Security"),
        (r"\bGüncellemesi\b", "Update"),
        (r"\bGüncelleme\b", "Update"),
        (r"\bGarantisi\b", "Guarantee"),
        (r"\bGaranti\b", "Guarantee"),
        (r"\bÇözünürlük\b", "Resolution"),
        (r"\bAçılı\b", "Angle"),
        (r"\bAçı\b", "Angle"),
        (r"\bDüşük\b", "Low"),
        (r"\bYüksek\b", "High"),
        (r"\bOrta\b", "Medium"),
        (r"\bElementli\b", "Element"),
        (r"\bDijital\b", "Digital"),
        (r"\bdijital\b", "digital"),
        (r"\bSanal\b", "Virtual"),
        (r"\bArtırma\b", "Expansion"),
        (r"\bKablosuz\b", "Wireless"),
        (r"\bKablolu\b", "Wired"),
        (r"\bTers\b", "Reverse"),
        (r"\bSoğutma\b", "Cooling"),
        (r"\bBuhar\b", "Steam"),
        (r"\bSertifikası\b", "Certificate"),
        (r"\bSertifika\b", "Certificate"),
        (r"\bDakika\b", "Minutes"),
        (r"\bdakika\b", "minutes"),
        (r"\bSaat\b", "Hour"),
        (r"\bsaat\b", "hour"),
        (r"\bDöngü\b", "Cycle"),
        (r"\bdöngü\b", "cycle"),
        (r"\bYıl\b", "Year"),
        (r"\byıl\b", "year"),
        (r"\bParmak İzi\b", "Fingerprint"),
        (r"\bYüz Tanıma\b", "Face Recognition"),
        (r"\bYapay Zeka\b", "Artificial Intelligence"),
        (r"\bSahne Tanıma\b", "Scene Recognition"),
        (r"\bSu Geçirmez\b", "Waterproof"),
        (r"\bToz Geçirmez\b", "Dustproof"),
        (r"\bSu Dayanımı\b", "Water Resistance"),
        (r"\bGenişliği\b", "Width"),
        (r"\bYüksekliği\b", "Height"),
        (r"\bDerinliği\b", "Depth"),
        (r"\bİnç\b", "Inch"),
        (r"\bPiksel\b", "Pixel"),
        (r"\bStantsız\b", "without stand"),
        (r"\bStantlı\b", "with stand"),
        (r"\bStant\b", "Stand"),
        (r"\bStandlı\b", "with stand"),
        (r"\bStandsız\b", "without stand"),
        (r"\bSupportli\b", "Support"),
        (r"\bsupportli\b", "support"),
        (r"\bModunda\b", "Mode"),
        (r"\bSayısı\b", "Count"),
        (r"\bTipi\b", "Type"),
        (r"\bRengi\b", "Color"),
        # Argos drops Turkish "ı" -> "i" in some words on the TR->EN hop.
        # Match both forms so post-fix catches the ASCII variant too.
        (r"\bStandl[ıi]\b", "with stand"),
        (r"\bstandl[ıi]\b", "with stand"),
        (r"\bStandsız\b", "without stand"),
        (r"\bD[ıi]j[ıi]tal\b", "Digital"),
        (r"\bd[ıi]j[ıi]tal\b", "digital"),
        (r"\bKayit\b", "Recording"),
        (r"\bkayit\b", "recording"),
        # If somehow ASCII variants leak through, normalise them.
        (r"\bDiyafram\b", "Aperture"),
        (r"\bdiyafram\b", "aperture"),
        (r"\bHoparlor\b", "Speaker"),
        (r"\bhoparlor\b", "speaker"),
        (r"\bSogutma\b", "Cooling"),
        (r"\bsogutma\b", "cooling"),
        # And the multi-word Argos-pass-through cases.
        (r"\bKata Kadar\b", "up to"),
        (r"\bkata kadar\b", "up to"),
        (r"\bKata kadar\b", "up to"),
        (r"\bkata Kadar\b", "up to"),
        # Turkish number words leak through ("Üç Thunderbolt 4")
        (r"\bİki\b", "Two"),
        (r"\bÜç\b", "Three"),
        (r"\bDört\b", "Four"),
        (r"\bBeş\b", "Five"),
        (r"\bAltı\b", "Six"),
        (r"\bYedi\b", "Seven"),
        (r"\bSekiz\b", "Eight"),
        (r"\bDokuz\b", "Nine"),
        # Common Turkish spec key words seen in Epey
        (r"\bİşlemci Nesli\b", "Processor Generation"),
        (r"\bİşlemci\b", "Processor"),
        (r"\bNesli\b", "Generation"),
        (r"\bNesil\b", "Generation"),
        (r"\b(\d+)\.\s*Nesil\b", r"\1th Gen"),
        (r"\bAauppercase\b", "macOS"),  # macOS lower-mangled
        (r"\baauppercase\b", "macOS"),
        (r"\bcorrect$", "Correction"),    # "(Red-eye)correct" tail
        (r"\bkorrigiert$", "Korrektur"),  # DE equivalent

        # ── 2026-05-24 batch: residue/mistranslations seen in EN output ──
        # Position words leaking from TR
        (r"\bÖn Camera\b", "Front Camera"),
        (r"\bÖn kamera\b", "Front camera"),
        (r"\bÖn ([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\b", r"Front \1"),
        (r"\bArka Camera\b", "Rear Camera"),
        (r"\bArka kamera\b", "Rear camera"),
        (r"\bArka ([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\b", r"Rear \1"),
        (r"\bAlt\b(?=\s+[A-Z])", "Bottom"),
        (r"\bÜst\b(?=\s+[A-Z])", "Top"),
        (r"\bAna ([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\b", r"Main \1"),

        # Ordinals leaking from TR
        (r"\bÜçüncü\b", "Third"),
        (r"\büçüncü\b", "third"),
        (r"\bİkinci\b", "Second"),
        (r"\bikinci\b", "second"),
        (r"\bBirinci\b", "First"),
        (r"\bbirinci\b", "first"),
        (r"\bDördüncü\b", "Fourth"),
        (r"\bBeşinci\b", "Fifth"),

        # Common TR spec nouns leaking through
        (r"\bAydınlatma(?:sı|ları)?\b", "Lighting"),
        (r"\baydınlatma(?:sı|ları)?\b", "lighting"),
        (r"\bTepki Süresi\b", "Response Time"),
        (r"\btepki süresi\b", "response time"),
        (r"\bTepki\b", "Response"),
        (r"\bSüresi\b", "Time"),
        (r"\bsüresi\b", "time"),
        (r"\bÖmrü\b", "Life"),
        (r"\bömrü\b", "life"),
        (r"\bPil Ömrü\b", "Battery Life"),
        (r"\bBatarya Ömrü\b", "Battery Life"),
        (r"\bPil\b", "Battery"),
        (r"\bpil\b", "battery"),
        (r"\bBatarya\b", "Battery"),
        (r"\bbatarya\b", "battery"),
        (r"\bEkran\b", "Screen"),
        (r"\bekran\b", "screen"),
        (r"\bBellek\b", "Memory"),
        (r"\bbellek\b", "memory"),
        (r"\bDepolama\b", "Storage"),
        (r"\bdepolama\b", "storage"),
        (r"\bKlavye\b", "Keyboard"),
        (r"\bRenk\b", "Color"),
        (r"\bRenkler\b", "Colors"),
        (r"\bAğırlık\b", "Weight"),
        (r"\bBoyutlar\b", "Dimensions"),
        (r"\bBoyutu\b", "Size"),
        (r"\bÖzellikleri\b", "Specifications"),
        (r"\bÖzellikler\b", "Features"),
        (r"\bÖzellik\b", "Feature"),
        (r"\bSeri\b", "Series"),
        (r"\bAlt seri\b", "Sub-series"),
        (r"\bAlt Seri\b", "Sub-series"),
        (r"\bÇıkış\b", "Release"),
        (r"\bÇıkış Yılı\b", "Release Year"),
        (r"\bOutput year\b", "Release year"),
        (r"\bOutput Year\b", "Release Year"),
        (r"\bDuyuru\b", "Announcement"),
        (r"\bDurum\b", "Status"),
        (r"\bYükseklik\b", "Height"),
        (r"\bAmacı\b", "Purpose"),
        (r"\bKullanım amacı\b", "Use case"),
        (r"\bİşletim sistemi\b", "Operating system"),
        (r"\bİşletim Sistemi\b", "Operating System"),
        (r"\bBusiness system\b", "Operating system"),
        (r"\bbusiness system\b", "operating system"),
        (r"\bKullanıcı arayüzü\b", "User interface"),
        (r"\bArayüz\b", "Interface"),
        (r"\bSürümü\b", "Version"),
        (r"\bSürüm\b", "Version"),
        (r"\bPlanlanan\b", "Planned"),
        (r"\bGüncellenmiş\b", "Upgraded"),
        (r"\bDokunmatik yüzey\b", "Touchpad"),
        (r"\bDokunmatik\b", "Touch"),
        (r"\bParmak izi\b", "Fingerprint"),
        (r"\bParmak İzi Okuyucu\b", "Fingerprint Reader"),
        (r"\bParmak izi okuyucu\b", "Fingerprint reader"),
        (r"\bOkuyucu\b", "Reader"),
        (r"\bGöz\b", "Eye"),
        (r"\bSes\b(?=\s+[A-Z])", "Sound"),

        # Sensor section: TR "Sensörler" → Argos sometimes "Tags" (mistake)
        (r"^Tags$", "Sensors"),
        (r"\bSensörler\b", "Sensors"),
        (r"\bSensörü\b", "Sensor"),
        (r"\bSensör\b", "Sensor"),
        (r"\bJiroskop\b", "Gyroscope"),
        (r"\bIşık sensörü\b", "Light sensor"),
        (r"\bParlaklık sensörü\b", "Brightness sensor"),
        (r"\bYakınlık sensörü\b", "Proximity sensor"),
        (r"\bPusula\b", "Compass"),
        (r"\bBarometre\b", "Barometer"),

        # Common Argos hallucinations (semantic errors)
        (r"\bCurtain speed\b", "Shutter speed"),
        (r"\bcurtain speed\b", "shutter speed"),
        (r"\bCurtain Speed\b", "Shutter Speed"),
        (r"\bBulk battery\b", "Removable battery"),
        (r"\bbulk battery\b", "removable battery"),
        (r"\bBulk Battery\b", "Removable Battery"),
        (r"\bHeavy duty shooting\b", "Slow motion"),
        (r"\bheavy duty shooting\b", "slow motion"),
        (r"\bHeavy Duty Shooting\b", "Slow Motion"),
        (r"\bMultipiece\b", "Multimedia"),
        (r"\bmultipiece\b", "multimedia"),
        (r"\bSlow shooting\b", "Slow motion"),
        (r"\bslow shooting\b", "slow motion"),
        (r"\bMain processor\b", "Main processor"),
        (r"\bauxiliary processor\b", "auxiliary processor"),
        (r"\bAuxiliary processor\b", "Auxiliary processor"),
        (r"\bCheckout\b(?=$|\s+sensor|\s+reader)", "Checkout"),  # ambiguous; leave
        (r"\bFace ıdentification\b", "Face identification"),
        (r"\bFace identification\b", "Face Recognition"),
        (r"\bface ıdentification\b", "face identification"),
        (r"\bphone ıdentification\b", "face identification"),

        # Turkish months → English
        (r"\bOcak\b", "January"),
        (r"\bŞubat\b", "February"),
        (r"\bMart\b", "March"),
        (r"\bNisan\b", "April"),
        (r"\bMayıs\b", "May"),
        (r"\bHaziran\b", "June"),
        (r"\bTemmuz\b", "July"),
        (r"\bAğustos\b", "August"),
        (r"\bEylül\b", "September"),
        (r"\bEkim\b", "October"),
        (r"\bKasım\b", "November"),
        (r"\bAralık\b", "December"),

        # Section header noise
        (r"\bNews\b(?=\s|$)", "Stereo"),     # Argos mistranslates "Stereo" header
        (r"\bSpecific\b", "Special"),
        (r"\bMultipiece\b", "Multimedia"),
        (r"\bGenel\b", "General"),
        (r"\bgenel\b", "general"),

        # Truncated atoms — common in cache
        (r"\bIvmeölç\b", "Accelerometer"),
        (r"\bivmeölç\b", "Accelerometer"),
        (r"\bİvmeölç\b", "Accelerometer"),

        # Translations: speaker plural form
        (r"\b(\d+)\s+Speaker\b(?!s)", r"\1 Speakers"),
        (r"\b(\d+)\s+speaker\b(?!s)", r"\1 speakers"),
        (r"\bDouble speaker\b", "Stereo speakers"),
        (r"\bDouble cell battery\b", "Dual-cell battery"),
        (r"\bdouble cell battery\b", "dual-cell battery"),

        # ── 2026-05-29 batch: CPU / GPU spec terms seen on Epey ────────────
        # Argos drops the leading "Transistör" and leaves the genitive
        # "Mesafesi" (its distance), which is meaningless in EN. The whole
        # phrase means "process node / manufacturing process".
        (r"\bTransist[öo]r Mesafesi\b", "Process Node"),
        (r"\btransist[öo]r mesafesi\b", "process node"),
        (r"^\s*Mesafesi\s*$", "Process Node"),
        (r"^\s*mesafesi\s*$", "process node"),
        # Çarpan Kilidi → "Multiplier Lock" (CPU unlocked/locked status)
        (r"\b[ÇC]arpan Kilidi\b", "Multiplier Lock"),
        (r"\b[çc]arpan kilidi\b", "multiplier lock"),
        (r"^\s*Kilidi\s*$", "Multiplier Lock"),
        (r"^\s*kilidi\s*$", "multiplier lock"),
        (r"^\s*\(Kilitli\)\s*$", "(Locked)"),
        (r"^\s*\(Kilidi A[çc][ıi]k\)\s*$", "(Unlocked)"),
        (r"^\s*Kilitli\s*$", "Locked"),
        (r"^\s*kilitli\s*$", "locked"),
        (r"^\s*Kilidi A[çc][ıi]k\s*$", "Unlocked"),
        # Isı Yayma Kapasitesi (TDP) → "TDP" or "Thermal Design Power"
        (r"\bIsı Yayma Kapasitesi\b", "Thermal Design Power"),
        (r"\bısı yayma kapasitesi\b", "thermal design power"),
        (r"\bYayma Kapasitesi\b", "Thermal Design Power"),
        (r"\byayma kapasitesi\b", "thermal design power"),
        (r"\bYayma Capacity\b", "Thermal Design Power"),
        # YZ Turkish abbreviation for AI — replace with English AI everywhere
        (r"\bYapay Zeka \(YZ\)\b", "Artificial Intelligence (AI)"),
        (r"\bArtificial Intelligence \(YZ\)\b", "Artificial Intelligence (AI)"),
        (r"\(YZ\)", "(AI)"),
        (r"\bYZ Core\b", "AI Cores"),
        (r"\bYZ Performance\b", "AI Performance"),
        (r"\bYZ H[ıi]zland[ıi]r[ıi]c[ıi]\b", "AI Accelerator"),
        # Common Epey spec section/key terms
        (r"\bDesteklediği Teknolojiler\b", "Supported Technologies"),
        (r"\bdesteklediği teknolojiler\b", "supported technologies"),
        (r"\bPassMark Puanı \(Tekil\)\b", "PassMark Single-Thread Score"),
        (r"\bPassMark Puanı \(Çoğul\)\b", "PassMark Multi-Thread Score"),
        (r"\bPassMark Puanı\b", "PassMark Score"),
        (r"\bÇıkış Dönemi\b", "Release Quarter"),
        (r"\bÇıkış Yılı\b", "Release Year"),
        (r"\bJenerasyon\b", "Generation"),
        (r"\bjenerasyon\b", "generation"),
        (r"\bArtırılmış Frekans\b", "Boost Frequency"),
        (r"\bartırılmış frekans\b", "boost frequency"),
        (r"\bTemel Frekans\b", "Base Frequency"),
        (r"\btemel frekans\b", "base frequency"),
        (r"\bBellek Hızı\b", "Memory Speed"),
        (r"\bBellek Türü\b", "Memory Type"),
        (r"\bİş Parçacığı\b", "Thread"),
        (r"\biş parçacığı\b", "thread"),
        (r"\bÖnbellek\b", "Cache"),
        (r"\bönbellek\b", "cache"),
        (r"\bPerformans Çekirdeği\b", "Performance Core"),
        (r"\bperformans çekirdeği\b", "performance core"),
        (r"\bDahili Grafik İşlemci\b", "Integrated Graphics"),
        (r"\bGrafik İşlemci Modeli\b", "Graphics Processor Model"),
        (r"\bGrafik İşlemci Çekirdeği\b", "Graphics Processor Cores"),
        (r"\bSoket\b", "Socket"),
        (r"\bSıcaklık\b", "Temperature"),
        (r"\bsıcaklık\b", "temperature"),
        # GPU-specific
        (r"\bIşın İzleme\b", "Ray Tracing"),
        (r"\bışın izleme\b", "ray tracing"),
        (r"\bIşın İzleme Çekirdeği\b", "Ray Tracing Cores"),
        (r"\bIşın İzleme Çekirdekleri\b", "Ray Tracing Cores"),
        (r"\bGölgeleme Ünitesi\b", "Shading Units"),
        (r"\bgölgeleme ünitesi\b", "shading units"),
        (r"\bAkıcı Oyun Çözünürlüğü\b", "Smooth Gaming Resolution"),
        (r"\bGrafik Kartı Gücü\b", "Graphics Card Power"),
        (r"\bGPU Mimarisi\b", "GPU Architecture"),
        (r"\bGPU Çıkış Yılı\b", "GPU Release Year"),
        (r"\bSoğutma Tipi\b", "Cooling Type"),
        (r"\bsoğutma tipi\b", "cooling type"),
        (r"\bFan Soğutmalı\b", "Fan Cooled"),
        (r"\bfan soğutmalı\b", "fan cooled"),
        (r"\bÇift Rulmanlı Fan\b", "Dual Ball Bearing Fan"),
        (r"\bMetal Ön Plaka\b", "Metal Backplate"),
        (r"\bİşlemci Üreticisi\b", "Processor Manufacturer"),
        (r"\bİşlemci Teknolojileri\b", "Processor Technologies"),
        (r"\bÜrün Ailesi\b", "Product Family"),
        (r"\bÜrün Serisi\b", "Product Series"),
        (r"\bÜrün Kodu\b", "Product Code"),
        (r"\bVARYANT\b", "VARIANT"),
        (r"\bVaryant\b", "Variant"),
        (r"\bvaryant\b", "variant"),
        # Common YESYANT-style corruption from Argos
        (r"\bYESYANT\b", "VARIANT"),
        (r"\bYesyant\b", "Variant"),
        # ── 2026-05-29 batch #2: Apple Watch / Smartwatch leakage ─────────
        # Argos signature corruptions seen on Epey smartwatch + CPU pages.
        # "Audioli" / "Audiolu" — kept "Audio" + Turkish "-li" suffix glued
        # back to it. Original Turkish was "Sesli" ("with sound", e.g. voice
        # notes). Drop the suffix so it reads cleanly.
        (r"\bAudioli\b", "Voice"),
        (r"\baudioli\b", "voice"),
        (r"\bAudiolu\b", "Voice"),
        # English-stem + Turkish-suffix glue ("minutesda", "hourslik")
        (r"\b(\d+)\s+minutesda\b", r"\1 minutes after"),
        (r"\b(\d+)\s+hourslik\b", r"\1 hours"),
        (r"\bminutesda\b", "minutes after"),
        (r"\bhourslik\b", "hours"),
        (r"\bdakikada\b", "minutes after"),
        # Turkish stop words / connectives that survive unchanged
        (r"\b ve \b", " and "),
        (r"\b ile \b", " with "),
        (r"\b için \b", " for "),
        (r"\b icin \b", " for "),
        (r"\b olan \b", " "),
        (r"\b olarak \b", " as "),
        (r"\b gibi \b", " like "),
        # Turkish nouns Argos didn't translate
        (r"\bHava Status\b", "Weather"),
        (r"\bHava\b(?=\s+(?:Status|Information|Bilgisi))", "Weather"),
        (r"\bResmi Product\b", "Official Product"),
        (r"\bResmi\b(?=\s+Product)", "Official"),
        (r"\bTasarruf Mode\b", "Saving Mode"),
        (r"\bPower Tasarruf\b", "Power Saving"),
        (r"\bDolum Time\b", "Charging Time"),
        (r"\bDolum\b", "Charge"),
        (r"\bTakibi\b", "Tracking"),
        (r"\btakibi\b", "tracking"),
        (r"\bMesafe\b", "Distance"),
        (r"\bGelgit\b", "Tide"),
        (r"\bSpor Mode\b", "Sport Mode"),
        (r"\bMulti Spor\b", "Multi Sport"),
        (r"\bSpor\b", "Sport"),
        (r"\bKilidi\b", "Lock"),
        (r"\bKilit\b", "Lock"),
        (r"\bKilitli\b", "Locked"),
        (r"\bKalori\b", "Calorie"),
        (r"\bkalori\b", "calorie"),
        (r"\bOksijen\b", "Oxygen"),
        (r"\bNefes\b", "Breath"),
        (r"\bStres\b", "Stress"),
        (r"\bRitim\b", "Rhythm"),
        (r"\bRuh Hali\b", "Mood"),
        (r"\bRuh\b(?=\s+Hali)", "Mood"),
        (r"\bTansiyon\b", "Blood Pressure"),
        (r"\bHiper Tansiyon\b", "Hypertension"),
        (r"\bUyku Apnesi\b", "Sleep Apnea"),
        (r"\bUyku\b(?=\s+(?:Apnesi|Mode))", "Sleep"),
        (r"\bHareketsizlik\b", "Inactivity"),
        (r"\bKandaki\b", "Blood"),
        (r"\bKanda\b", "Blood"),
        (r"\bTavsiyesi\b", "Recommendation"),
        (r"\bKimlik\b", "Identity"),
        (r"\bElektriksel\b", "Electrical"),
        (r"\bMesaj\b", "Message"),
        (r"\bmesaj\b", "message"),
        (r"\bSesli\b", "Voice"),
        (r"\bsesli\b", "voice"),
        (r"\bSesli Not\b", "Voice Memo"),
        (r"\bEtmeyin\b", ""),  # imperative "don't" — meaningless on its own
        (r"\bVerme\b", ""),    # verbal noun — meaningless on its own
        (r"\bGGymKit Radio Etmeyin\b", "GymKit Don't Broadcast"),
        # Wrong Argos sense translations the user flagged
        (r"\bHeart Speed\b", "Heart Rate"),
        (r"\bheart speed\b", "heart rate"),
        (r"\bCalculator Machine\b", "Calculator"),
        (r"\bCalculator machine\b", "Calculator"),
        (r"\bSiri Assistant Hour\b", "Siri Assistant"),
        (r"\bPlayer Hour\b", "Player Timer"),
        (r"\bHeadphone with Pairing\b", "Headphone Pairing"),
        (r"\bOffline Offline\b", "Offline"),
        (r"\bAudio Audio\b", "Audio"),
        (r"\bAudioli Audioli\b", "Voice"),
        (r"\bMy phone Find\b", "Find My Phone"),
        (r"\bMy Phone Find\b", "Find My Phone"),
        (r"\bEl with Device Control\b", "Hand Gesture Control"),
        (r"\bHead \(Walkie-Talkie\)\b", "Walkie-Talkie"),
        (r"\bAktivite\b", "Activity"),
        (r"\baktivite\b", "activity"),
        (r"\bDurum\b", "Status"),
        (r"\bdurum\b", "status"),
        (r"\bGörüşme\b", "Call"),
        (r"\bGörüşmesi\b", "Call"),
        (r"\bGörüşme Geçmişi\b", "Call History"),
        (r"\bCagri Gecmisi\b", "Call History"),
        (r"\bAsistan\b", "Assistant"),
        (r"\basistan\b", "assistant"),
        (r"\bBildirim\b", "Notification"),
        (r"\bbildirim\b", "notification"),
        (r"\bGünlük\b(?=\s+(?:Health|Tracking|Activity))", "Daily"),
        (r"\bGünlük\b", "Daily"),
        (r"\bgünlük\b", "daily"),
        (r"\bHaftalık\b", "Weekly"),
        (r"\bAylık\b", "Monthly"),
        (r"\bCihaz\b", "Device"),
        (r"\bcihaz\b", "device"),
        (r"\bKomut\b", "Command"),
        (r"\bkomut\b", "command"),
        (r"\bKontrol\b", "Control"),
        (r"\bkontrol\b", "control"),
        # SAR / radiation specs
        (r"\bSAR \(Vücut\)\b", "SAR (Body)"),
        (r"\bSAR \(Kafa\)\b", "SAR (Head)"),
        # Duplicate Turkish/English glue patterns
        (r"\bGelgit Graphics\b", "Tide Graphics"),
        (r"\bGelgit\b", "Tide"),
        # Common bandwidth/interface terms
        (r"\bMemory Band Width\b", "Memory Bandwidth"),
        (r"\bMemory Interface Width\b", "Memory Interface Width"),
        (r"\bEfektif Memory Speed\b", "Effective Memory Speed"),
        (r"\bEfektif Bellek Hızı\b", "Effective Memory Speed"),
        # Numeric units that occasionally leak as Turkish words
        (r"\bbirim\b", "units"),
        (r"\bBirim\b", "Units"),
        # Server CPU terms
        (r"\bSunucu\b", "Server"),
        (r"\bsunucu\b", "server"),
        (r"\bMasaüstü\b", "Desktop"),
        (r"\bmasaüstü\b", "desktop"),
        (r"\bİşlemci Ailesi\b", "Processor Family"),
        (r"\bİşlemci Türü\b", "Processor Type"),
        (r"\bDiğer Bağlantılar\b", "Other Connections"),
        (r"\bdiğer bağlantılar\b", "other connections"),
        (r"\bHDCP Desteği\b", "HDCP Support"),
        (r"\bhdcp desteği\b", "HDCP support"),
    ],
    "tr->de": [
        (r"\bRegistrierung\b", "Aufnahme"),
        (r"\bDisplay Sechs\b", "Unter-Display"),
        (r"\bAnzeige Sechs\b", "Unter-Display"),
        (r"\bKata Kadar\b", "bis zu"),
        (r"\bStandl[ıi]\b", "mit Standfuß"),
    ],
    "tr->es": [
        (r"\bRegistro\b", "Grabación"),
        (r"\bPantalla Seis\b", "Bajo pantalla"),
        (r"\bDisplay Seis\b", "Bajo pantalla"),
        (r"\bKata Kadar\b", "hasta"),
        (r"\bStandl[ıi]\b", "con soporte"),
    ],
    "tr->fr": [
        (r"\bInscription\b", "Enregistrement"),
        (r"\bAffichage Six\b", "Sous-écran"),
        (r"\bAffichage 6\b", "Sous-écran"),
        (r"\bKata Kadar\b", "jusqu'à"),
        (r"\bStandl[ıi]\b", "avec support"),
    ],
    "tr->pt": [
        (r"\bRegistro\b", "Gravação"),
        (r"\bmostrar seis\b", "sob o ecrã"),
        (r"\bMostrar Seis\b", "Sob o ecrã"),
        (r"\bKata Kadar\b", "até"),
        (r"\bStandl[ıi]\b", "com suporte"),
    ],
    "tr->ru": [
        (r"\bРегистрация\b", "Запись"),
        (r"\bохлаждения Steam\b", "паровое охлаждение"),
        (r"\bSteam охлаждение\b", "Паровое охлаждение"),
        (r"\bDisplay Six\b", "Подэкранный"),
        (r"\bKata Kadar\b", "до"),
        (r"\bStandl[ıi]\b", "с подставкой"),
    ],
    # DE source → fix English/Turkish residue + German words that survive the
    # DE→EN hop verbatim.
    "de->en": [
        (r"\bwith DE layout\b", "with German layout"),
        (r"\bwith DE Layout\b", "with German layout"),
        (r"\bfettabweisend(?:e|er|en|es)?\b", "oil-repellent"),
        (r"\bFettabweisend(?:e|er|en|es)?\b", "Oil-repellent"),
        (r"\bSteuerkreuz\b", "Directional Pad"),
        (r"\bAktionstasten\b", "Action Buttons"),
        (r"\bFunktionstasten\b", "Function Buttons"),
        (r"\bSchultertasten\b", "Shoulder Buttons"),
        (r"\bAnalogsticks\b", "Analog Sticks"),
        (r"\bkonkav\b", "concave"),
        (r"\bkonvex\b", "convex"),
        (r"\bgerade\b", "straight"),
        (r"\bAnschlüsse\b", "Connections"),
        (r"\bAnschluss\b", "Connection"),
        (r"\bTastatur\b", "Keyboard"),
        (r"\bbeleuchtet\b", "backlit"),
        (r"\bBeleuchtet\b", "Backlit"),
        (r"\bbeschichtung\b", "coating"),
        (r"\bBeschichtung\b", "Coating"),
        (r"\bGlas\b(?!\s*[0-9])", "Glass"),
        (r"\bGehäuse\b", "Housing"),
        (r"\bGehäuseform\b", "Form factor"),
        (r"\bBeschleunigungssensor\b", "Accelerometer"),
        (r"\bAnnäherungssensor\b", "Proximity sensor"),
        (r"\bLichtsensor\b", "Light sensor"),
        (r"\bFingerabdrucksensor\b", "Fingerprint sensor"),
        (r"\bAkkulaufzeit\b", "Battery life"),
        (r"\bAkku\b", "Battery"),
        (r"\bBildschirmdiagonale\b", "Screen diagonal"),
        (r"\bAuflösung\b", "Resolution"),
        (r"\bBildwiederholrate\b", "Refresh rate"),
        (r"\bReaktionszeit\b", "Response time"),
        (r"\bHelligkeit\b", "Brightness"),
        (r"\bhöhenverstellbar\b", "height-adjustable"),
        (r"\bSchnellladung\b", "Fast charging"),
        (r"\bschnellladen\b", "fast charging"),
        (r"\bkabelloses Laden\b", "wireless charging"),
        (r"\bSicherheits-Updates\b", "Security Updates"),
        (r"\bSicherheitsupdate\b", "Security Update"),
        (r"\bGarantie\b", "Guarantee"),
        (r"\bJahre\b", "Years"),
        (r"\bStunden\b", "Hours"),
        (r"\bMinuten\b", "Minutes"),
        (r"\bfest verbaut\b", "built-in"),
        (r"\bnicht erweiterbar\b", "not expandable"),
        (r"\berweiterbar\b", "expandable"),
        (r"\bbelegt\b", "occupied"),
        (r"\bArchitektur\b", "Architecture"),
        (r"\bEingabe\b", "Input"),
        (r"\bZubehör\b", "Accessories"),
        (r"\bSchwarz\b", "Black"),
        (r"\bWeiß\b", "White"),
        (r"\bGrau\b", "Gray"),
        (r"\bSilber\b", "Silver"),
        (r"\bAbmessungen\b", "Dimensions"),
        (r"\bGewicht\b", "Weight"),
        (r"\bHerstellername\b", "Manufacturer name"),
        (r"\büber\b", "above"),
        (r"\bunter\b", "below"),
        (r"\blinks\b", "left"),
        (r"\brechts\b", "right"),
        (r"\boben\b", "top"),
        (r"\bunten\b", "bottom"),
        # More German residue observed in real scrapes
        (r"\bvorne\b", "front"),
        (r"\bhinten\b", "rear"),
        (r"\bzertifiziert\b", "certified"),
        (r"\bStaubschutz\b", "dust protection"),
        (r"\bSchutz gegen fallendes Tropfwasser\b", "protection against falling drops of water"),
        (r"\bSchutz gegen\b", "protection against"),
        (r"\bTropfwasser\b", "dripping water"),
        (r"\bHelligkeitssensor\b", "Brightness sensor"),
        (r"\bLichtsensor\b", "Light sensor"),
        (r"\bGyroskop\b", "Gyroscope"),
        (r"\bKompass\b", "Compass"),
        (r"\bBarometer\b", "Barometer"),
        (r"\bberechnet\b", "calculated"),
        (r"\bangegeben\b", "stated"),
        (r"\bgemessen\b", "measured"),
        (r"\bNetzanschluss\b", "Mains connection"),
        (r"\bAusliefer(?:ung|t)\b", "Delivery"),
        (r"\bsonstig(?:e|es|er|en)?\b", "other"),
        (r"\bweitere\b", "additional"),
        (r"\bca\.?\b", "approx."),
        (r"\bbis zu\b", "up to"),
        (r"\bbis\b", "up to"),
        (r"\bunabhängig\b", "independent"),
        (r"\bJahr\b", "Year"),
        (r"\b(\d+)\s+Jahre?\b", r"\1 years"),
    ],
    "de->tr": [
        (r"\billuminated\b", "aydınlatmalı"),
        (r"\bIlluminated\b", "Aydınlatmalı"),
        (r"\bDE Layout ile\b", "Almanca düzenli"),
        (r"\bmit DE Layout\b", "Almanca düzenli"),
    ],
    # EN pivot hops — applied to translations coming OUT of English on the
    # way to a target language. Catches residue that survives the hop
    # because Argos's en->X model doesn't recognise the loanword.
    "en->tr": [
        (r"\billuminated\b", "aydınlatmalı"),
        (r"\bIlluminated\b", "Aydınlatmalı"),
        (r"\bUnder-Display\b", "Ekran Altı"),
        (r"\bUnder-Screen\b", "Ekran Altı"),
        (r"\bSteam Cooling\b", "Buhar Soğutma"),
        # en->tr hop residue. Argos en→tr is the weakest of the bunch.
        (r"\bBattery Batarya\b", "Batarya"),
        (r"\bBattery\b", "Batarya"),
        (r"\bConnectivity\b", "Bağlantı"),
        (r"\bDisplay\b", "Ekran"),
        (r"\bEkran görüntüsü\b", "Ekran"),
        (r"\bGenel General\b", "Genel"),
        (r"\bUltrasonik sensör\b", "Parlaklık sensörü"),
        (r"\bBrightness sensor\b", "Parlaklık sensörü"),
        (r"\bLight sensor\b", "Işık sensörü"),
        (r"\bSpecifications\b", "Özellikleri"),
        (r"\bGuarantee\b", "Garanti"),
        (r"\bperformance Core\b", "Performans Çekirdeği"),
        (r"\bPerformance Core\b", "Performans Çekirdeği"),
        (r"\bEfficiency Core\b", "Verimlilik Çekirdeği"),
        (r"\bNeural Engine\b", "Sinirsel Motor"),
        (r"\bUp-Down\b", "Yukarı-Aşağı"),
        (r"\bRight-Left\b", "Sağ-Sol"),
        (r"\bFront camera\b", "Ön kamera"),
        (r"\bRear camera\b", "Arka kamera"),
        (r"\bMain camera\b", "Ana kamera"),
        (r"\bScreen size\b", "Ekran boyutu"),
        (r"\bScreen-to-Body\b", "Ekran-Gövde"),
        (r"\bDimensions\b", "Boyutlar"),
        (r"\bWeight\b", "Ağırlık"),
        (r"\bColor\b", "Renk"),
        (r"\bFingerprint reader\b", "Parmak izi okuyucu"),
        (r"\bPower supply\b", "Güç kaynağı"),
        (r"\bOperating system\b", "İşletim sistemi"),
        (r"\bKeyboard\b", "Klavye"),
        (r"\bTouchpad\b", "Dokunmatik yüzey"),
        (r"\bStorage\b", "Depolama"),
        (r"\bMemory\b", "Bellek"),
        (r"\bRAM\b", "RAM"),  # no-op but documents
        (r"\bProcessor\b", "İşlemci"),
        (r"\bGraphics card\b", "Ekran kartı"),
        (r"\bCooling\b", "Soğutma"),
        (r"\bChipset\b", "Yonga seti"),
        (r"\bRelease\b", "Çıkış"),
        (r"\bPricing\b", "Fiyatlandırma"),
    ],
    "en->es": [
        (r"\bUnder-Display\b", "Bajo pantalla"),
        (r"\billuminated\b", "iluminado"),
        (r"\bSteam Cooling\b", "Refrigeración por vapor"),
    ],
    "en->fr": [
        (r"\bUnder-Display\b", "Sous-écran"),
        (r"\billuminated\b", "illuminé"),
        (r"\bSteam Cooling\b", "Refroidissement par vapeur"),
    ],
    "en->pt": [
        (r"\bUnder-Display\b", "Sob o ecrã"),
        (r"\billuminated\b", "iluminado"),
        (r"\bSteam Cooling\b", "Refrigeração a vapor"),
    ],
    "en->ru": [
        (r"\bUnder-Display\b", "Подэкранный"),
        (r"\billuminated\b", "подсветкой"),
        (r"\bSteam Cooling\b", "Паровое охлаждение"),
        (r"\bохлаждения Steam\b", "паровое охлаждение"),
        (r"\bSteam охлаждение\b", "Паровое охлаждение"),
    ],
    "en->de": [
        (r"\bUnder-Display\b", "Unter-Display"),
        (r"\billuminated\b", "beleuchtet"),
        (r"\bSteam Cooling\b", "Dampfkühlung"),
    ],
}
import re as _re
_POST_FIX_COMPILED = {k: [(_re.compile(p), r) for p, r in v] for k, v in _POST_FIX.items()}


# Collapse same-word repeats Argos produces on short section headers.
# Catches: "Audio Audio", "Tasarım Tasarımı" (suffix variant),
# "Software Software Software", "Genel General General General", etc.
_DEDUP_RE = _re.compile(r"\b(\w{3,})(?:\s+\1\w{0,3})+\b", _re.UNICODE | _re.IGNORECASE)


def _collapse_repeats(text: str) -> str:
    if not text or " " not in text:
        return text
    prev = None
    cur = text
    # Iterate so we collapse "Genel General General General" → "Genel" in
    # two passes (the suffix-tolerant variant catches "Tasarım/Tasarımı").
    for _ in range(3):
        new = _DEDUP_RE.sub(lambda m: m.group(1), cur)
        if new == cur:
            break
        cur = new
    return cur


_DEGEN_ESIK = 4


def _is_degenerate(text: str) -> bool:
    """Ceviri dongusu mu? admin/js/spec_i18n.js:_isDegenerateText ile AYNI kural.

    Olcum SATIR SATIR ve jetonlama BOSLUKLA yapilir: cok satirli bir ozellik
    listesini duzlestirmek komsu olmayan tekrarlari yan yana getirir, harf/rakam
    jetonlamasi ise "Android 4.4.4" gibi surum numaralarini uc ayri "4" sanip
    gecerli veriyi bozuk gosterir (ilk denemede 389 urun boyle yanlis
    isaretlenmisti).
    """
    s = text or ""
    if len(s) < 24:
        return False
    for satir in s.replace("\r", "\n").split("\n"):
        j = [x for x in satir.lower().split() if x]
        if len(j) < _DEGEN_ESIK:
            continue
        ard = 1
        for i in range(1, len(j)):
            ard = ard + 1 if j[i] == j[i - 1] else 1
            if ard >= _DEGEN_ESIK:
                return True
        for n in range(2, 5):
            for i in range(0, len(j) - 2 * n + 1):
                k = 1
                while i + (k + 1) * n <= len(j) and j[i:i + n] == j[i + k * n:i + (k + 1) * n]:
                    k += 1
                if k >= _DEGEN_ESIK:
                    return True
    return False


def _apply_post_fix(text: str, from_code: str, to_code: str) -> str:
    rules = _POST_FIX_COMPILED.get(f"{from_code}->{to_code}")
    if rules and text:
        for pat, rep in rules:
            text = pat.sub(rep, text)
    # Always run the repeat-collapse, even when there are no per-pair rules.
    text = _collapse_repeats(text)
    return text


# Residue detectors per language pair. Returns True if the translation still
# contains source-language words/characters that the model failed to convert.
# Used by JS to decide which atoms to send to DeepSeek as fallback.
_TR_RESIDUE_CHARS = _re.compile(r"[şŞğĞıİ]")
_TR_RESIDUE_WORDS = _re.compile(r"\b(?:ve|veya|ile|için|bir|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yüz|bin|saat|dakika|saniye|gün|ay|yıl|döngü|şarj|hızlı|kablosuz|kablolu|sanal|gerçek|açılı|açı|piksel|inç|çözünürlük|hoparlör|diyafram|düzeltme|özellikler|özellik|tip|tipi|sayısı|sayı|rengi|renk|boyutu|boyut|standlı|stant|coreli|çekirdek|performans|verimlilik|ivme|ivmeölçer|sürücü|aydınlatma|aydınlatmalı|nesli|nesil|işlemci|bağlantı|bağlantılar|depolama|bellek|garanti|sertifika|güvenlik|güncelleme|güncellemesi|garantisi|yapay|zeka|sahne|tanıma|parmak|izi|yüz|tanıma|su|geçirmez|toz|geçirmez|dayanımı|elementli|dijital|analog|modu|moduna|ön|arka|alt|üst|açma|kapama|standby|powerful|printing|noise|blocking|dining|kayıt|kayıtlı|kata|kadar)\b", _re.IGNORECASE)


def _has_residue(text: str, src_lang: str, tgt_lang: str) -> bool:
    """True if `text` looks like Argos left source-language fragments."""
    if not text or src_lang == tgt_lang:
        return False
    # Repeats survived dedup? Treat as broken.
    words = text.split()
    if len(words) >= 4 and len(set(w.lower() for w in words)) <= len(words) // 2:
        return True
    if src_lang == "tr":
        if tgt_lang != "tr" and _TR_RESIDUE_CHARS.search(text):
            return True
        if _TR_RESIDUE_WORDS.search(text):
            return True
    # Pass-through detection: source = target verbatim AND the source contained
    # at least one real word (not just a brand/model code).
    return False


def _translate_one_hop(texts: List[str], from_code: str, to_code: str) -> List[str]:
    pkg = _get_pkg(from_code, to_code)
    if pkg is None:
        return texts  # No model installed — return verbatim
    translator, sp = pkg
    # Pre-fix DISABLED — injecting English words ("up to") into a Turkish
    # source made the Argos decoder hallucinate them back into Turkish
    # ("Kata Kadar") in some atoms. Cleanup is now done entirely on the
    # OUTPUT side via _POST_FIX, applied per-hop.
    encoded = [sp.encode(t, out_type=str) for t in texts]
    results = translator.translate_batch(
        encoded,
        max_batch_size=BATCH_SIZE,
        beam_size=BEAM_SIZE,
        return_scores=False,
        max_decoding_length=320,
        # Block 3-gram repetitions: without this Argos sometimes loops on
        # short section headers ("Design design design design design design"
        # was a typical 6× repeat). 3-gram is small enough to stay accurate
        # on legitimate runs like "Wi-Fi Wi-Fi 6E".
        no_repeat_ngram_size=3,
        # Penalise short hypotheses so the decoder doesn't bail out half-way.
        length_penalty=1.0,
        # Mild repetition penalty for the same reason; >1 discourages
        # token reuse without forbidding it outright (which would hurt
        # legitimate cases like "USB USB-C").
        repetition_penalty=1.15,
    )
    out = []
    for r, encoded_src in zip(results, encoded):
        pieces = r.hypotheses[0] if r.hypotheses else encoded_src
        # sp.decode_pieces correctly maps the SentencePiece word-boundary
        # marker (U+2581) back to a real space. sp.decode(pieces) leaves
        # stray ▁ characters in some Argos models — that's why earlier
        # output had "1000▁Ciclos" instead of "1000 Ciclos".
        text = sp.decode_pieces(pieces) if pieces else ""
        # Belt-and-braces: scrub any ▁ that survived (older sp versions).
        if "▁" in text:
            text = text.replace("▁", " ").strip()
        # Post-process: fix known per-language mistranslations.
        text = _apply_post_fix(text, from_code, to_code)
        # CIKTI TARAFI DONGU KORUMASI (2026-08-19). no_repeat_ngram_size /
        # repetition_penalty olasiligi dusuruyor ama GARANTI vermiyor: canli
        # sozlukte (90.310 terim) 11 dongulu kayit bulundu ve katalogdaki
        # 1.354 urun onlari okuyordu. Dongulu bir ceviri sozluge girdiginde
        # yeniden calistirmak DUZELTMEZ — onbellek isabet eder. Bu yuzden
        # dongulu cikti KAYNAK METINLE degistirilir: ceviri eksik kalir ama
        # asla bozuk metin yayilmaz.
        if _is_degenerate(text):
            print(f"[translate] DONGU reddedildi ({from_code}->{to_code}): {text[:60]!r}", flush=True)
            text = ""
        out.append(text)
    return out


def translate_many(texts: List[str], from_code: str, target_langs: List[str]) -> Dict[str, Dict[str, str]]:
    """
    Translate `texts` from `from_code` into every target language. The
    response shape matches the legacy NLLB worker so the admin pipeline
    keeps working with no JS changes.
    """
    out: Dict[str, Dict[str, str]] = {t: {} for t in texts}
    if not texts or not target_langs:
        return out

    STATE["busy"] = True
    STATE["startedAt"] = _now()
    STATE["jobId"] += 1
    STATE["totalTexts"] = len(texts)
    STATE["totalTargets"] = len(target_langs)
    STATE["langTotal"] = len(target_langs)
    STATE["itemsTotal"] = len(texts) * len(target_langs)
    STATE["itemsDone"] = 0
    STATE["batchDone"] = 0
    STATE["batchTotal"] = 0
    STATE["lastUpdate"] = _now()

    # Step 1: Pivot through EN once if the source isn't English. This avoids
    # re-doing the source->EN hop for every target language.
    en_texts: Optional[List[str]] = None
    needs_pivot = any(lang != from_code and lang != "en" for lang in target_langs)
    if needs_pivot and from_code != "en":
        # Only translate atoms not already cached for EN.
        missing_idx = [i for i, t in enumerate(texts) if not _cache_lookup(from_code, t, "en")]
        if missing_idx:
            missing_texts = [texts[i] for i in missing_idx]
            t0 = _now()
            translated = _translate_one_hop(missing_texts, from_code, "en")
            for i, tr in zip(missing_idx, translated):
                if tr:
                    _cache_store(from_code, texts[i], "en", tr)
            STATE["lastBatchMs"] = _ms(_now() - t0)
            print(f"[worker] pivot {from_code}->en · {len(missing_texts)} atoms · {STATE['lastBatchMs']}ms", flush=True)
        # Cached EN values may be stale from older POST_FIX rules — re-apply
        # the current rule set so downstream EN->X hops pivot from a clean
        # source. New rules added today fix prior cache entries automatically.
        en_texts = []
        for t in texts:
            cached_en = _cache_lookup(from_code, t, "en") or t
            fixed_en = _apply_post_fix(cached_en, from_code, "en")
            if fixed_en != cached_en:
                _cache_store(from_code, t, "en", fixed_en)
            en_texts.append(fixed_en)

    # Step 2: Translate into every target language IN PARALLEL. CTranslate2
    # releases the GIL during translate_batch, so multiple Python threads
    # actually overlap on the GPU. A small worker pool gives ~2-4x speedup
    # vs the old sequential loop and avoids OOM on a 4 GB card.
    def _translate_lang(lang: str) -> Tuple[str, int, int]:
        """Returns (lang, missing_count, elapsed_ms). Mutates _cache."""
        if lang == from_code:
            for t in texts:
                _cache_store(from_code, t, lang, t)
            return (lang, 0, 0)

        missing_idx = [i for i, t in enumerate(texts) if not _cache_lookup(from_code, t, lang)]
        if not missing_idx:
            return (lang, 0, 0)

        missing_texts = [texts[i] for i in missing_idx]
        t0 = _now()
        if lang == "en" and from_code != "en":
            # Re-read EN already produced during the pivot step.
            translated = [_cache_lookup(from_code, texts[i], "en") or texts[i] for i in missing_idx]
        elif from_code == "en":
            translated = _translate_one_hop(missing_texts, "en", lang)
        else:
            pivot_texts = [en_texts[i] if en_texts else missing_texts[idx] for idx, i in enumerate(missing_idx)]
            translated = _translate_one_hop(pivot_texts, "en", lang)

        for i, tr in zip(missing_idx, translated):
            if tr:
                _cache_store(from_code, texts[i], lang, tr)
        return (lang, len(missing_texts), _ms(_now() - t0))

    STATE["batchTotal"] = len(target_langs)
    # GTX 1650 (4 GB VRAM) handles 8 Argos models co-resident. Bumped from 6
    # to push more concurrent GPU streams (CTranslate2 releases the GIL
    # during translate_batch). If you OOM, set QORAI_TRANSLATE_THREADS=4.
    with ThreadPoolExecutor(max_workers=min(TRANSLATE_THREADS, len(target_langs))) as pool:
        for lang, n_missing, dt in pool.map(_translate_lang, target_langs):
            STATE["batchDone"] += 1
            STATE["lastBatchMs"] = dt
            STATE["itemsDone"] += len(texts)
            STATE["lastUpdate"] = _now()
            if n_missing:
                print(f"[worker] {from_code}->{lang} · {n_missing} atoms · {dt}ms", flush=True)

    # Build the response from the cache + collect residue atoms (those the
    # caller should send to DeepSeek as fallback). Belt-and-braces post-fix.
    residue: List[str] = []
    for t in texts:
        atom_has_residue = False
        for lang in target_langs:
            v = _cache_lookup(from_code, t, lang)
            if not v:
                continue
            v = _apply_post_fix(v, from_code, lang)
            if from_code != "en" and lang != "en":
                v = _apply_post_fix(v, "en", lang)
            out[t][lang] = v
            _cache_store(from_code, t, lang, v)
            if _has_residue(v, from_code, lang):
                atom_has_residue = True
        if atom_has_residue:
            residue.append(t)

    _save_cache(force=False)
    STATE["busy"] = False
    STATE["lastUpdate"] = _now()
    # Stash residue on the function so the HTTP handler can pick it up.
    translate_many.last_residue = residue
    return out


# ─── HTTP layer ──────────────────────────────────────────────────────────
class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silence default access log
        pass

    def _json(self, status: int, body: dict) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self._json(204, {})

    def do_GET(self):
        if self.path == "/health":
            with _cache_lock:
                size = len(_cache)
            self._json(200, {
                "ok": True,
                "model": MODEL_LABEL,
                "device": DEVICE,
                "computeType": COMPUTE_TYPE,
                "cache": size,
                "modelReady": STATE["modelReady"],
                "warming": STATE["warming"],
                "batch": BATCH_SIZE,
            })
            return
        if self.path == "/status":
            now = _now()
            elapsed = (now - STATE["startedAt"]) if STATE["busy"] else 0
            done = STATE["itemsDone"]
            total = STATE["itemsTotal"] or 1
            ratio = done / total if total else 0
            eta = int(elapsed / ratio - elapsed) * 1000 if STATE["busy"] and ratio > 0 else 0
            with _cache_lock:
                size = len(_cache)
            payload = dict(STATE)
            payload.update({
                "elapsedMs": _ms(elapsed),
                "progress": ratio,
                "etaMs": eta,
                "cacheSize": size,
                "ts": _ms(now),
            })
            self._json(200, payload)
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path == "/clear-cache":
            global _cache, _cache_dirty
            with _cache_lock:
                count = len(_cache)
                _cache = {}
                _cache_dirty = True
            _save_cache(force=True)
            print(f"[worker] cache cleared via /clear-cache · {count} keys removed", flush=True)
            self._json(200, {"ok": True, "cleared": count})
            return
        if self.path != "/translate":
            self._json(404, {"error": "not_found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            raw = self.rfile.read(length) if length else b""
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception as e:
            self._json(400, {"error": "invalid_json", "detail": str(e)})
            return

        from_code = str(body.get("from") or body.get("source") or body.get("src") or "tr").lower().strip()
        if from_code not in LANGS:
            self._json(400, {"error": "invalid_source_lang", "detail": from_code})
            return

        raw_texts = body.get("texts") or []
        if not isinstance(raw_texts, list):
            self._json(400, {"error": "texts_required"})
            return
        seen = set()
        texts = []
        for raw in raw_texts:
            t = _clean(raw)
            if t and t not in seen:
                seen.add(t)
                texts.append(t)
        if not texts:
            self._json(400, {"error": "texts_required"})
            return
        # Cap to keep memory predictable.
        texts = texts[:500]

        target_langs = [str(x or "").lower() for x in (body.get("to") or [])]
        target_langs = [l for l in target_langs if l in LANGS]
        if not target_langs:
            self._json(400, {"error": "targets_required"})
            return

        started = _now()
        try:
            translations = translate_many(texts, from_code, target_langs)
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": "local_translate_failed", "detail": str(e)})
            return

        self._json(200, {
            "provider": "argos-ct2",
            "model": MODEL_LABEL,
            "device": DEVICE,
            "from": from_code,
            "count": len(texts),
            "to": target_langs,
            "elapsedMs": _ms(_now() - started),
            "translations": translations,
            # Atoms where Argos+post-fix still left source-language residue.
            # The admin pipeline sends ONLY these atoms to DeepSeek as fallback,
            # so 95%+ of products skip the slow API hop entirely.
            "residueAtoms": getattr(translate_many, "last_residue", []),
        })


class _ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    _load_cache()
    warm_thread = threading.Thread(target=warm_up, daemon=True)
    warm_thread.start()
    server = _ThreadedHTTPServer((HOST, PORT), _Handler)
    print(f"[worker] listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _save_cache(force=True)
        print("[worker] shutdown", flush=True)


if __name__ == "__main__":
    sys.exit(main() or 0)
