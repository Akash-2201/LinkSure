"""
Unit and Integration Tests for LinkSure Quota, Cache, Fetcher Fallback, and CORS
"""

import os
import tempfile
import pytest
import httpx
from fastapi.testclient import TestClient

from backend.checker import (
    STATUS_OK,
    STATUS_REDIRECTED,
    STATUS_BLOCKED,
    CheckResult,
    LinkCheckerRunner,
    check_asin,
)
from backend.fetcher import FetchResponse, PluggableFetcher
from backend.quota import QuotaCacheStore
from backend.main import app, get_allowed_origins, QUOTA_STORE


def _temp_store():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    return QuotaCacheStore(db_path=path), path


def test_24h_cache_stores_definitive_and_skips_blocked():
    store, db_path = _temp_store()
    try:
        ok_res = CheckResult(
            asin="B0DS8PP26V",
            start_url="https://www.amazon.in/dp/B0DS8PP26V",
            final_url="https://www.amazon.in/dp/B0DS8PP26V",
            final_asin="B0DS8PP26V",
            status=STATUS_OK,
            http_status=200,
            title="Safety Handle",
            note="",
        ).to_dict()
        blocked_res = CheckResult(
            asin="B0DY1SKHYV",
            start_url="https://www.amazon.in/dp/B0DY1SKHYV",
            final_url="https://www.amazon.in/dp/B0DY1SKHYV",
            final_asin="",
            status=STATUS_BLOCKED,
            http_status=503,
            title="Robot Check",
            note="Blocked",
        ).to_dict()

        store.set_cached("B0DS8PP26V", "amazon.in", ok_res)
        store.set_cached("B0DY1SKHYV", "amazon.in", blocked_res)

        cached = store.get_cached("B0DS8PP26V", "amazon.in")
        assert cached is not None
        assert cached["cached"] is True
        assert cached["status"] == STATUS_OK

        # BLOCKED must never be cached
        assert store.get_cached("B0DY1SKHYV", "amazon.in") is None

        # Expired TTL returns None
        assert store.get_cached("B0DS8PP26V", "amazon.in", ttl_seconds=-1) is None
    finally:
        store._conn.close()
        os.remove(db_path)


def test_per_ip_hourly_limit():
    store, db_path = _temp_store()
    try:
        allowed, rem, _ = store.check_and_consume_ip_quota("1.2.3.4", 30, limit=50)
        assert allowed is True
        assert rem == 20

        allowed2, rem2, _ = store.check_and_consume_ip_quota("1.2.3.4", 20, limit=50)
        assert allowed2 is True
        assert rem2 == 0

        # Exceeding 50/hour for same IP is rejected
        allowed3, rem3, retry_after = store.check_and_consume_ip_quota("1.2.3.4", 1, limit=50)
        assert allowed3 is False
        assert rem3 == 0
        assert retry_after > 0

        # Different IP still has full quota
        allowed_other, rem_other, _ = store.check_and_consume_ip_quota("5.6.7.8", 10, limit=50)
        assert allowed_other is True
        assert rem_other == 40
    finally:
        store._conn.close()
        os.remove(db_path)


def test_daily_fallback_cap():
    store, db_path = _temp_store()
    try:
        assert store.try_consume_fallback(cap=2) is True
        assert store.try_consume_fallback(cap=2) is True
        assert store.try_consume_fallback(cap=2) is False
        used, cap = store.get_fallback_usage(cap=2)
        assert used == 2
        assert cap == 2
    finally:
        store._conn.close()
        os.remove(db_path)


