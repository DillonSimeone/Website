#!/usr/bin/env python3
"""
AliExpress Search & Relevance Ranker CLI (`ali_search.py`).

Fetches AliExpress search results via curl, extracts embedded JSON payloads
(with a BeautifulSoup DOM fallback), scores and ranks listings by relevance,
and generates a self-contained, dark-mode interactive HTML dashboard.
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import math
import re
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

CACHE_DIR = Path(".cache")


def slugify_query(query: str) -> str:
    """Convert a search query into an AliExpress wholesale URL slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")
    return slug or "electronics"


def find_curl_binary() -> str:
    """Locate the native curl executable (preferring curl.exe on Windows)."""
    return shutil.which("curl.exe") or shutil.which("curl") or "curl"


def fetch_page(
    slug: str,
    page: int,
    cache_dir: Path,
    use_cache: bool = True,
    cookie: str | None = None,
) -> str:
    """Fetch a single AliExpress search page via curl, using local cache when available."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{slug}_page_{page}.html"
    cookie_jar = cache_dir / "cookies.txt"

    if use_cache and cache_file.exists() and cache_file.stat().st_size > 10_000:
        print(f"[cache] Using cached page {page}: {cache_file}")
        return cache_file.read_text(encoding="utf-8", errors="replace")

    url = f"https://www.aliexpress.com/w/wholesale-{slug}.html?page={page}"
    curl_bin = find_curl_binary()

    cmd = [
        curl_bin,
        "-sSL",
        "--compressed",
        "--max-time",
        "15",
        "-c",
        str(cookie_jar),
        "-b",
        str(cookie_jar),
        "-H",
        f"User-Agent: {USER_AGENT}",
        "-H",
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "-H",
        "Accept-Language: en-US,en;q=0.9",
        "-H",
        "Referer: https://www.aliexpress.com/",
    ]

    if cookie:
        cookie_path = Path(cookie)
        if cookie_path.is_file():
            cmd.extend(["-b", str(cookie_path)])
        else:
            cmd.extend(["-H", f"Cookie: {cookie}"])

    cmd.append(url)

    print(f"[fetch] Fetching page {page}: {url}")
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=20,
    )

    if proc.returncode != 0:
        raise RuntimeError(f"curl failed (exit {proc.returncode}): {proc.stderr.strip()}")

    raw_html = proc.stdout
    if "_____tmd_____/punish" in raw_html or len(raw_html) < 5_000:
        print(
            f"[warn] Page {page} returned challenge/small response ({len(raw_html)} bytes); not caching.",
            file=sys.stderr,
        )
        return raw_html

    cache_file.write_text(raw_html, encoding="utf-8")
    return raw_html


def _extract_balanced_json(text: str, start_idx: int) -> dict[str, Any] | None:
    """Extract and parse a balanced JSON object starting at the first '{' from start_idx."""
    brace_start = text.find("{", start_idx)
    if brace_start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for idx in range(brace_start, len(text)):
        ch = text[idx]
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = text[brace_start : idx + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    return None
    return None


def _find_item_lists(obj: Any) -> list[list[dict[str, Any]]]:
    """Recursively locate candidate product lists inside an AliExpress state payload."""
    found: list[list[dict[str, Any]]] = []
    if isinstance(obj, dict):
        for key in ("itemList", "resultList", "items"):
            val = obj.get(key)
            if isinstance(val, dict) and isinstance(val.get("content"), list):
                found.append(val["content"])
            elif isinstance(val, list) and val and isinstance(val[0], dict):
                found.append(val)
        for v in obj.values():
            if isinstance(v, (dict, list)):
                found.extend(_find_item_lists(v))
    elif isinstance(obj, list):
        for v in obj:
            if isinstance(v, (dict, list)):
                found.extend(_find_item_lists(v))
    return found


def _clean_html_text(raw: str) -> str:
    """Strip HTML tags and normalize whitespace."""
    if not raw:
        return ""
    text = BeautifulSoup(raw, "lxml").get_text(" ", strip=True)
    return re.sub(r"\s+", " ", text).strip()


def _parse_float(value: Any) -> float:
    """Parse a numeric float from a number or formatted price string."""
    if isinstance(value, (int, float)):
        return float(value)
    if not value:
        return 0.0
    m = re.search(r"(\d[\d,]*\.?\d*)", str(value))
    if not m:
        return 0.0
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return 0.0


def _parse_orders_count(trade_desc: str) -> int:
    """Convert AliExpress sold strings like '1,200+ sold' or '500 sold' into integers."""
    if not trade_desc:
        return 0
    m = re.search(r"([\d,]+)\s*(\+?)\s*sold", trade_desc, re.I)
    if m:
        return int(m.group(1).replace(",", ""))
    m_num = re.search(r"([\d,]+)", trade_desc)
    return int(m_num.group(1).replace(",", "")) if m_num else 0


def _normalize_image_url(url: str) -> str:
    """Ensure image URLs have an explicit https: scheme."""
    if not url:
        return ""
    url = url.strip()
    if url.startswith("//"):
        return f"https:{url}"
    if url.startswith("http://"):
        return "https://" + url[len("http://") :]
    return url


def _normalize_json_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize a raw AliExpress JSON item object into our standard product schema."""
    product_id = str(raw.get("productId") or raw.get("redirectedId") or "").strip()
    if not product_id or not product_id.isdigit():
        return None

    title_obj = raw.get("title")
    if isinstance(title_obj, dict):
        title = str(title_obj.get("displayTitle") or title_obj.get("seoTitle") or "").strip()
    else:
        title = str(title_obj or "").strip()
    if not title:
        return None

    prices = raw.get("prices") or {}
    sale_price_obj = prices.get("salePrice") or {}
    price_display = str(
        sale_price_obj.get("formattedPrice")
        or prices.get("formattedPrice")
        or ""
    ).strip()
    price_num = _parse_float(sale_price_obj.get("minPrice") or price_display)
    if not price_display and price_num > 0:
        price_display = f"${price_num:.2f}"

    orig_obj = prices.get("originalPrice") or {}
    orig_price_display = str(orig_obj.get("formattedPrice") or "").strip()
    discount_val = sale_price_obj.get("discount") or prices.get("discount") or 0
    try:
        discount_pct = int(float(discount_val))
    except (TypeError, ValueError):
        discount_pct = 0

    if not orig_price_display and discount_pct > 0 and price_num > 0 and discount_pct < 100:
        approx_orig = price_num / (1.0 - discount_pct / 100.0)
        orig_price_display = f"${approx_orig:.2f}"

    trade_obj = raw.get("trade") or {}
    orders_text = str(trade_obj.get("tradeDesc") or "").strip()
    orders_count = _parse_orders_count(orders_text)

    eval_obj = raw.get("evaluation") or {}
    try:
        rating = float(eval_obj.get("starRating") or 0.0)
    except (TypeError, ValueError):
        rating = 0.0

    store_obj = raw.get("store") or {}
    store_name = str(
        store_obj.get("storeName")
        or raw.get("storeName")
        or "AliExpress Seller"
    ).strip()

    image_obj = raw.get("image") or {}
    image_url = _normalize_image_url(str(image_obj.get("imgUrl") or ""))

    snippets: list[str] = []
    for sp in raw.get("sellingPoints") or []:
        if not isinstance(sp, dict):
            continue
        for mat in sp.get("materials") or []:
            if isinstance(mat, dict) and mat.get("type") == "TEXT":
                cleaned = _clean_html_text(str(mat.get("value") or ""))
                if cleaned and cleaned not in snippets:
                    snippets.append(cleaned)

    if raw.get("lunchTime"):
        snippets.append(f"Listed: {str(raw['lunchTime']).split(' ')[0]}")

    return {
        "productId": product_id,
        "url": f"https://www.aliexpress.com/item/{product_id}.html",
        "title": html_lib.unescape(title),
        "priceDisplay": price_display or "N/A",
        "price": price_num,
        "originalPrice": orig_price_display,
        "discount": discount_pct,
        "ordersText": orders_text or "0 sold",
        "ordersCount": orders_count,
        "rating": rating,
        "storeName": store_name,
        "imageUrl": image_url,
        "snippets": snippets,
    }


