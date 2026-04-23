#!/usr/bin/env python3
"""
remove-bg.py — Product image white background removal
=====================================================
Downloads product images, removes white background via Pillow flood-fill,
auto-crops to product bounding box, centers on 600×600 transparent canvas,
uploads to Firebase Storage and updates Firestore URLs.

Usage:
    python3 scripts/remove-bg.py                  # process unprocessed products
    python3 scripts/remove-bg.py --force          # reprocess ALL (including Storage)
    python3 scripts/remove-bg.py --limit 10       # test with 10 products
    python3 scripts/remove-bg.py --dry-run        # save to /tmp, no upload
    python3 scripts/remove-bg.py --workers 5      # parallel workers (default: 4)
"""

import sys
import os
import argparse
import io
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import cloudscraper
from PIL import Image, ImageDraw
import numpy as np
import firebase_admin
from firebase_admin import credentials, firestore, storage

SCRIPT_DIR = Path(__file__).parent
SERVICE_ACCOUNT = Path(os.environ.get('SA_PATH', str(SCRIPT_DIR / 'service-account.json')))
STORAGE_BUCKET = 'qorai_images_99b6e'
STORAGE_PREFIX = 'product_images'
OUTPUT_SIZE = 600   # final canvas size in pixels
PADDING = 50        # padding around product in pixels
BG_THRESH = 30      # flood-fill white detection threshold (0-255)

_print_lock = Lock()

def log(*args):
    with _print_lock:
        print(*args, flush=True)


# ─── Background removal ───────────────────────────────────────────────────────

def remove_white_background(img: Image.Image) -> Image.Image:
    """
    Flood-fill from all border points to detect connected white background.
    Only pixels CONNECTED to the border are made transparent —
    white product pixels (not touching border) remain fully opaque.
    """
    img = img.convert('RGBA')
    w, h = img.size

    # Add 1px white border so even edge-touching products work correctly
    expanded = Image.new('RGBA', (w + 2, h + 2), (255, 255, 255, 255))
    expanded.paste(img, (1, 1))

    # Seed from all 4 corners + center of all 4 edges
    seeds = [
        (0, 0), (w + 1, 0), (0, h + 1), (w + 1, h + 1),
        (w // 2, 0), (w // 2, h + 1),
        (0, h // 2), (w + 1, h // 2),
        # Also seed quarter points along edges for complex backgrounds
        (w // 4, 0), (3 * w // 4, 0),
        (w // 4, h + 1), (3 * w // 4, h + 1),
    ]
    fill = (0, 0, 0, 0)
    for seed in seeds:
        try:
            ImageDraw.floodfill(expanded, seed, fill, thresh=BG_THRESH)
        except Exception:
            pass

    return expanded.crop((1, 1, w + 1, h + 1))


def autocrop_and_center(img: Image.Image) -> Image.Image:
    """
    Crop to the product bounding box, then center on a square transparent canvas.
    Result is always OUTPUT_SIZE × OUTPUT_SIZE.
    """
    arr = np.array(img)
    alpha = arr[:, :, 3]

    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)

    if not rows.any() or not cols.any():
        return Image.new('RGBA', (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))

    rmin, rmax = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
    cmin, cmax = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])

    cropped = img.crop((cmin, rmin, cmax + 1, rmax + 1))

    # Scale to fit within the padded area, preserving aspect ratio
    max_dim = OUTPUT_SIZE - 2 * PADDING
    ratio = min(max_dim / max(cropped.width, 1), max_dim / max(cropped.height, 1))
    nw = max(int(cropped.width * ratio), 1)
    nh = max(int(cropped.height * ratio), 1)
    scaled = cropped.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new('RGBA', (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    canvas.paste(scaled, ((OUTPUT_SIZE - nw) // 2, (OUTPUT_SIZE - nh) // 2), scaled)
    return canvas


def process_image(url: str) -> bytes | None:
    """Download, remove background, autocrop+center. Returns PNG bytes or None."""
    scraper = cloudscraper.create_scraper()
    try:
        resp = scraper.get(url, timeout=20)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content))
        result = remove_white_background(img)
        result = autocrop_and_center(result)
        buf = io.BytesIO()
        result.save(buf, format='PNG', optimize=True)
        return buf.getvalue()
    except Exception as e:
        return None, str(e)


# ─── Firebase ─────────────────────────────────────────────────────────────────

def init_firebase():
    cred = credentials.Certificate(str(SERVICE_ACCOUNT))
    firebase_admin.initialize_app(cred, {'storageBucket': STORAGE_BUCKET})
    return firestore.client(), storage.bucket()


def upload_image(bucket, product_id: str, png_bytes: bytes) -> str:
    path = f'{STORAGE_PREFIX}/{product_id}.png'
    blob = bucket.blob(path)
    blob.upload_from_string(png_bytes, content_type='image/png')
    blob.make_public()
    return blob.public_url


# ─── Worker ──────────────────────────────────────────────────────────────────

def process_product(task):
    i, total, doc, bucket, args = task
    data = doc.to_dict()
    product_id = doc.id
    name = data.get('name', product_id)[:45]
    url = data.get('imageURL') or data.get('imageUrl') or ''

    if not url:
        log(f'[{i}/{total}] {name}\n    → No URL, skip')
        return 'skip'

    if not args.force and 'storage.googleapis.com' in url and STORAGE_BUCKET in url:
        log(f'[{i}/{total}] {name}\n    → Already in Storage, skip (--force to redo)')
        return 'skip'

    log(f'[{i}/{total}] {name}')

    result = process_image(url)
    if isinstance(result, tuple):  # (None, error_msg)
        log(f'    ✗ {result[1]}')
        return 'fail'

    png_bytes = result
    log(f'    → PNG: {len(png_bytes) // 1024} KB')

    if args.dry_run:
        out = Path('/tmp') / f'qorai_{product_id}.png'
        out.write_bytes(png_bytes)
        log(f'    → Dry run saved: {out}')
        return 'ok'

    try:
        new_url = upload_image(bucket, product_id, png_bytes)
        field = 'imageURL' if 'imageURL' in data else 'imageUrl'
        doc.reference.update({field: new_url})
        log(f'    ✓ Done')
        return 'ok'
    except Exception as e:
        log(f'    ✗ Upload error: {e}')
        return 'fail'


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit',   type=int, default=0)
    parser.add_argument('--force',   action='store_true', help='Reprocess even Storage images')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--workers', type=int, default=4, help='Parallel workers')
    parser.add_argument('--collection', default='products')
    args = parser.parse_args()

    log('Initializing Firebase...')
    db, bucket = init_firebase()

    log(f'Fetching products...')
    docs = list(db.collection(args.collection).stream())
    total = len(docs)
    log(f'Found {total} products')

    if args.limit:
        docs = docs[:args.limit]
        log(f'Limited to {args.limit}')

    tasks = [(i + 1, total, doc, bucket, args) for i, doc in enumerate(docs)]

    ok = skip = fail = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(process_product, t): t for t in tasks}
        for f in as_completed(futures):
            r = f.result()
            if r == 'ok':   ok += 1
            elif r == 'skip': skip += 1
            else:            fail += 1

    log(f'\n{"=" * 50}')
    log(f'Done: {ok} updated, {skip} skipped, {fail} failed')
    if args.dry_run:
        log('DRY RUN — previews in /tmp/qorai_*.png')


if __name__ == '__main__':
    main()

