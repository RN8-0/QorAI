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
DEVICE = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
# int8_float16 gives ~2x speed vs float16 on consumer GPUs (Turing+) at
# negligible quality cost; fall back to int8 on CPU.
COMPUTE_TYPE = "int8_float16" if DEVICE == "cuda" else "int8"
# CTranslate2 will internally split into sub-batches of this size. 64 fits
# comfortably on a 4 GB GPU (GTX 1650) for the small Argos models.
BATCH_SIZE = int(os.environ.get("QORAI_TRANSLATE_BATCH", "48"))
BEAM_SIZE = int(os.environ.get("QORAI_TRANSLATE_BEAM", "1"))
MODEL_LABEL = f"argos-translate/{DEVICE}/{COMPUTE_TYPE}"

# Supported language codes (must match the admin pipeline). All TR/DE
# sources pivot through EN at runtime.
LANGS = {"tr", "en", "de", "es", "fr", "pt", "ru"}

# Tiny deterministic glossary for short technical atoms where MT models are
# weakest. This stays in-process and costs ~0 ms; it prevents broken outputs
# like "5088 mAh (?? eSIM)" or "C02-carbone" from entering the shared dict.
_EXACT_GLOSSARY: Dict[Tuple[str, str], Dict[str, str]] = {
    ("tr", "yalnızca esim"): {
        "en": "Only eSIM", "de": "Nur eSIM", "es": "Solo eSIM",
        "fr": "eSIM uniquement", "pt": "Apenas eSIM", "ru": "Только eSIM",
    },
    ("tr", "silikon-karbon"): {
        "en": "Silicon-carbon", "de": "Silizium-Kohlenstoff",
        "es": "Silicio-carbono", "fr": "Silicium-carbone",
        "pt": "Silício-carbono", "ru": "Кремний-углерод",
    },
    ("de", "akkukapazität"): {
        "tr": "Pil kapasitesi", "en": "Battery capacity",
        "es": "Capacidad de la batería", "fr": "Capacité de la batterie",
        "pt": "Capacidade da bateria", "ru": "Емкость аккумулятора",
    },
    ("de", "betriebssystem"): {
        "tr": "İşletim sistemi", "en": "Operating system",
        "es": "Sistema operativo", "fr": "Système d'exploitation",
        "pt": "Sistema operacional", "ru": "Операционная система",
    },
    ("de", "kamera vorne"): {
        "tr": "Ön kamera", "en": "Front camera",
        "es": "Cámara frontal", "fr": "Caméra avant",
        "pt": "Câmera frontal", "ru": "Фронтальная камера",
    },
    ("de", "sensoren"): {
        "tr": "Sensörler", "en": "Sensors", "es": "Sensores",
        "fr": "Capteurs", "pt": "Sensores", "ru": "Датчики",
    },
    ("de", "sim-karte"): {
        "tr": "SIM kartı", "en": "SIM card", "es": "Tarjeta SIM",
        "fr": "Carte SIM", "pt": "Cartão SIM", "ru": "SIM-карта",
    },
    ("de", "abmessungen"): {
        "tr": "Boyutlar", "en": "Dimensions", "es": "Dimensiones",
        "fr": "Dimensions", "pt": "Dimensões", "ru": "Размеры",
    },
    ("de", "farbe"): {
        "tr": "Renk", "en": "Color", "es": "Color",
        "fr": "Couleur", "pt": "Cor", "ru": "Цвет",
    },
    ("de", "gewicht"): {
        "tr": "Ağırlık", "en": "Weight", "es": "Peso",
        "fr": "Poids", "pt": "Peso", "ru": "Вес",
    },
    ("de", "batterielaufzeit"): {
        "tr": "Pil ömrü", "en": "Battery life",
        "es": "Duración de la batería", "fr": "Autonomie de la batterie",
        "pt": "Duração da bateria", "ru": "Время работы батареи",
    },
    ("de", "energieeffizienzklasse"): {
        "tr": "Enerji verimliliği sınıfı", "en": "Energy efficiency class",
        "es": "Clase de eficiencia energética",
        "fr": "Classe d'efficacité énergétique",
        "pt": "Classe de eficiência energética",
        "ru": "Класс энергоэффективности",
    },
    ("de", "speicher"): {
        "tr": "Depolama", "en": "Storage", "es": "Almacenamiento",
        "fr": "Stockage", "pt": "Armazenamento", "ru": "Хранилище",
    },
    ("de", "gehäusematerial"): {
        "tr": "Gövde malzemesi", "en": "Body material",
        "es": "Material del cuerpo", "fr": "Matériau du boîtier",
        "pt": "Material do corpo", "ru": "Материал корпуса",
    },
    ("de", "gehäuseform"): {
        "tr": "Gövde formu", "en": "Body shape", "es": "Forma del cuerpo",
        "fr": "Forme du boîtier", "pt": "Formato do corpo",
        "ru": "Форма корпуса",
    },
    ("de", "frequenzbänder"): {
        "tr": "Frekans bantları", "en": "Frequency bands",
        "es": "Bandas de frecuencia", "fr": "Bandes de fréquence",
        "pt": "Bandas de frequência", "ru": "Диапазоны частот",
    },
    ("de", "besonderheiten"): {
        "tr": "Özellikler", "en": "Features", "es": "Características",
        "fr": "Fonctionnalités", "pt": "Recursos", "ru": "Особенности",
    },
    ("de", "zuverlässigkeitsklasse"): {
        "tr": "Güvenilirlik sınıfı", "en": "Reliability class",
        "es": "Clase de fiabilidad", "fr": "Classe de fiabilité",
        "pt": "Classe de confiabilidade", "ru": "Класс надежности",
    },
    ("de", "stereo-lautsprecher (hybrid)"): {
        "tr": "Stereo hoparlörler (hibrit)", "en": "Stereo speakers (hybrid)",
        "es": "Altavoces estéreo (híbridos)",
        "fr": "Haut-parleurs stéréo (hybrides)",
        "pt": "Alto-falantes estéreo (híbridos)",
        "ru": "Стереодинамики (гибридные)",
    },
    ("de", "beschleunigungssensor"): {
        "tr": "İvmeölçer", "en": "Accelerometer", "es": "Acelerómetro",
        "fr": "Accéléromètre", "pt": "Acelerômetro", "ru": "Акселерометр",
    },
    ("de", "gyroskop"): {
        "tr": "Jiroskop", "en": "Gyroscope", "es": "Giroscopio",
        "fr": "Gyroscope", "pt": "Giroscópio", "ru": "Гироскоп",
    },
    ("de", "annäherungssensor"): {
        "tr": "Yakınlık sensörü", "en": "Proximity sensor",
        "es": "Sensor de proximidad", "fr": "Capteur de proximité",
        "pt": "Sensor de proximidade", "ru": "Датчик приближения",
    },
    ("de", "lichtsensor"): {
        "tr": "Işık sensörü", "en": "Light sensor", "es": "Sensor de luz",
        "fr": "Capteur de lumière", "pt": "Sensor de luz",
        "ru": "Датчик освещенности",
    },
    ("de", "kompass"): {
        "tr": "Pusula", "en": "Compass", "es": "Brújula",
        "fr": "Boussole", "pt": "Bússola", "ru": "Компас",
    },
    ("de", "gesichtsscanner (3d, infrarot)"): {
        "tr": "Yüz tarayıcı (3D, kızılötesi)",
        "en": "Face scanner (3D, infrared)",
        "es": "Escáner facial (3D, infrarrojo)",
        "fr": "Scanner facial (3D, infrarouge)",
        "pt": "Scanner facial (3D, infravermelho)",
        "ru": "Сканер лица (3D, инфракрасный)",
    },
    ("de", "schwarz"): {
        "tr": "Siyah", "en": "Black", "es": "Negro",
        "fr": "Noir", "pt": "Preto", "ru": "Черный",
    },
    ("de", "aussparung"): {
        "tr": "Ekran kesiti", "en": "Display cutout",
        "es": "Recorte de pantalla", "fr": "Découpe d'écran",
        "pt": "Recorte da tela", "ru": "Вырез экрана",
    },
    ("de", "flach"): {
        "tr": "Düz", "en": "Flat", "es": "Plano",
        "fr": "Plat", "pt": "Plano", "ru": "Плоский",
    },
    ("de", "kapazitiver touchscreen"): {
        "tr": "Kapasitif dokunmatik ekran", "en": "Capacitive touchscreen",
        "es": "Pantalla táctil capacitiva", "fr": "Écran tactile capacitif",
        "pt": "Tela sensível ao toque capacitiva",
        "ru": "Емкостный сенсорный экран",
    },
    ("de", "phasenvergleich-af"): {
        "tr": "Faz algılamalı otomatik odaklama",
        "en": "Phase detection autofocus",
        "es": "Autoenfoque por detección de fase",
        "fr": "Autofocus à détection de phase",
        "pt": "Foco automático por detecção de fase",
        "ru": "Фазовый автофокус",
    },
    ("de", "ip68-zertifiziert"): {
        "tr": "IP68 sertifikalı", "en": "IP68 certified",
        "es": "Certificación IP68", "fr": "Certifié IP68",
        "pt": "Certificado IP68", "ru": "Сертификация IP68",
    },
    ("de", "fest verbaut"): {
        "tr": "Sabit takılı", "en": "Built-in", "es": "Integrado",
        "fr": "Intégré", "pt": "Integrado", "ru": "Встроенный",
    },
    ("de", "kabelloses laden"): {
        "tr": "Kablosuz şarj", "en": "Wireless charging",
        "es": "Carga inalámbrica", "fr": "Charge sans fil",
        "pt": "Carregamento sem fio", "ru": "Беспроводная зарядка",
    },
    ("de", "barometer"): {
        "tr": "Barometre", "en": "Barometer", "es": "Barómetro",
        "fr": "Baromètre", "pt": "Barômetro", "ru": "Барометр",
    },
    ("de", "glas (rückseite)"): {
        "tr": "Cam (arka yüzey)", "en": "Glass (back)",
        "es": "Vidrio (parte trasera)", "fr": "Verre (dos)",
        "pt": "Vidro (traseira)", "ru": "Стекло (задняя панель)",
    },
    ("de", "metall (rahmen)"): {
        "tr": "Metal (çerçeve)", "en": "Metal (frame)",
        "es": "Metal (marco)", "fr": "Métal (cadre)",
        "pt": "Metal (estrutura)", "ru": "Металл (рамка)",
    },
    ("de", "barren"): {
        "tr": "Bar formu", "en": "Bar form factor",
        "es": "Formato barra", "fr": "Format barre",
        "pt": "Formato barra", "ru": "Моноблок",
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

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(dakika|dk)", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} minutes", "de": f"{n} Minuten",
                "es": f"{n} minutos", "fr": f"{n} minutes",
                "pt": f"{n} minutos", "ru": f"{n} минут",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*saat", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} hours", "de": f"{n} Stunden",
                "es": f"{n} horas", "fr": f"{n} heures",
                "pt": f"{n} horas", "ru": f"{n} часов",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*döngü", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} cycles", "de": f"{n} Zyklen",
                "es": f"{n} ciclos", "fr": f"{n} cycles",
                "pt": f"{n} ciclos", "ru": f"{n} циклов",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+)\s*elementli\s+lens", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n}-element lens",
                "de": f"{n}-Element-Objektiv",
                "es": f"Lente de {n} elementos",
                "fr": f"Objectif à {n} éléments",
                "pt": f"Lente de {n} elementos",
                "ru": f"{n}-элементный объектив",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*milyar", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "en": f"{n} billion", "de": f"{n} Milliarden",
                "es": f"{n} mil millones", "fr": f"{n} milliard",
                "pt": f"{n} bilhão", "ru": f"{n} млрд",
            }.get(tgt_lang)

        m = re.fullmatch(r"(.+?)\s*\(\s*yalnızca\s+esim\s*\)", s, flags=re.I)
        if m:
            prefix = m.group(1).strip()
            suffix = {
                "en": "Only eSIM", "de": "Nur eSIM", "es": "Solo eSIM",
                "fr": "eSIM uniquement", "pt": "Apenas eSIM",
                "ru": "Только eSIM",
            }.get(tgt_lang)
            return f"{prefix} ({suffix})" if suffix else None

        m = re.fullmatch(r"(.+?)\s+teknolojisi", s, flags=re.I)
        if m:
            prefix = m.group(1)
            return {
                "en": f"{prefix} technology", "de": f"{prefix} Technologie",
                "es": f"Tecnología {prefix}", "fr": f"Technologie {prefix}",
                "pt": f"Tecnologia {prefix}", "ru": f"Технология {prefix}",
            }.get(tgt_lang)

        m = re.fullmatch(r"(.+?)\s+dijital\s+zoom", s, flags=re.I)
        if m:
            prefix = m.group(1)
            return {
                "en": f"{prefix} digital zoom", "de": f"{prefix} Digitalzoom",
                "es": f"Zoom digital {prefix}", "fr": f"Zoom numérique {prefix}",
                "pt": f"Zoom digital {prefix}", "ru": f"{prefix} цифровой зум",
            }.get(tgt_lang)

    if src_lang == "de":
        import re

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)x\s+laden", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "tr": f"{n} şarj döngüsü", "en": f"{n} charging cycles",
                "es": f"{n} ciclos de carga", "fr": f"{n} cycles de charge",
                "pt": f"{n} ciclos de carga", "ru": f"{n} циклов зарядки",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)hz\s+aktualisierungsrate", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "tr": f"{n}Hz yenileme hızı", "en": f"{n}Hz refresh rate",
                "es": f"Frecuencia de actualización de {n}Hz",
                "fr": f"Taux de rafraîchissement {n}Hz",
                "pt": f"Taxa de atualização de {n}Hz",
                "ru": f"Частота обновления {n} Гц",
            }.get(tgt_lang)

        m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s+nits\s+\(maximal\)", s, flags=re.I)
        if m:
            n = m.group(1)
            return {
                "tr": f"{n} nit (maksimum)", "en": f"{n} nits (maximum)",
                "es": f"{n} nits (máximo)", "fr": f"{n} nits (maximum)",
                "pt": f"{n} nits (máximo)", "ru": f"{n} нит (максимум)",
            }.get(tgt_lang)

        if re.match(r"^satellitenkommunikation", s, flags=re.I):
            return {
                "tr": "Uydu iletişimi (mesajlar, sadece acil arama)",
                "en": "Satellite communication (text messages, emergency only)",
                "es": "Comunicación satelital (mensajes de texto, solo emergencia)",
                "fr": "Communication satellite (messages texte, urgence uniquement)",
                "pt": "Comunicação por satélite (mensagens de texto, apenas emergência)",
                "ru": "Спутниковая связь (текстовые сообщения, только экстренные вызовы)",
            }.get(tgt_lang)

    return None


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
            translator = ctranslate2.Translator(
                str(model_dir),
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                inter_threads=1,
                intra_threads=4,
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
def _translate_one_hop(texts: List[str], from_code: str, to_code: str) -> List[str]:
    pkg = _get_pkg(from_code, to_code)
    if pkg is None:
        return texts  # No model installed — return verbatim
    translator, sp = pkg
    encoded = [sp.encode(t, out_type=str) for t in texts]
    results = translator.translate_batch(
        encoded,
        max_batch_size=BATCH_SIZE,
        beam_size=BEAM_SIZE,
        return_scores=False,
        # Keep the search shallow but accurate enough for short spec atoms.
        max_decoding_length=192,
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
        en_texts = [_cache_lookup(from_code, t, "en") or t for t in texts]

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
    # GTX 1650 has 4 GB of VRAM. Six small Argos models comfortably co-resident
    # with a 4-thread pool; the GPU scheduler interleaves the batches.
    with ThreadPoolExecutor(max_workers=min(4, len(target_langs))) as pool:
        for lang, n_missing, dt in pool.map(_translate_lang, target_langs):
            STATE["batchDone"] += 1
            STATE["lastBatchMs"] = dt
            STATE["itemsDone"] += len(texts)
            STATE["lastUpdate"] = _now()
            if n_missing:
                print(f"[worker] {from_code}->{lang} · {n_missing} atoms · {dt}ms", flush=True)

    # Build the response from the cache so cached atoms also flow back.
    for t in texts:
        for lang in target_langs:
            v = _cache_lookup(from_code, t, lang)
            if v:
                out[t][lang] = v

    _save_cache(force=False)
    STATE["busy"] = False
    STATE["lastUpdate"] = _now()
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