def _parse_dom_fallback(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Fallback BeautifulSoup DOM parser targeting a[href*='/item/'] anchors."""
    items: list[dict[str, Any]] = []
    for anchor in soup.select('a[href*="/item/"]'):
        href = anchor.get("href") or ""
        m = re.search(r"/item/(\d+)\.html", href)
        if not m:
            continue
        product_id = m.group(1)

        img = anchor.find("img")
        img_url = ""
        if img:
            img_url = _normalize_image_url(
                str(img.get("src") or img.get("data-src") or "")
            )

        title = ""
        if img and img.get("alt"):
            title = str(img.get("alt")).strip()
        if not title:
            title = anchor.get_text(" ", strip=True)
        if not title or len(title) < 4:
            continue

        container_text = anchor.parent.get_text(" ", strip=True) if anchor.parent else ""
        price_match = re.search(r"(?:US\s*)?\$\s*(\d+(?:\.\d{1,2})?)", container_text)
        price_display = price_match.group(0) if price_match else "N/A"
        price_num = float(price_match.group(1)) if price_match else 0.0

        sold_match = re.search(r"([\d,]+\+?\s*sold)", container_text, re.I)
        orders_text = sold_match.group(1) if sold_match else "0 sold"

        items.append(
            {
                "productId": product_id,
                "url": f"https://www.aliexpress.com/item/{product_id}.html",
                "title": html_lib.unescape(title),
                "priceDisplay": price_display,
                "price": price_num,
                "originalPrice": "",
                "discount": 0,
                "ordersText": orders_text,
                "ordersCount": _parse_orders_count(orders_text),
                "rating": 0.0,
                "storeName": "AliExpress Seller",
                "imageUrl": img_url,
                "snippets": ["Parsed via DOM fallback"],
            }
        )
    return items


def parse_search_html(raw_html: str) -> list[dict[str, Any]]:
    """Parse AliExpress search HTML using embedded JSON extraction with DOM fallback."""
    soup = BeautifulSoup(raw_html, "lxml")
    extracted: list[dict[str, Any]] = []

    for script in soup.find_all("script"):
        content = script.string or ""
        if not content:
            continue
        if not any(k in content for k in ("itemList", "resultList", "mods")):
            continue

        # Handle AliExpress `window._dida_config_._init_data_ = { data: { ... } }`
        data_idx = content.find("data:")
        payload = None
        if data_idx != -1:
            payload = _extract_balanced_json(content, data_idx)
        if payload is None:
            init_idx = content.find("{")
            if init_idx != -1:
                payload = _extract_balanced_json(content, init_idx)

        if payload is None:
            continue

        for raw_list in _find_item_lists(payload):
            for raw_item in raw_list:
                if not isinstance(raw_item, dict):
                    continue
                normalized = _normalize_json_item(raw_item)
                if normalized:
                    extracted.append(normalized)

    if not extracted:
        extracted = _parse_dom_fallback(soup)

    return extracted


def _contains_term(text_lower: str, term: str) -> bool:
    """Check whether a keyword/phrase appears in lowercased title text."""
    term_lower = term.strip().lower()
    if not term_lower:
        return False
    if len(term_lower) <= 4 and re.search(r"^[a-z0-9]+$", term_lower):
        return bool(re.search(rf"\b{re.escape(term_lower)}\b", text_lower))
    return term_lower in text_lower


def _parse_boost_groups(raw_groups: list[str]) -> list[tuple[float, list[str]]]:
    """Parse --boost-group specs of the form 'POINTS:term1,term2,...'."""
    parsed: list[tuple[float, list[str]]] = []
    for spec in raw_groups:
        if ":" not in spec:
            continue
        pts_str, terms_str = spec.split(":", 1)
        try:
            pts = float(pts_str)
        except ValueError:
            continue
        terms = [t.strip() for t in terms_str.split(",") if t.strip()]
        if terms:
            parsed.append((pts, terms))
    return parsed


def _parse_penalties(raw_penalties: list[str]) -> list[tuple[str, float]]:
    """Parse --penalize specs of the form 'TERM:POINTS' (e.g. '74HC245:-25')."""
    parsed: list[tuple[str, float]] = []
    for spec in raw_penalties:
        if ":" not in spec:
            continue
        term, pts_str = spec.rsplit(":", 1)
        try:
            pts = float(pts_str)
        except ValueError:
            continue
        if term.strip():
            parsed.append((term.strip(), pts if pts < 0 else -abs(pts)))
    return parsed


CHIP_FAMILY_PATTERNS = [
    ("ICM-42688", r"icm[- ]?42688(?:-?p)?"),
    ("LSM6DSOX", r"lsm6dsox"),
    ("LSM6DSO", r"lsm6dso(?!x)"),
    ("LSM6DS3", r"lsm6ds3"),
    ("BMI270", r"bmi[- ]?270"),
    ("QMI8658", r"qmi[- ]?8658"),
    ("MPU6500", r"mpu[- ]?6500"),
    ("MPU9250", r"mpu[- ]?9250"),
    ("MPU6050", r"mpu[- ]?6050"),
    ("74AHCT125", r"(?:sn)?74ahct125[a-z]*"),
    ("74HCT245", r"(?:sn)?74hct245[a-z]*"),
    ("74LVC4245", r"(?:sn)?74lvc4245[a-z]*"),
    ("74LVC245", r"(?:sn)?74lvc245[a-z]*"),
]


def detect_chip_family(title: str) -> str:
    """Detect primary IC/sensor chip family from listing title."""
    t_lower = title.lower()
    for label, pat in CHIP_FAMILY_PATTERNS:
        if re.search(pat, t_lower):
            return label
    return ""


def _is_multipack(title_lower: str) -> bool:
    """Return True if listing title indicates a multi-unit pack (2pcs+, 5pcs, 10pcs, lot)."""
    return bool(re.search(r"\b(?:[2-9]|\d{2,})\s*pcs\b|\b\d+\s*[-/]\s*\d+\s*pcs\b|\blot\b", title_lower))


def _score_single_query(
    item: dict[str, Any],
    query: str,
    must_include: list[str],
    exclude: list[str],
    exclude_penalty_each: float,
    boost_groups: list[tuple[float, list[str]]],
    custom_penalties: list[tuple[str, float]],
    require_any: list[str],
    max_unit_price: float | None,
    max_price_penalty: float = -40.0,
) -> tuple[float, dict[str, Any]]:
    """Score an item against a single query string and return (raw_score, breakdown)."""
    title_lower = item["title"].lower()
    query_lower = query.strip().lower()
    query_tokens = [t for t in re.findall(r"[a-z0-9]+", query_lower) if len(t) > 0]

    # 1. Exact phrase match in title (+35)
    exact_phrase_pts = 35.0 if (query_lower and query_lower in title_lower) else 0.0

    # 2. Percentage of query tokens matched in title (+30 weighted)
    matched_tokens = [t for t in query_tokens if _contains_term(title_lower, t)]
    token_ratio = (len(matched_tokens) / len(query_tokens)) if query_tokens else 0.0
    token_pts = 30.0 * token_ratio

    # 3. Required keywords / boost groups
    matched_must: list[str] = []
    missed_must: list[str] = []
    must_pts = 0.0

    if boost_groups:
        for pts, terms in boost_groups:
            hits = [t for t in terms if _contains_term(title_lower, t)]
            if hits:
                must_pts += pts
                matched_must.extend(hits)
            else:
                missed_must.append("/".join(terms[:3]))
    if must_include:
        inc_hits: list[str] = []
        for kw in must_include:
            if _contains_term(title_lower, kw):
                inc_hits.append(kw)
                if kw not in matched_must:
                    matched_must.append(kw)
            else:
                missed_must.append(kw)
        if not boost_groups:
            must_pts = 20.0 * (len(inc_hits) / len(must_include))
    elif not boost_groups:
        must_pts = 20.0 * token_ratio

    # 4. Penalty for excluded terms & custom penalties
    matched_exclude = [kw for kw in exclude if _contains_term(title_lower, kw)]
    exclude_penalty = exclude_penalty_each * len(matched_exclude)

    matched_custom: list[str] = []
    for term, pts in custom_penalties:
        if _contains_term(title_lower, term):
            exclude_penalty += pts
            matched_custom.append(f"{term} ({pts:g})")

    if require_any and not any(_contains_term(title_lower, t) for t in require_any):
        exclude_penalty -= 30.0
        matched_custom.append(f"missing {'/'.join(require_any)} (-30)")

    if max_unit_price is not None:
        price_val = float(item.get("price") or 0.0)
        if price_val > max_unit_price and not _is_multipack(title_lower):
            exclude_penalty += max_price_penalty
            matched_custom.append(f"price>${max_unit_price:g} ({max_price_penalty:g})")

    # 5. Order volume & rating tie-breaker bonus (up to +15)
    orders_count = max(0, int(item.get("ordersCount") or 0))
    rating = float(item.get("rating") or 0.0)
    orders_pts = min(9.0, math.log10(orders_count + 1) * 3.0)
    rating_pts = min(6.0, (rating / 5.0) * 6.0) if rating > 0 else 0.0
    popularity_pts = orders_pts + rating_pts

    raw_score = exact_phrase_pts + token_pts + must_pts + exclude_penalty + popularity_pts
    breakdown = {
        "bestQuery": query,
        "exactPhrase": round(exact_phrase_pts, 1),
        "tokenMatch": round(token_pts, 1),
        "requiredMatch": round(must_pts, 1),
        "excludePenalty": round(exclude_penalty, 1),
        "popularityBonus": round(popularity_pts, 1),
        "matchedTokens": matched_tokens,
        "totalTokens": len(query_tokens),
        "matchedMust": matched_must,
        "missedMust": missed_must,
        "matchedExclude": matched_exclude + matched_custom,
    }
    return raw_score, breakdown


def score_item(
    item: dict[str, Any],
    queries: list[str],
    must_include: list[str],
    exclude: list[str],
    exclude_penalty_each: float = -50.0,
    boost_groups: list[tuple[float, list[str]]] | None = None,
    custom_penalties: list[tuple[str, float]] | None = None,
    require_any: list[str] | None = None,
    max_unit_price: float | None = None,
    max_price_penalty: float = -40.0,
) -> dict[str, Any]:
    """Compute a 0-100 relevance score across one or more queries."""
    best_raw = -1e9
    best_breakdown: dict[str, Any] = {}
    for q in queries:
        raw, bd = _score_single_query(
            item=item,
            query=q,
            must_include=must_include,
            exclude=exclude,
            exclude_penalty_each=exclude_penalty_each,
            boost_groups=boost_groups or [],
            custom_penalties=custom_penalties or [],
            require_any=require_any or [],
            max_unit_price=max_unit_price,
            max_price_penalty=max_price_penalty,
        )
        if raw > best_raw:
            best_raw = raw
            best_breakdown = bd

    final_score = max(0, min(100, round(best_raw)))
    item["score"] = final_score
    item["chipFamily"] = detect_chip_family(item["title"])
    item["matchedKeywords"] = sorted(
        set(best_breakdown.get("matchedTokens", []) + best_breakdown.get("matchedMust", []))
    )
    item["missedRequired"] = best_breakdown.get("missedMust", [])
    item["matchedExcluded"] = best_breakdown.get("matchedExclude", [])
    item["scoreBreakdown"] = best_breakdown
    return item


def generate_html(
    items: list[dict[str, Any]],
    query: str,
    must_include: list[str],
    exclude: list[str],
    output_path: Path,
) -> Path:
    """Generate a single, dependency-free dark-mode HTML dashboard."""
    items_json = json.dumps(items, ensure_ascii=False).replace("</", "<\\/")
    query_esc = html_lib.escape(query)
    must_esc = html_lib.escape(", ".join(must_include)) if must_include else "None"
    exclude_esc = html_lib.escape(", ".join(exclude)) if exclude else "None"

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AliSearch — {query_esc}</title>
  <style>
    :root {{
      --bg: #0d1117;
      --surface: #161b22;
      --surface-hover: #1f2630;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #58a6ff;
      --accent-hover: #79c0ff;
      --green: #3fb950;
      --amber: #d29922;
      --red: #f85149;
      --radius: 12px;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
    }}
    .topbar {{
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(13, 17, 23, 0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
    }}
    .topbar-inner {{
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }}
    .query-info h1 {{
      font-size: 1.1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .count-pill {{
      font-size: 0.78rem;
      font-weight: 600;
      background: #1f2937;
      color: var(--accent);
      border: 1px solid var(--border);
      padding: 2px 10px;
      border-radius: 999px;
    }}
    .meta-line {{
      font-size: 0.8rem;
      color: var(--muted);
      margin-top: 2px;
    }}
    .controls {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }}
    .filter-input {{
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.9rem;
      min-width: 240px;
      outline: none;
    }}
    .filter-input:focus {{ border-color: var(--accent); }}
    .sort-group {{
      display: flex;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }}
    .sort-btn {{
      background: transparent;
      border: none;
      color: var(--muted);
      padding: 8px 12px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }}
    .sort-btn:hover {{ color: var(--text); background: var(--surface-hover); }}
    .sort-btn.active {{
      background: var(--accent);
      color: #0d1117;
      font-weight: 600;
    }}
    .container {{
      max-width: 1400px;
      margin: 24px auto;
      padding: 0 24px 48px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 18px;
    }}
    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      cursor: pointer;
      transition: transform 0.15s, border-color 0.15s, background 0.15s;
    }}
    .card:hover {{
      transform: translateY(-2px);
      border-color: var(--accent);
      background: var(--surface-hover);
    }}
    .thumb-wrap {{
      position: relative;
      width: 100%;
      aspect-ratio: 1 / 1;
      background: #0b0e14;
      overflow: hidden;
    }}
    .thumb-wrap img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    .score-badge {{
      position: absolute;
      top: 10px;
      left: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      background: rgba(13, 17, 23, 0.88);
      border: 1px solid currentColor;
      backdrop-filter: blur(4px);
    }}
    .score-high {{ color: var(--green); }}
    .score-mid {{ color: var(--amber); }}
    .score-low {{ color: var(--red); }}
    .exclude-flag {{
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      background: rgba(248, 81, 73, 0.9);
      color: #fff;
    }}
    .card-body {{
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }}
    .card-title {{
      font-size: 0.92rem;
      font-weight: 500;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      color: var(--text);
    }}
    .price-row {{
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }}
    .price {{
      font-size: 1.15rem;
      font-weight: 700;
      color: #ff7b72;
    }}
    .orig-price {{
      font-size: 0.82rem;
      color: var(--muted);
      text-decoration: line-through;
    }}
    .discount-tag {{
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--green);
      background: rgba(63, 185, 80, 0.14);
      padding: 1px 6px;
      border-radius: 4px;
    }}
    .stats-row {{
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--muted);
    }}
    .card-actions {{
      margin-top: auto;
      padding-top: 6px;
    }}
    .ali-btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      background: #21262d;
      border: 1px solid var(--border);
      color: var(--accent);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      transition: background 0.15s, border-color 0.15s;
    }}
    .ali-btn:hover {{
      background: #2d333b;
      border-color: var(--accent);
      color: var(--accent-hover);
    }}
    .empty-state {{
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
      font-size: 1rem;
    }}
    /* Modal */
    .modal-backdrop {{
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }}
    .modal-backdrop.open {{ display: flex; }}
    .modal {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      max-width: 820px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      display: grid;
      grid-template-columns: 320px 1fr;
      position: relative;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
    }}
    @media (max-width: 720px) {{
      .modal {{ grid-template-columns: 1fr; }}
    }}
    .modal-close {{
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(13, 17, 23, 0.8);
      border: 1px solid var(--border);
      color: var(--text);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 1.1rem;
      cursor: pointer;
      display: grid;
      place-items: center;
    }}
    .modal-close:hover {{ border-color: var(--accent); color: var(--accent); }}
    .modal-img-wrap {{
      background: #0b0e14;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }}
    .modal-img-wrap img {{
      width: 100%;
      max-height: 360px;
      object-fit: contain;
      border-radius: 8px;
    }}
    .modal-body {{
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }}
    .modal-title {{
      font-size: 1.05rem;
      font-weight: 600;
      padding-right: 28px;
    }}
    .breakdown {{
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-size: 0.84rem;
    }}
    .breakdown h3 {{
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-bottom: 8px;
    }}
    .breakdown-grid {{
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 12px;
    }}
    .kw-pills {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }}
    .pill {{
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
    }}
    .pill-ok {{ color: var(--green); border-color: rgba(63, 185, 80, 0.4); background: rgba(63, 185, 80, 0.1); }}
    .pill-miss {{ color: var(--amber); border-color: rgba(210, 153, 34, 0.4); background: rgba(210, 153, 34, 0.1); }}
    .pill-bad {{ color: var(--red); border-color: rgba(248, 81, 73, 0.4); background: rgba(248, 81, 73, 0.1); }}
    .meta-list {{
      font-size: 0.84rem;
      color: var(--muted);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }}
    .modal-cta {{
      margin-top: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 11px 18px;
      border-radius: 8px;
      background: var(--accent);
      color: #0d1117;
      font-weight: 700;
      text-decoration: none;
      font-size: 0.95rem;
    }}
    .modal-cta:hover {{ background: var(--accent-hover); }}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="query-info">
        <h1>
          <span>AliSearch: "{query_esc}"</span>
          <span class="count-pill" id="resultCount">0 results</span>
        </h1>
        <div class="meta-line">
          Must include: <strong>{must_esc}</strong> &nbsp;|&nbsp; Excluded: <strong>{exclude_esc}</strong>
        </div>
      </div>
      <div class="controls">
        <input
          type="search"
          id="filterInput"
          class="filter-input"
          placeholder="Filter titles, stores, or specs..."
          autocomplete="off"
        />
        <div class="sort-group" role="group" aria-label="Sort results">
          <button class="sort-btn active" data-sort="score">Best Match Score</button>
          <button class="sort-btn" data-sort="price">Lowest Price</button>
          <button class="sort-btn" data-sort="orders">Most Orders</button>
        </div>
      </div>
    </div>
  </header>

  <main class="container">
    <div class="grid" id="cardGrid"></div>
    <div class="empty-state" id="emptyState" style="display:none;">
      No listings match your current filter.
    </div>
  </main>

  <div class="modal-backdrop" id="modalBackdrop" aria-hidden="true">
    <div class="modal" id="modalBox" role="dialog" aria-modal="true">
      <button class="modal-close" id="modalClose" aria-label="Close modal">&times;</button>
      <div class="modal-img-wrap">
        <img id="modalImg" src="" alt="" />
      </div>
      <div class="modal-body">
        <h2 class="modal-title" id="modalTitle"></h2>
        <div class="price-row" id="modalPrices"></div>
        <div class="breakdown" id="modalBreakdown"></div>
        <div class="meta-list" id="modalMeta"></div>
        <a id="modalLink" class="modal-cta" href="#" target="_blank" rel="noopener noreferrer">
          View Listing on AliExpress &#8599;
        </a>
      </div>
    </div>
  </div>

  <script>
    const ITEMS = {items_json};
    let currentSort = "score";
    let filterText = "";

    const grid = document.getElementById("cardGrid");
    const emptyState = document.getElementById("emptyState");
    const resultCount = document.getElementById("resultCount");
    const filterInput = document.getElementById("filterInput");
    const sortButtons = document.querySelectorAll(".sort-btn");
    const modalBackdrop = document.getElementById("modalBackdrop");
    const modalClose = document.getElementById("modalClose");

    function scoreClass(score) {{
      if (score >= 70) return "score-high";
      if (score >= 40) return "score-mid";
      return "score-low";
    }}

    function escapeHtml(str) {{
      return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }}

    function getFilteredAndSorted() {{
      const q = filterText.trim().toLowerCase();
      let list = ITEMS.filter((it) => {{
        if (!q) return true;
        const hay = [it.title, it.storeName, ...(it.snippets || [])].join(" ").toLowerCase();
        return hay.includes(q);
      }});

      list.sort((a, b) => {{
        if (currentSort === "price") {{
          const pa = a.price > 0 ? a.price : Number.MAX_SAFE_INTEGER;
          const pb = b.price > 0 ? b.price : Number.MAX_SAFE_INTEGER;
          return pa - pb || b.score - a.score;
        }}
        if (currentSort === "orders") {{
          return (b.ordersCount || 0) - (a.ordersCount || 0) || b.score - a.score;
        }}
        return (b.score || 0) - (a.score || 0) || (b.ordersCount || 0) - (a.ordersCount || 0);
      }});
      return list;
    }}

    function render() {{
      const list = getFilteredAndSorted();
      resultCount.textContent = `${{list.length}} result${{list.length === 1 ? "" : "s"}}`;
      if (!list.length) {{
        grid.innerHTML = "";
        emptyState.style.display = "block";
        return;
      }}
      emptyState.style.display = "none";

      grid.innerHTML = list.map((it) => {{
        const origHtml = it.originalPrice
          ? `<span class="orig-price">${{escapeHtml(it.originalPrice)}}</span>`
          : "";
        const discHtml = it.discount > 0
          ? `<span class="discount-tag">-${{it.discount}}%</span>`
          : "";
        const exclHtml = (it.matchedExcluded && it.matchedExcluded.length)
          ? `<span class="exclude-flag">Excluded term</span>`
          : "";
        const chipHtml = it.chipFamily
          ? `<span class="pill pill-ok" style="align-self:flex-start;">${{escapeHtml(it.chipFamily)}}</span>`
          : "";
        const ratingStr = it.rating > 0 ? `★ ${{it.rating.toFixed(1)}}` : "No rating";

        return `
          <article class="card" data-id="${{escapeHtml(it.productId)}}">
            <div class="thumb-wrap">
              <img src="${{escapeHtml(it.imageUrl)}}" alt="${{escapeHtml(it.title)}}" loading="lazy" />
              <span class="score-badge ${{scoreClass(it.score)}}">${{it.score}}% Match</span>
              ${{exclHtml}}
            </div>
            <div class="card-body">
              ${{chipHtml}}
              <div class="card-title">${{escapeHtml(it.title)}}</div>
              <div class="price-row">
                <span class="price">${{escapeHtml(it.priceDisplay)}}</span>
                ${{origHtml}}
                ${{discHtml}}
              </div>
              <div class="stats-row">
                <span>${{escapeHtml(it.ordersText)}}</span>
                <span>${{ratingStr}}</span>
              </div>
              <div class="card-actions">
                <a
                  class="ali-btn"
                  href="${{escapeHtml(it.url)}}"
                  target="_blank"
                  rel="noopener noreferrer"
                  onclick="event.stopPropagation();"
                >Open on AliExpress &#8599;</a>
              </div>
            </div>
          </article>
        `;
      }}).join("");
    }}

    function openModal(productId) {{
      const it = ITEMS.find((x) => x.productId === productId);
      if (!it) return;

      document.getElementById("modalImg").src = it.imageUrl || "";
      document.getElementById("modalImg").alt = it.title || "";
      document.getElementById("modalTitle").textContent = it.title || "";
      document.getElementById("modalLink").href = it.url;

      const origHtml = it.originalPrice
        ? `<span class="orig-price">${{escapeHtml(it.originalPrice)}}</span>`
        : "";
      const discHtml = it.discount > 0
        ? `<span class="discount-tag">-${{it.discount}}%</span>`
        : "";
      document.getElementById("modalPrices").innerHTML = `
        <span class="price">${{escapeHtml(it.priceDisplay)}}</span>
        ${{origHtml}}
        ${{discHtml}}
      `;

      const b = it.scoreBreakdown || {{}};
      const okPills = (it.matchedKeywords || []).map((k) => `<span class="pill pill-ok">+ ${{escapeHtml(k)}}</span>`).join("");
      const missPills = (it.missedRequired || []).map((k) => `<span class="pill pill-miss">Missing: ${{escapeHtml(k)}}</span>`).join("");
      const badPills = (it.matchedExcluded || []).map((k) => `<span class="pill pill-bad">Excluded: ${{escapeHtml(k)}}</span>`).join("");

      document.getElementById("modalBreakdown").innerHTML = `
        <h3>Match Score Breakdown (${{it.score}} / 100)</h3>
        <div class="breakdown-grid">
          <span>Exact phrase match</span><strong>+${{b.exactPhrase ?? 0}}</strong>
          <span>Query token match (${{b.matchedTokens?.length ?? 0}}/${{b.totalTokens ?? 0}})</span><strong>+${{b.tokenMatch ?? 0}}</strong>
          <span>Required keywords</span><strong>+${{b.requiredMatch ?? 0}}</strong>
          <span>Excluded term penalty</span><strong>${{b.excludePenalty ?? 0}}</strong>
          <span>Orders &amp; rating bonus</span><strong>+${{b.popularityBonus ?? 0}}</strong>
        </div>
        <div class="kw-pills">${{okPills}}${{missPills}}${{badPills}}</div>
      `;

      const snippetsText = (it.snippets && it.snippets.length) ? it.snippets.join(" · ") : "None";
      document.getElementById("modalMeta").innerHTML = `
        <div><strong>Chip Family:</strong> ${{escapeHtml(it.chipFamily || "Unknown")}}</div>
        <div><strong>Store:</strong> ${{escapeHtml(it.storeName)}}</div>
        <div><strong>Orders:</strong> ${{escapeHtml(it.ordersText)}} &nbsp;|&nbsp; <strong>Rating:</strong> ${{it.rating > 0 ? it.rating.toFixed(1) + " ★" : "N/A"}}</div>
        <div><strong>Product ID:</strong> ${{escapeHtml(it.productId)}}</div>
        <div><strong>Specs / Badges:</strong> ${{escapeHtml(snippetsText)}}</div>
      `;

      modalBackdrop.classList.add("open");
      modalBackdrop.setAttribute("aria-hidden", "false");
    }}

    function closeModal() {{
      modalBackdrop.classList.remove("open");
      modalBackdrop.setAttribute("aria-hidden", "true");
    }}

    grid.addEventListener("click", (e) => {{
      const card = e.target.closest(".card");
      if (card) openModal(card.dataset.id);
    }});

    modalBackdrop.addEventListener("click", (e) => {{
      if (e.target === modalBackdrop) closeModal();
    }});
    modalClose.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {{
      if (e.key === "Escape" && modalBackdrop.classList.contains("open")) {{
        closeModal();
      }}
    }});

    filterInput.addEventListener("input", (e) => {{
      filterText = e.target.value;
      render();
    }});

    sortButtons.forEach((btn) => {{
      btn.addEventListener("click", () => {{
        sortButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentSort = btn.dataset.sort;
        render();
      }});
    }});

    render();
  </script>
</body>
</html>
"""
    output_path.write_text(html_doc, encoding="utf-8")
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Search AliExpress, rank by relevance, and open a local HTML dashboard."
    )
    parser.add_argument("queries", nargs="+", help="One or more search query strings")
    parser.add_argument("--pages", type=int, default=2, help="Number of result pages to fetch per query (default: 2)")
    parser.add_argument(
        "--must-include",
        nargs="*",
        default=[],
        help="Required keywords that boost relevance (+20 weighted)",
    )
    parser.add_argument(
        "--boost-group",
        nargs="*",
        default=[],
        help="Weighted keyword groups as 'POINTS:term1,term2,...'",
    )
    parser.add_argument(
        "--exclude",
        nargs="*",
        default=[],
        help="Excluded keywords that heavily penalize relevance",
    )
    parser.add_argument(
        "--exclude-penalty",
        type=float,
        default=-50.0,
        help="Penalty per excluded keyword match (default: -50)",
    )
    parser.add_argument(
        "--penalize",
        nargs="*",
        default=[],
        help="Custom keyword penalties as 'TERM:POINTS' (e.g. '74HC245:-25')",
    )
    parser.add_argument(
        "--require-any",
        nargs="*",
        default=[],
        help="Apply -30 penalty if none of these terms appear in the title (e.g. module board breakout)",
    )
    parser.add_argument(
        "--max-unit-price",
        type=float,
        default=None,
        help="Apply penalty to single-unit listings priced above this threshold",
    )
    parser.add_argument(
        "--max-price-penalty",
        type=float,
        default=-40.0,
        help="Penalty for exceeding --max-unit-price (default: -40)",
    )
    parser.add_argument(
        "--cookie",
        default=None,
        help="Optional Cookie header string or path to Netscape cookie file",
    )
    parser.add_argument("--no-cache", action="store_true", help="Ignore .cache/ and re-fetch pages")
    parser.add_argument("--no-open", action="store_true", help="Do not auto-open results.html in browser")
    parser.add_argument("--output", default="results.html", help="Output HTML file path (default: results.html)")

    args = parser.parse_args()
    boost_groups = _parse_boost_groups(args.boost_group)
    custom_penalties = _parse_penalties(args.penalize)
    exclude_penalty_each = args.exclude_penalty if args.exclude_penalty < 0 else -abs(args.exclude_penalty)

    all_items: dict[str, dict[str, Any]] = {}
    for query in args.queries:
        slug = slugify_query(query)
        for page in range(1, max(1, args.pages) + 1):
            cache_hit = (CACHE_DIR / f"{slug}_page_{page}.html").exists() and not args.no_cache
            try:
                raw_html = fetch_page(
                    slug=slug,
                    page=page,
                    cache_dir=CACHE_DIR,
                    use_cache=not args.no_cache,
                    cookie=args.cookie,
                )
                page_items = parse_search_html(raw_html)
                print(f"[parse] '{query}' page {page}: extracted {len(page_items)} items")
                for item in page_items:
                    pid = item["productId"]
                    if pid not in all_items:
                        all_items[pid] = item
                if not cache_hit:
                    time.sleep(1.2)
            except Exception as exc:
                print(f"[error] Failed on '{query}' page {page}: {exc}", file=sys.stderr)

    items = [
        score_item(
            item=item,
            queries=args.queries,
            must_include=args.must_include,
            exclude=args.exclude,
            exclude_penalty_each=exclude_penalty_each,
            boost_groups=boost_groups,
            custom_penalties=custom_penalties,
            require_any=args.require_any,
            max_unit_price=args.max_unit_price,
            max_price_penalty=(
                args.max_price_penalty if args.max_price_penalty < 0 else -abs(args.max_price_penalty)
            ),
        )
        for item in all_items.values()
    ]
    items.sort(key=lambda x: (x["score"], x["ordersCount"]), reverse=True)

    query_label = " | ".join(args.queries)
    must_display = args.must_include if args.must_include else [t for _, grp in boost_groups for t in grp[:2]]
    out_path = Path(args.output).resolve()
    generate_html(items, query_label, must_display, args.exclude, out_path)
    print(f"[done] Wrote {len(items)} unique ranked items to {out_path}")

    if items:
        print("\nTop 10 matches:")
        for idx, it in enumerate(items[:10], 1):
            print(f"  {idx:2d}. [{it['score']:3d}%] {it['priceDisplay']:>9} | {it['ordersText']:>10} | {it['title'][:78]}")

    if not args.no_open:
        webbrowser.open(out_path.as_uri())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
