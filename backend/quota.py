"""
LinkSure Quota & Cache Store (SQLite)
Protects free-tier resources with:
- 24-hour cache per (ASIN, domain) for definitive results (OK, REDIRECTED, NOT_FOUND)
- Per-IP sliding-window rate limit (default: 50 IDs/hour)
- Global daily cap on fallback scraping provider calls (DAILY_FALLBACK_CAP)
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import threading
import time
from typing import Any, Dict, Optional, Tuple


DEFAULT_DB_PATH = os.path.join(tempfile.gettempdir(), "linksure_quota.db")
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_HOURS", "24")) * 3600
IP_HOURLY_LIMIT = int(os.environ.get("IP_HOURLY_LIMIT", "50"))
MAX_ASINS_PER_REQUEST = int(os.environ.get("MAX_ASINS_PER_REQUEST", "100"))
DAILY_FALLBACK_CAP = int(os.environ.get("DAILY_FALLBACK_CAP", "100"))


class QuotaCacheStore:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or os.environ.get("CACHE_DB_PATH") or DEFAULT_DB_PATH
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS asin_cache (
                    asin TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    cached_at REAL NOT NULL,
                    PRIMARY KEY (asin, domain)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS ip_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT NOT NULL,
                    count INTEGER NOT NULL,
                    ts REAL NOT NULL
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_ip_ts ON ip_usage (ip, ts)")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS daily_fallback (
                    day_utc TEXT PRIMARY KEY,
                    count INTEGER NOT NULL
                )
                """
            )
            self._conn.commit()

    def get_cached(
        self,
        asin: str,
        domain: str,
        ttl_seconds: int = CACHE_TTL_SECONDS,
    ) -> Optional[Dict[str, Any]]:
        now = time.time()
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(
                "SELECT result_json, cached_at FROM asin_cache WHERE asin = ? AND domain = ?",
                (asin.upper(), domain.lower()),
            )
            row = cur.fetchone()
            if not row:
                return None
            result_json, cached_at = row
            if now - cached_at > ttl_seconds:
                cur.execute(
                    "DELETE FROM asin_cache WHERE asin = ? AND domain = ?",
                    (asin.upper(), domain.lower()),
                )
                self._conn.commit()
                return None

            data = json.loads(result_json)
            data["cached"] = True
            data["cached_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cached_at))
            return data

    def set_cached(self, asin: str, domain: str, result_dict: Dict[str, Any]) -> None:
        # Only cache definitive results (never cache BLOCKED or ERROR)
        if result_dict.get("status") not in ("OK", "REDIRECTED", "NOT_FOUND"):
            return
        now = time.time()
        payload = dict(result_dict)
        payload["cached"] = False
        payload["cached_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(
                """
                INSERT INTO asin_cache (asin, domain, result_json, cached_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(asin, domain) DO UPDATE SET
                    result_json = excluded.result_json,
                    cached_at = excluded.cached_at
                """,
                (asin.upper(), domain.lower(), json.dumps(payload), now),
            )
            self._conn.commit()

    def cache_count(self) -> int:
        cutoff = time.time() - CACHE_TTL_SECONDS
        with self._lock:
            cur = self._conn.cursor()
            cur.execute("SELECT COUNT(*) FROM asin_cache WHERE cached_at >= ?", (cutoff,))
            return int(cur.fetchone()[0])

    def check_and_consume_ip_quota(
        self,
        ip: str,
        requested_count: int,
        limit: int = IP_HOURLY_LIMIT,
        window_seconds: int = 3600,
    ) -> Tuple[bool, int, int]:
        """
        Checks if `ip` has capacity for `requested_count` IDs in the current 1h window.
        Returns (allowed, remaining_after_or_current, retry_after_seconds).
        """
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            cur = self._conn.cursor()
            cur.execute("DELETE FROM ip_usage WHERE ts < ?", (cutoff,))
            cur.execute(
                "SELECT COALESCE(SUM(count), 0), MIN(ts) FROM ip_usage WHERE ip = ?",
                (ip,),
            )
            used, oldest_ts = cur.fetchone()
            used = int(used or 0)

            if used + requested_count > limit:
                remaining = max(0, limit - used)
                retry_after = max(1, int((oldest_ts + window_seconds) - now)) if oldest_ts else window_seconds
                self._conn.commit()
                return False, remaining, retry_after

            if requested_count > 0:
                cur.execute(
                    "INSERT INTO ip_usage (ip, count, ts) VALUES (?, ?, ?)",
                    (ip, requested_count, now),
                )
            self._conn.commit()
            return True, max(0, limit - (used + requested_count)), 0

    def try_consume_fallback(self, cap: Optional[int] = None) -> bool:
        """Atomically checks and consumes 1 fallback call against the daily UTC cap."""
        effective_cap = cap if cap is not None else int(os.environ.get("DAILY_FALLBACK_CAP", str(DAILY_FALLBACK_CAP)))
        if effective_cap <= 0:
            return False
        day_utc = time.strftime("%Y-%m-%d", time.gmtime())
        with self._lock:
            cur = self._conn.cursor()
            cur.execute("SELECT count FROM daily_fallback WHERE day_utc = ?", (day_utc,))
            row = cur.fetchone()
            current = int(row[0]) if row else 0
            if current >= effective_cap:
                return False
            cur.execute(
                """
                INSERT INTO daily_fallback (day_utc, count) VALUES (?, 1)
                ON CONFLICT(day_utc) DO UPDATE SET count = count + 1
                """,
                (day_utc,),
            )
            self._conn.commit()
            return True

    def get_fallback_usage(self, cap: Optional[int] = None) -> Tuple[int, int]:
        effective_cap = cap if cap is not None else int(os.environ.get("DAILY_FALLBACK_CAP", str(DAILY_FALLBACK_CAP)))
        day_utc = time.strftime("%Y-%m-%d", time.gmtime())
        with self._lock:
            cur = self._conn.cursor()
            cur.execute("SELECT count FROM daily_fallback WHERE day_utc = ?", (day_utc,))
            row = cur.fetchone()
            used = int(row[0]) if row else 0
            return used, effective_cap
