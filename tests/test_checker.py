"""
Unit and Integration Tests for LinkSure
Tests parsing, classification, mock server scenarios, API endpoints,
DEMO_MODE default-off safety, SSE init/stream consistency, and cancellation.
"""

import json
import pytest
import httpx
from fastapi.testclient import TestClient

from backend.checker import (
    STATUS_OK,
    STATUS_REDIRECTED,
    STATUS_NOT_FOUND,
    STATUS_BLOCKED,
    STATUS_ERROR,
    SPEED_PRESETS,
    parse_input,
    check_asin,
    classify_response,
    extract_canonical_url,
    LinkCheckerRunner,
)
from backend.mock_server import mock_app
from backend.main import app, JOBS, GLOBAL_DEMO_MODE


def test_demo_mode_off_by_default():
    """DEMO_MODE must be OFF by default and /mock must not be mounted unless env var is set."""
    assert GLOBAL_DEMO_MODE is False
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["demo_mode"] is False
    # /mock should return 404 when DEMO_MODE is off
    mock_resp = client.get("/mock/dp/B0DVZ845X5")
    assert mock_resp.status_code == 404


def test_speed_presets_careful():
    careful = SPEED_PRESETS["careful"]
    assert careful.concurrency == 3
    assert 1.0 <= careful.min_delay <= 3.0
    assert 1.0 <= careful.max_delay <= 3.0
    assert careful.min_delay <= careful.max_delay


def test_parse_input_messy():
    raw_input = """
    https://www.amazon.in/dp/B0F6ZG4YKF?th=1, b0dvz845x5
    B0F6ZG4YKF
    invalid_token_123
    https://amazon.com/gp/product/B0DWXMXXPN/ref=as_li_ss_tl

    B0F6ZG4YKF
    short
    B0DX6ZYL49; B0DY1SKHYV
    """
    summary = parse_input(raw_input)

    assert summary.unique_asins == [
        "B0F6ZG4YKF",
        "B0DVZ845X5",
        "B0DWXMXXPN",
        "B0DX6ZYL49",
        "B0DY1SKHYV",
    ]
    assert summary.total_found == 5
    assert summary.duplicates_count == 2
    assert summary.duplicates == ["B0F6ZG4YKF", "B0F6ZG4YKF"]
    assert "invalid_token_123" in summary.invalid_skipped
    assert "short" in summary.invalid_skipped
    assert summary.invalid_count >= 2


def test_canonical_extraction_attribute_orders():
    html1 = '<link rel="canonical" href="https://www.amazon.in/dp/B0FSMG7J6Q"/>'
    html2 = '<link href="https://www.amazon.in/Some-Desk/dp/B0FSMG7J6Q" rel="canonical" />'
    assert extract_canonical_url(html1) == "https://www.amazon.in/dp/B0FSMG7J6Q"
    assert extract_canonical_url(html2) == "https://www.amazon.in/Some-Desk/dp/B0FSMG7J6Q"


def test_classify_ok_requires_both_url_and_canonical():
    # OK when URL ASIN matches and canonical ASIN matches (extra query params allowed)
    ok_html = '<title>My Product : Amazon.in: Home</title><link rel="canonical" href="https://www.amazon.in/My-Product/dp/B0DS8PP26V">'
    res = classify_response("B0DS8PP26V", "https://www.amazon.in/dp/B0DS8PP26V", "https://www.amazon.in/dp/B0DS8PP26V?th=1", 200, ok_html)
    assert res.status == STATUS_OK
    assert res.final_asin == "B0DS8PP26V"
    assert res.title == "My Product"
    assert res.note == ""

    # REDIRECTED when URL ASIN matches but canonical points elsewhere
    redir_html = '<title>Study Desk : Amazon.in: Home & Kitchen</title><link rel="canonical" href="https://www.amazon.in/beAAtho-Desk/dp/B0FSMG7J6Q">'
    res2 = classify_response("B0FSN4SK8T", "https://www.amazon.in/dp/B0FSN4SK8T", "https://www.amazon.in/dp/B0FSN4SK8T", 200, redir_html)
    assert res2.status == STATUS_REDIRECTED
    assert res2.final_asin == "B0FSMG7J6Q"
    assert "B0FSMG7J6Q" in res2.note


@pytest.mark.asyncio
async def test_mock_normal_200_ok():
    transport = httpx.ASGITransport(app=mock_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        result = await check_asin(
            client=client,
            asin="B0DVZ845X5",
            domain="amazon.in",
            url_override="http://testserver/dp/B0DVZ845X5",
        )
        assert result.status == STATUS_OK
        assert result.asin == "B0DVZ845X5"
        assert result.final_asin == "B0DVZ845X5"
        assert result.http_status == 200
        assert "Boat Bassheads 100" in result.title
        assert result.note == ""


@pytest.mark.asyncio
async def test_mock_301_redirect_to_different_asin():
    transport = httpx.ASGITransport(app=mock_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        result = await check_asin(
            client=client,
            asin="B0F6ZG4YKF",
            domain="amazon.in",
            url_override="http://testserver/dp/B0F6ZG4YKF",
        )
        assert result.status == STATUS_REDIRECTED
        assert result.asin == "B0F6ZG4YKF"
        assert result.final_asin == "B0F715G4NF"
        assert "B0F715G4NF" in result.final_url


@pytest.mark.asyncio
async def test_checker_against_mock_server_canonical_mismatch(monkeypatch):
    """Runs LinkCheckerRunner against the local mock server and asserts REDIRECTED for canonical mismatch."""
    transport = httpx.ASGITransport(app=mock_app)
    orig_async_client = httpx.AsyncClient

    def patched_async_client(*args, **kwargs):
        kwargs["transport"] = transport
        kwargs["base_url"] = "http://testserver"
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("backend.checker.httpx.AsyncClient", patched_async_client)

    runner = LinkCheckerRunner(
        asins=["B0DVZ845X5", "B0FSN4SK8T", "B0DWXMXXPN"],
        domain="amazon.in",
        speed="careful",
        mock_base_url="http://testserver",
        delay_override=(0.0, 0.0),
    )
    results = await runner.run()
    by_asin = {r.asin: r for r in results}

    assert len(results) == 3
    assert by_asin["B0DVZ845X5"].status == STATUS_OK
    assert by_asin["B0FSN4SK8T"].status == STATUS_REDIRECTED
    assert by_asin["B0FSN4SK8T"].final_asin == "B0FSMG7J6Q"
    assert by_asin["B0DWXMXXPN"].status == STATUS_REDIRECTED
    assert by_asin["B0DWXMXXPN"].final_asin == "B0FSMG7J6Q"


@pytest.mark.asyncio
async def test_mock_404_not_found():
    transport = httpx.ASGITransport(app=mock_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        result = await check_asin(
            client=client,
            asin="B0DX6ZYL49",
            domain="amazon.in",
            url_override="http://testserver/dp/B0DX6ZYL49",
        )
        assert result.status == STATUS_NOT_FOUND
        assert result.http_status == 404


@pytest.mark.asyncio
async def test_mock_503_captcha_blocked():
    transport = httpx.ASGITransport(app=mock_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        result = await check_asin(
            client=client,
            asin="B0DY1SKHYV",
            domain="amazon.in",
            max_retries=0,
            url_override="http://testserver/dp/B0DY1SKHYV",
        )
        assert result.status == STATUS_BLOCKED
        assert result.http_status == 503


@pytest.mark.asyncio
async def test_mock_redirect_to_search_non_product():
    transport = httpx.ASGITransport(app=mock_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        result = await check_asin(
            client=client,
            asin="B0DYZRQ2SX",
            domain="amazon.in",
            url_override="http://testserver/dp/B0DYZRQ2SX",
        )
        assert result.status == STATUS_REDIRECTED
        assert result.final_asin == ""


@pytest.mark.asyncio
async def test_mock_500_error():
    transport = httpx.ASGITransport(app=mock_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        result = await check_asin(
            client=client,
            asin="B0F1YJ4KKS",
            domain="amazon.in",
            max_retries=0,
            url_override="http://testserver/dp/B0F1YJ4KKS",
        )
        assert result.status == STATUS_ERROR
        assert result.http_status == 500


def test_api_parse_endpoint():
    client = TestClient(app)
    resp = client.post("/api/parse", json={"raw_text": "B0F6ZG4YKF, B0DVZ845X5, invalid_one, B0F6ZG4YKF"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["unique_asins"] == ["B0F6ZG4YKF", "B0DVZ845X5"]
    assert data["total_found"] == 2
    assert data["duplicates_count"] == 1
    assert "invalid_one" in data["invalid_skipped"]


def test_sse_init_includes_precompleted_results_and_counts_match():
    """
    Regression test for the missing-row / count-mismatch bug:
    If results already finished before SSE connects, the init event must deliver them
    so the UI table rows and summary counters always match 1:1.
    """
    from backend.main import JobState
    from backend.checker import CheckResult

    job = JobState(
        job_id="job_test_sync",
        asins=["B0DS8PP26V", "B0FSN4SK8T"],
        domain="amazon.in",
        speed="careful",
        is_demo=False,
    )
    r1 = CheckResult(
        asin="B0DS8PP26V",
        start_url="https://www.amazon.in/dp/B0DS8PP26V",
        final_url="https://www.amazon.in/dp/B0DS8PP26V",
        final_asin="B0DS8PP26V",
        status=STATUS_OK,
        http_status=200,
        title="Bedside Safety Handle",
        note="",
    )
    r2 = CheckResult(
        asin="B0FSN4SK8T",
        start_url="https://www.amazon.in/dp/B0FSN4SK8T",
        final_url="https://www.amazon.in/dp/B0FSN4SK8T",
        final_asin="B0FSMG7J6Q",
        status=STATUS_REDIRECTED,
        http_status=200,
        title="Study Desk",
        note="Page canonical is a different product (B0FSMG7J6Q)",
    )
    job.results.extend([r1, r2])
    job.counts[STATUS_OK] = 1
    job.counts[STATUS_REDIRECTED] = 1
    job.status = "COMPLETED"
    JOBS[job.job_id] = job

    client = TestClient(app)
    with client.stream("GET", f"/api/jobs/{job.job_id}/stream") as resp:
        assert resp.status_code == 200
        body = "".join(resp.iter_text())

    # Parse SSE init payload
    assert "event: init" in body
    init_line = [line for line in body.splitlines() if line.startswith("data:")][0]
    init_data = json.loads(init_line.removeprefix("data:").strip())

    existing = init_data["existing_results"]
    assert len(existing) == 2
    assert [x["asin"] for x in existing] == ["B0DS8PP26V", "B0FSN4SK8T"]
    assert sum(init_data["counts"].values()) == len(existing)
    del JOBS[job.job_id]


def test_api_check_and_cancel_endpoints(monkeypatch):
    # Prevent real network call during quick cancel test
    async def dummy_run(self):
        await self.on_result if False else None
        import asyncio
        await asyncio.sleep(5)
        return []

    monkeypatch.setattr("backend.main.LinkCheckerRunner.run", dummy_run)
    client = TestClient(app)
    resp = client.post("/api/check", json={"asins": ["B0DS8PP26V", "B0FSN4SK8T"], "speed": "careful"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["demo_mode"] is False
    job_id = data["job_id"]
    assert job_id in JOBS

    cancel_resp = client.post(f"/api/jobs/{job_id}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"
    assert JOBS[job_id].status == "CANCELLED"
