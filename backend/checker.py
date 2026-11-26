"""
LinkSure Checker Module
Core link checking, parsing, classification, and rate-limiting logic.
Isolated from FastAPI routing to be directly unit-testable.
"""

from __future__ import annotations

import asyncio
import html
import random
import re
import time
from dataclasses import asdict, dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

from backend.fetcher import FetchResponse, PluggableFetcher
from backend.quota import QuotaCacheStore

# Status constants
STATUS_OK = "OK"
STATUS_REDIRECTED = "REDIRECTED"
STATUS_NOT_FOUND = "NOT_FOUND"
STATUS_BLOCKED = "BLOCKED"
STATUS_ERROR = "ERROR"

ALL_STATUSES = [STATUS_OK, STATUS_REDIRECTED, STATUS_NOT_FOUND, STATUS_BLOCKED, STATUS_ERROR]

# Regex patterns
ASIN_STRICT_RE = re.compile(r"^[A-Z0-9]{10}$")
PATH_ASIN_RE = re.compile(r"/(?:dp|gp/product|gp/aw/d|product)/([A-Za-z0-9]{10})", re.IGNORECASE)
LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
REL_CANON_RE = re.compile(r"""\brel\s*=\s*["']?canonical["']?""", re.IGNORECASE)
HREF_RE = re.compile(r"""\bhref\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml",
}


@dataclass
class ParseSummary:
    unique_asins: List[str]
    total_found: int
    duplicates_count: int
    duplicates: List[str]
    invalid_skipped: List[str]
    invalid_count: int

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CheckResult:
    asin: str
    start_url: str
    final_url: str
    final_asin: str
    status: str
    http_status: Optional[int]
    title: str
    note: str
    duration_ms: int = 0
    checked_at: str = ""
    cached: bool = False
    cached_at: str = ""
    fetch_provider: str = "direct"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SpeedConfig:
    concurrency: int
    min_delay: float
    max_delay: float
    max_retries: int


SPEED_PRESETS: Dict[str, SpeedConfig] = {
    "slow": SpeedConfig(concurrency=1, min_delay=2.5, max_delay=4.5, max_retries=2),
    "careful": SpeedConfig(concurrency=3, min_delay=1.5, max_delay=3.0, max_retries=2),
    "normal": SpeedConfig(concurrency=3, min_delay=0.8, max_delay=1.5, max_retries=1),
    "fast": SpeedConfig(concurrency=5, min_delay=0.2, max_delay=0.6, max_retries=1),
}


def headers_for_domain(domain: str) -> Dict[str, str]:
    """Returns realistic browser headers tailored to the target Amazon domain."""
    lang = "en-IN,en;q=0.9"
    if domain.endswith(".com") or domain.endswith(".ca"):
        lang = "en-US,en;q=0.9"
    elif domain.endswith(".co.uk"):
        lang = "en-GB,en;q=0.9"
    elif domain.endswith(".de"):
        lang = "de-DE,de;q=0.9,en;q=0.8"
    elif domain.endswith(".fr"):
        lang = "fr-FR,fr;q=0.9,en;q=0.8"
    elif domain.endswith(".es"):
        lang = "es-ES,es;q=0.9,en;q=0.8"
    elif domain.endswith(".it"):
        lang = "it-IT,it;q=0.9,en;q=0.8"
    elif domain.endswith(".co.jp"):
        lang = "ja-JP,ja;q=0.9,en;q=0.8"
    return {
        **DEFAULT_HEADERS,
        "Accept-Language": lang,
    }


def parse_input(raw_text: str) -> ParseSummary:
    """
    Parses messy user input (pasted text, CSV/TXT dumps, URLs, comma/space/line separated).
    Extracts valid 10-char ASINs, deduplicates while preserving order,
    and identifies invalid tokens and duplicates.
    """
    if not raw_text:
        return ParseSummary(
            unique_asins=[],
            total_found=0,
            duplicates_count=0,
            duplicates=[],
            invalid_skipped=[],
            invalid_count=0,
        )

    normalized = re.sub(r"[\s,;|\"\'\[\]]+", "\n", raw_text)
    raw_tokens = [tok.strip() for tok in normalized.split("\n") if tok.strip()]

    seen_asins: set[str] = set()
    unique_asins: List[str] = []
    duplicates: List[str] = []
    invalid_skipped: List[str] = []

    for token in raw_tokens:
        token_clean = token.strip()
        if not token_clean:
            continue

        extracted_asin: Optional[str] = None

        url_match = PATH_ASIN_RE.search(token_clean)
        if url_match:
            cand = url_match.group(1).upper()
            if ASIN_STRICT_RE.match(cand):
                extracted_asin = cand

        if not extracted_asin:
            cand = token_clean.upper()
            if ASIN_STRICT_RE.match(cand):
                extracted_asin = cand

        if extracted_asin:
            if extracted_asin in seen_asins:
                duplicates.append(extracted_asin)
            else:
                seen_asins.add(extracted_asin)
                unique_asins.append(extracted_asin)
        else:
            if len(token_clean) <= 60 and token_clean not in invalid_skipped:
                invalid_skipped.append(token_clean)

    return ParseSummary(
        unique_asins=unique_asins,
        total_found=len(unique_asins),
        duplicates_count=len(duplicates),
        duplicates=duplicates,
        invalid_skipped=invalid_skipped,
        invalid_count=len(invalid_skipped),
    )


def extract_asin_from_url(url: str) -> Optional[str]:
    """Extracts 10-char ASIN from a URL path if present."""
    if not url:
        return None
    try:
        parsed = urlparse(url)
        match = PATH_ASIN_RE.search(parsed.path)
        if match:
            return match.group(1).upper()
    except Exception:
        pass
    return None


def extract_canonical_url(html_content: str) -> Optional[str]:
    """Finds <link rel='canonical' href='...'> in HTML regardless of attribute order."""
    if not html_content:
        return None
    for tag in LINK_TAG_RE.findall(html_content):
        if REL_CANON_RE.search(tag):
            href_match = HREF_RE.search(tag)
            if href_match:
                href = html.unescape(href_match.group(1)).strip()
                if href:
                    return href
    return None


def extract_title(html_content: str) -> str:
    """Extracts clean sanitized <title> text from HTML, stripping Amazon store suffixes."""
    if not html_content:
        return ""
    match = TITLE_RE.search(html_content)
    if match:
        raw_title = match.group(1)
        cleaned = re.sub(r"\s+", " ", html.unescape(raw_title)).strip()
        cleaned = re.sub(r"\s*:\s*Amazon\.[a-z.]+(\s*:.*)?$", "", cleaned, flags=re.IGNORECASE)
        return cleaned[:140]
    return ""


def classify_response(
    asin: str,
    start_url: str,
    final_url: str,
    status_code: Optional[int],
    body: str,
    error_msg: Optional[str] = None,
    fetch_provider: str = "direct",
) -> CheckResult:
    """
    Classifies the result strictly as one of:
    - OK: final URL's ASIN equals requested ASIN AND canonical ASIN (if present) equals it too
    - REDIRECTED: final URL's ASIN differs, OR canonical ASIN differs, OR did not land on a product page
    - NOT_FOUND: HTTP 404 or Amazon's "page not found" / "looking for something"
    - BLOCKED: HTTP 503/429 or captcha / bot-wall interstitial
    - ERROR: network/timeout or unhandled HTTP >= 400 error
    """
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    res = CheckResult(
        asin=asin,
        start_url=start_url,
        final_url=final_url or start_url,
        final_asin="",
        status=STATUS_ERROR,
        http_status=status_code,
        title="",
        note="",
        checked_at=now_iso,
        fetch_provider=fetch_provider,
    )

    if error_msg:
        res.status = STATUS_ERROR
        res.note = f"Network error: {error_msg}"
        return res

    body_lower = (body or "").lower()

    # 1. Check for Bot-Wall / Captcha / Throttling -> BLOCKED
    is_blocked_status = status_code in (503, 429)
    is_captcha_page = (
        "/errors/validatecaptcha" in body_lower
        or "api-services-support@amazon" in body_lower
        or "captcha" in body_lower
        or "enter the characters you see below" in body_lower
        or "click the button below to continue shopping" in body_lower
        or "automated access" in body_lower
    )
    if is_blocked_status or is_captcha_page:
        res.status = STATUS_BLOCKED
        status_detail = f" (HTTP {status_code})" if status_code else ""
        res.note = f"Amazon showed captcha/throttle{status_detail} — could not verify (retry later or slow down)"
        res.title = extract_title(body)
        return res

    # 2. Check for Page Not Found (404 or dog page) -> NOT_FOUND
    is_404_status = status_code == 404
    is_not_found_page = (
        "page not found" in body_lower[:6000]
        or "looking for something?" in body_lower[:8000]
        or "the web address you entered is not a functioning page" in body_lower[:8000]
        or "sorry, we couldn't find that page" in body_lower[:8000]
    )
    if is_404_status or is_not_found_page:
        res.status = STATUS_NOT_FOUND
        res.note = "Amazon has no page for this ID"
        res.title = extract_title(body)
        return res

    # 3. Check for generic server / client errors
    if status_code and status_code >= 400:
        res.status = STATUS_ERROR
        res.note = f"HTTP {status_code}"
        res.title = extract_title(body)
        return res

    # 4. Extract Title, Final ASIN, and Canonical ASIN
    res.title = extract_title(body)
    final_asin = extract_asin_from_url(final_url)
    canon_href = extract_canonical_url(body)
    canon_asin = extract_asin_from_url(canon_href) if canon_href else None

    res.final_asin = final_asin or canon_asin or ""

    # 5. Classify OK vs REDIRECTED
    if final_asin and final_asin != asin:
        res.status = STATUS_REDIRECTED
        res.final_asin = final_asin
        res.note = f"URL redirected {asin} -> {final_asin}"
        return res

    if canon_asin and canon_asin != asin:
        res.status = STATUS_REDIRECTED
        res.final_asin = canon_asin
        res.note = f"Page canonical is a different product ({canon_asin})"
        return res

    if final_asin != asin:
        res.status = STATUS_REDIRECTED
        res.final_asin = ""
        res.note = "Did not land on a product page (sent to search/home?)"
        return res

    res.status = STATUS_OK
    res.final_asin = asin
    res.note = ""
    return res


async def check_asin(
    client: httpx.AsyncClient,
    asin: str,
    domain: str = "amazon.in",
    timeout: float = 20.0,
    max_retries: int = 2,
    url_override: Optional[str] = None,
    fetcher: Optional[PluggableFetcher] = None,
    quota_store: Optional[QuotaCacheStore] = None,
) -> CheckResult:
    """
    Checks a single ASIN via direct httpx fetch first.
    Optionally falls back to configured scraping provider ONLY if direct request is BLOCKED
    and daily fallback cap permits. Classification logic remains identical.
    """
    active_fetcher = fetcher or PluggableFetcher()
    start_url = url_override or f"https://www.{domain}/dp/{asin}"
    req_headers = headers_for_domain(domain)
    start_time = time.perf_counter()

    last_result: Optional[CheckResult] = None

    for attempt in range(max_retries + 1):
        fetch_resp: FetchResponse = await active_fetcher.fetch_direct(
            client=client,
            url=start_url,
            headers=req_headers,
            timeout=timeout,
        )
        duration_ms = int((time.perf_counter() - start_time) * 1000)

        result = classify_response(
            asin=asin,
            start_url=start_url,
            final_url=fetch_resp.final_url,
            status_code=fetch_resp.status_code,
            body=fetch_resp.body,
            error_msg=fetch_resp.error,
            fetch_provider=fetch_resp.provider,
        )
        result.duration_ms = duration_ms
        last_result = result

        if result.status == STATUS_BLOCKED and attempt < max_retries:
            backoff = (attempt + 1) * 3.0 + random.uniform(0.5, 1.5)
            await asyncio.sleep(backoff)
            continue

        if result.status == STATUS_ERROR and attempt < max_retries:
            await asyncio.sleep(2.0)
            continue

        break

    assert last_result is not None

    # Optional fallback provider: used ONLY when direct request is BLOCKED
    if last_result.status == STATUS_BLOCKED and active_fetcher.is_fallback_configured:
        can_fallback = True
        if quota_store is not None:
            can_fallback = quota_store.try_consume_fallback()

        if can_fallback:
            fb_resp = await active_fetcher.fetch_fallback(client=client, target_url=start_url)
            fb_duration_ms = int((time.perf_counter() - start_time) * 1000)
            if fb_resp.error:
                # Honest failure: keep BLOCKED, note why fallback couldn't verify
                last_result.note = (
                    f"Direct blocked by Amazon; fallback ({fb_resp.provider}) failed: {fb_resp.error}"
                )
                last_result.duration_ms = fb_duration_ms
                return last_result

            fb_result = classify_response(
                asin=asin,
                start_url=start_url,
                final_url=fb_resp.final_url,
                status_code=fb_resp.status_code,
                body=fb_resp.body,
                error_msg=fb_resp.error,
                fetch_provider=fb_resp.provider,
            )
            fb_result.duration_ms = fb_duration_ms
            return fb_result
        else:
            last_result.note = (
                "Amazon blocked direct request and daily fallback cap reached — retry later"
            )

    return last_result


class LinkCheckerRunner:
    """
    Coordinates asynchronous checking of a list of ASINs with concurrency limit,
    24h cache support, randomized polite delays, cancellation support, and live event callbacks.
    """

    def __init__(
        self,
        asins: List[str],
        domain: str = "amazon.in",
        speed: str = "careful",
        mock_base_url: Optional[str] = None,
        delay_override: Optional[Tuple[float, float]] = None,
        fetcher: Optional[PluggableFetcher] = None,
        quota_store: Optional[QuotaCacheStore] = None,
        force_recheck: bool = False,
        on_result: Optional[Callable[[CheckResult, Dict[str, Any]], Any]] = None,
    ):
        self.asins = asins
        self.domain = domain
        self.speed = speed
        self.config = SPEED_PRESETS.get(speed, SPEED_PRESETS["careful"])
        self.mock_base_url = mock_base_url
        self.delay_override = delay_override
        self.fetcher = fetcher or PluggableFetcher()
        self.quota_store = quota_store
        self.force_recheck = force_recheck
        self.on_result = on_result

        self.cancelled = False
        self.results: List[CheckResult] = []
        self.status_counts: Dict[str, int] = {st: 0 for st in ALL_STATUSES}
        self.completed_count = 0
        self.start_time = 0.0
        self.end_time = 0.0

    def cancel(self) -> None:
        self.cancelled = True

    async def _emit_result(self, res: CheckResult) -> None:
        self.results.append(res)
        self.status_counts[res.status] = self.status_counts.get(res.status, 0) + 1
        self.completed_count += 1

        if self.on_result:
            progress = {
                "completed": self.completed_count,
                "total": len(self.asins),
                "counts": dict(self.status_counts),
                "cancelled": self.cancelled,
            }
            if asyncio.iscoroutinefunction(self.on_result):
                await self.on_result(res, progress)
            else:
                self.on_result(res, progress)

    async def run(self) -> List[CheckResult]:
        self.start_time = time.time()
        semaphore = asyncio.Semaphore(self.config.concurrency)

        min_delay, max_delay = (
            self.delay_override
            if self.delay_override is not None
            else (self.config.min_delay, self.config.max_delay)
        )

        async with httpx.AsyncClient() as client:

            async def worker(idx: int, asin: str):
                if self.cancelled:
                    return

                # Check 24h cache first (when not forced and not in mock URL override mode)
                if not self.force_recheck and self.quota_store is not None and not self.mock_base_url:
                    cached_data = self.quota_store.get_cached(asin, self.domain)
                    if cached_data:
                        cached_res = CheckResult(**cached_data)
                        await self._emit_result(cached_res)
                        return

                if idx < self.config.concurrency and min_delay > 0:
                    await asyncio.sleep(idx * random.uniform(0.3, 0.7))

                async with semaphore:
                    if self.cancelled:
                        return

                    url_override = None
                    if self.mock_base_url:
                        url_override = f"{self.mock_base_url}/dp/{asin}"

                    res = await check_asin(
                        client=client,
                        asin=asin,
                        domain=self.domain,
                        max_retries=self.config.max_retries,
                        url_override=url_override,
                        fetcher=self.fetcher,
                        quota_store=self.quota_store,
                    )

                    if self.cancelled:
                        return

                    if self.quota_store is not None and not self.mock_base_url:
                        self.quota_store.set_cached(asin, self.domain, res.to_dict())

                    await self._emit_result(res)

                    if not self.cancelled and max_delay > 0:
                        delay = random.uniform(min_delay, max_delay)
                        await asyncio.sleep(delay)

            tasks = [asyncio.create_task(worker(i, asin)) for i, asin in enumerate(self.asins)]
            try:
                await asyncio.gather(*tasks, return_exceptions=True)
            except asyncio.CancelledError:
                self.cancelled = True

        self.end_time = time.time()
        return self.results
