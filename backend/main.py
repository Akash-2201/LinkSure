"""
LinkSure FastAPI Application
Provides REST and SSE endpoints for parsing ASINs, running check jobs,
streaming live progress, cancelling jobs, exporting CSVs, and enforcing free-tier quotas.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from backend.checker import (
    ALL_STATUSES,
    CheckResult,
    LinkCheckerRunner,
    parse_input,
)
from backend.fetcher import PluggableFetcher
from backend.quota import (
    DAILY_FALLBACK_CAP,
    IP_HOURLY_LIMIT,
    MAX_ASINS_PER_REQUEST,
    QuotaCacheStore,
)

# DEMO_MODE is strictly OFF by default; only enabled by explicit env var DEMO_MODE=1
GLOBAL_DEMO_MODE = os.environ.get("DEMO_MODE", "0") in ("1", "true", "True")


def get_allowed_origins() -> List[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if raw:
        return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]


app = FastAPI(
    title="LinkSure API",
    description="Bulk Amazon ASIN redirect & integrity checker API",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# Only mount the mock Amazon server if DEMO_MODE is explicitly enabled via env var
if GLOBAL_DEMO_MODE:
    from backend.mock_server import mock_app
    app.mount("/mock", mock_app)

# Shared quota/cache store and fetcher
QUOTA_STORE = QuotaCacheStore()
FETCHER = PluggableFetcher()


class ParseRequest(BaseModel):
    raw_text: str = ""


class CheckRequest(BaseModel):
    asins: List[str] = Field(default_factory=list)
    domain: str = "amazon.in"
    speed: str = "careful"
    force_recheck: bool = False


class JobState:
    def __init__(
        self,
        job_id: str,
        asins: List[str],
        domain: str,
        speed: str,
        is_demo: bool,
        force_recheck: bool = False,
    ):
        self.job_id = job_id
        self.asins = asins
        self.domain = domain
        self.speed = speed
        self.is_demo = is_demo
        self.force_recheck = force_recheck
        self.status = "RUNNING"
        self.results: List[CheckResult] = []
        self.counts: Dict[str, int] = {st: 0 for st in ALL_STATUSES}
        self.created_at = time.time()
        self.completed_at: Optional[float] = None
        self.runner: Optional[LinkCheckerRunner] = None
        self.subscribers: List[asyncio.Queue] = []
        self.lock = asyncio.Lock()

    async def add_result(self, res: CheckResult, progress: Dict[str, Any]):
        async with self.lock:
            self.results.append(res)
            self.counts[res.status] = self.counts.get(res.status, 0) + 1
            payload = {
                "type": "result",
                "result": res.to_dict(),
                "progress": {
                    "completed": len(self.results),
                    "total": len(self.asins),
                    "counts": dict(self.counts),
                },
            }
            for q in list(self.subscribers):
                try:
                    q.put_nowait(payload)
                except Exception:
                    pass


JOBS: Dict[str, JobState] = {}


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@app.get("/api/health")
async def health_check():
    fb_used, fb_cap = QUOTA_STORE.get_fallback_usage()
    return {
        "status": "ok",
        "service": "LinkSure Backend",
        "demo_mode": GLOBAL_DEMO_MODE,
        "fallback_configured": FETCHER.is_fallback_configured,
        "fallback_provider": FETCHER.fallback_provider if FETCHER.is_fallback_configured else None,
        "daily_fallback_used": fb_used,
        "daily_fallback_cap": fb_cap,
        "cache_entries": QUOTA_STORE.cache_count(),
        "ip_hourly_limit": IP_HOURLY_LIMIT,
        "max_asins_per_request": MAX_ASINS_PER_REQUEST,
        "active_jobs": len([j for j in JOBS.values() if j.status == "RUNNING"]),
    }


@app.post("/api/parse")
async def parse_endpoint(req: ParseRequest):
    """Parses messy user input and returns summary of unique ASINs, duplicates, and invalid tokens."""
    summary = parse_input(req.raw_text)
    return summary.to_dict()


async def _run_job_task(job: JobState, base_server_url: str):
    mock_base_url = None
    if GLOBAL_DEMO_MODE:
        mock_base_url = f"{base_server_url.rstrip('/')}/mock"

    async def on_result_callback(res: CheckResult, progress: Dict[str, Any]):
        await job.add_result(res, progress)

    runner = LinkCheckerRunner(
        asins=job.asins,
        domain=job.domain,
        speed=job.speed,
        mock_base_url=mock_base_url,
        fetcher=FETCHER,
        quota_store=QUOTA_STORE if not GLOBAL_DEMO_MODE else None,
        force_recheck=job.force_recheck,
        on_result=on_result_callback,
    )
    job.runner = runner

    try:
        await runner.run()
        async with job.lock:
            job.status = "CANCELLED" if runner.cancelled else "COMPLETED"
            job.completed_at = time.time()
            done_payload = {
                "type": "done",
                "job_id": job.job_id,
                "status": job.status,
                "counts": dict(job.counts),
                "total": len(job.asins),
                "duration_s": round(job.completed_at - job.created_at, 2),
            }
            for q in list(job.subscribers):
                try:
                    q.put_nowait(done_payload)
                except Exception:
                    pass
    except Exception:
        async with job.lock:
            job.status = "FAILED"
            job.completed_at = time.time()
            done_payload = {
                "type": "done",
                "job_id": job.job_id,
                "status": "FAILED",
                "counts": dict(job.counts),
                "total": len(job.asins),
                "duration_s": round(job.completed_at - job.created_at, 2),
            }
            for q in list(job.subscribers):
                try:
                    q.put_nowait(done_payload)
                except Exception:
                    pass


@app.post("/api/check")
async def start_check_job(req: CheckRequest, request: Request, background_tasks: BackgroundTasks):
    """Starts a real link checking job in the background with per-request and per-IP quota enforcement."""
    # Deduplicate preserving order
    unique_asins: List[str] = []
    seen: set[str] = set()
    for a in req.asins:
        clean = a.strip().upper()
        if clean and clean not in seen:
            seen.add(clean)
            unique_asins.append(clean)

    if not unique_asins:
        raise HTTPException(status_code=400, detail="No ASINs provided to check")

    if len(unique_asins) > MAX_ASINS_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_ASINS_PER_REQUEST} ASINs allowed per request (received {len(unique_asins)}).",
        )

    # Count how many ASINs will actually require live checks (cache misses or force_recheck)
    if req.force_recheck or GLOBAL_DEMO_MODE:
        billable_count = len(unique_asins)
    else:
        billable_count = sum(
            1 for asin in unique_asins if QUOTA_STORE.get_cached(asin, req.domain) is None
        )

    client_ip = get_client_ip(request)
    allowed, remaining, retry_after = QUOTA_STORE.check_and_consume_ip_quota(
        ip=client_ip,
        requested_count=billable_count,
        limit=IP_HOURLY_LIMIT,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Hourly rate limit reached ({IP_HOURLY_LIMIT} uncached IDs/hour per IP; "
                f"{remaining} remaining). Please retry in {max(1, retry_after // 60)} minute(s)."
            ),
            headers={"Retry-After": str(retry_after)},
        )

    job_id = f"job_{int(time.time())}_{uuid.uuid4().hex[:6]}"

    job = JobState(
        job_id=job_id,
        asins=unique_asins,
        domain=req.domain,
        speed=req.speed,
        is_demo=GLOBAL_DEMO_MODE,
        force_recheck=req.force_recheck,
    )
    JOBS[job_id] = job

    base_server_url = str(request.base_url).rstrip("/")
    background_tasks.add_task(_run_job_task, job, base_server_url)

    return {
        "job_id": job_id,
        "asins_count": len(unique_asins),
        "cached_hits": len(unique_asins) - billable_count,
        "ip_quota_remaining": remaining,
        "domain": req.domain,
        "speed": req.speed,
        "demo_mode": GLOBAL_DEMO_MODE,
    }


@app.get("/api/jobs/{job_id}/stream")
async def job_stream(job_id: str):
    """Server-Sent Events endpoint streaming live job progress and result rows."""
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job = JOBS[job_id]
    q: asyncio.Queue = asyncio.Queue()

    async def event_generator():
        try:
            async with job.lock:
                init_data = {
                    "type": "init",
                    "job_id": job.job_id,
                    "status": job.status,
                    "total": len(job.asins),
                    "domain": job.domain,
                    "speed": job.speed,
                    "is_demo": job.is_demo,
                    "existing_results": [r.to_dict() for r in job.results],
                    "counts": dict(job.counts),
                }
                already_finished = job.status in ("COMPLETED", "CANCELLED", "FAILED")
                if not already_finished:
                    job.subscribers.append(q)
                else:
                    done_data = {
                        "type": "done",
                        "job_id": job.job_id,
                        "status": job.status,
                        "counts": dict(job.counts),
                        "total": len(job.asins),
                        "duration_s": round((job.completed_at or time.time()) - job.created_at, 2),
                    }

            yield f"event: init\ndata: {json.dumps(init_data)}\n\n"

            if already_finished:
                yield f"event: done\ndata: {json.dumps(done_data)}\n\n"
                return

            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=12.0)
                    event_type = msg.get("type", "message")
                    yield f"event: {event_type}\ndata: {json.dumps(msg)}\n\n"

                    if event_type == "done":
                        break
                except asyncio.TimeoutError:
                    yield ": ping\n\n"

        except asyncio.CancelledError:
            pass
        finally:
            async with job.lock:
                if q in job.subscribers:
                    job.subscribers.remove(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancels an in-progress job immediately."""
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job = JOBS[job_id]
    async with job.lock:
        if job.runner:
            job.runner.cancel()
        job.status = "CANCELLED"
        job.completed_at = time.time()

        done_payload = {
            "type": "done",
            "job_id": job.job_id,
            "status": "CANCELLED",
            "counts": dict(job.counts),
            "total": len(job.asins),
            "duration_s": round(job.completed_at - job.created_at, 2),
        }
        for q in list(job.subscribers):
            try:
                q.put_nowait(done_payload)
            except Exception:
                pass

    return {"status": "cancelled", "job_id": job_id}


@app.get("/api/jobs/{job_id}/export.csv")
async def export_job_csv(job_id: str):
    """Exports results as a downloadable CSV."""
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job = JOBS[job_id]
    output = io.StringIO()
    cols = ["asin", "status", "start_url", "final_url", "final_asin", "http", "title", "note", "cached", "fetch_provider"]
    writer = csv.DictWriter(output, fieldnames=cols)
    writer.writeheader()

    for r in job.results:
        writer.writerow({
            "asin": r.asin,
            "status": r.status,
            "start_url": r.start_url,
            "final_url": r.final_url,
            "final_asin": r.final_asin,
            "http": r.http_status or "",
            "title": r.title,
            "note": r.note,
            "cached": str(r.cached).lower(),
            "fetch_provider": r.fetch_provider,
        })

    filename = f"linksure_{job_id}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )
