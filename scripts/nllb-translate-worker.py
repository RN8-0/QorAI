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
LANG_CODE = {
    "tr": "tur_Latn",
    "en": "eng_Latn",
    "de": "deu_Latn",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "pt": "por_Latn",
    "ru": "rus_Cyrl",
}
LANGS = set(LANG_CODE)

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

        # Cache lookup pass — only translate atoms that aren't cached for
        # every requested target.
        missing_texts: List[str] = []
        result: Dict[str, Dict[str, str]] = {t: {} for t in texts}
        for t in texts:
            for short in tgt_shorts:
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
            for t, langs in fresh.items():
                for short, val in langs.items():
                    _cache_store(src_short, t, short, val)
                    result[t][short] = val
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