@pytest.mark.asyncio
async def test_fallback_called_only_when_direct_is_blocked():
    store, db_path = _temp_store()
    try:
        calls = {"direct": 0, "fallback": 0}

        class MockFetcher(PluggableFetcher):
            def __init__(self, direct_resp, fallback_resp):
                super().__init__(fallback_provider="scraperapi", provider_api_key="test_key")
                self._direct = direct_resp
                self._fallback = fallback_resp

            async def fetch_direct(self, client, url, headers, timeout=20.0):
                calls["direct"] += 1
                return self._direct

            async def fetch_fallback(self, client, target_url, timeout=35.0):
                calls["fallback"] += 1
                return self._fallback

        # Case 1: Direct returns OK -> fallback MUST NOT be called
        direct_ok = FetchResponse(
            final_url="https://www.amazon.in/dp/B0DS8PP26V",
            status_code=200,
            body='<title>Safety Handle : Amazon.in</title><link rel="canonical" href="https://www.amazon.in/dp/B0DS8PP26V">',
            provider="direct",
        )
        fb_unused = FetchResponse(final_url="", status_code=200, body="", provider="scraperapi")
        fetcher1 = MockFetcher(direct_ok, fb_unused)
        async with httpx.AsyncClient() as client:
            res1 = await check_asin(client, "B0DS8PP26V", max_retries=0, fetcher=fetcher1, quota_store=store)
        assert res1.status == STATUS_OK
        assert calls["direct"] == 1
        assert calls["fallback"] == 0

        # Case 2: Direct returns BLOCKED (503) -> fallback IS called and classifies canonical redirect properly
        calls["direct"] = 0
        calls["fallback"] = 0
        direct_blocked = FetchResponse(
            final_url="https://www.amazon.in/dp/B0FSN4SK8T",
            status_code=503,
            body="Robot Check /errors/validatecaptcha",
            provider="direct",
        )
        fb_canonical = FetchResponse(
            final_url="https://www.amazon.in/dp/B0FSN4SK8T",
            status_code=200,
            body='<title>Study Desk : Amazon.in</title><link rel="canonical" href="https://www.amazon.in/dp/B0FSMG7J6Q">',
            provider="scraperapi",
        )
        fetcher2 = MockFetcher(direct_blocked, fb_canonical)
        async with httpx.AsyncClient() as client:
            res2 = await check_asin(client, "B0FSN4SK8T", max_retries=0, fetcher=fetcher2, quota_store=store)
        assert res2.status == STATUS_REDIRECTED
        assert res2.final_asin == "B0FSMG7J6Q"
        assert res2.fetch_provider == "scraperapi"
        assert calls["direct"] == 1
        assert calls["fallback"] == 1

        # Case 3: Both direct and fallback are blocked -> returns honest BLOCKED (never fake OK)
        fb_also_blocked = FetchResponse(
            final_url="https://www.amazon.in/dp/B0DY1SKHYV",
            status_code=503,
            body="Enter the characters you see below",
            provider="scraperapi",
        )
        fetcher3 = MockFetcher(direct_blocked, fb_also_blocked)
        async with httpx.AsyncClient() as client:
            res3 = await check_asin(client, "B0DY1SKHYV", max_retries=0, fetcher=fetcher3, quota_store=store)
        assert res3.status == STATUS_BLOCKED
    finally:
        store._conn.close()
        os.remove(db_path)


@pytest.mark.asyncio
async def test_runner_uses_cache_unless_force_recheck():
    store, db_path = _temp_store()
    try:
        store.set_cached(
            "B0DS8PP26V",
            "amazon.in",
            CheckResult(
                asin="B0DS8PP26V",
                start_url="https://www.amazon.in/dp/B0DS8PP26V",
                final_url="https://www.amazon.in/dp/B0DS8PP26V",
                final_asin="B0DS8PP26V",
                status=STATUS_OK,
                http_status=200,
                title="Cached Title",
                note="",
            ).to_dict(),
        )
        runner = LinkCheckerRunner(
            asins=["B0DS8PP26V"],
            domain="amazon.in",
            quota_store=store,
            force_recheck=False,
            delay_override=(0.0, 0.0),
        )
        results = await runner.run()
        assert len(results) == 1
        assert results[0].cached is True
        assert results[0].title == "Cached Title"
    finally:
        store._conn.close()
        os.remove(db_path)


def test_api_max_100_asins_and_ip_rate_limit(monkeypatch):
    store, db_path = _temp_store()
    monkeypatch.setattr("backend.main.QUOTA_STORE", store)
    try:
        client = TestClient(app)

        # > 100 ASINs returns 400
        too_many = [f"B0TEST{i:04d}" for i in range(101)]
        resp_101 = client.post("/api/check", json={"asins": too_many})
        assert resp_101.status_code == 400
        assert "Maximum 100 ASINs" in resp_101.json()["detail"]

        # > 50 uncached IDs/hour returns 429
        fifty_one = [f"B0RATE{i:04d}" for i in range(51)]
        resp_51 = client.post("/api/check", json={"asins": fifty_one}, headers={"x-forwarded-for": "9.9.9.9"})
        assert resp_51.status_code == 429
        assert "50" in resp_51.json()["detail"]
    finally:
        store._conn.close()
        os.remove(db_path)


def test_allowed_origins_cors(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://linksure.pages.dev, https://custom.example.com/")
    origins = get_allowed_origins()
    assert origins == ["https://linksure.pages.dev", "https://custom.example.com"]
