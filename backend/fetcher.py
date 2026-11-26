"""
LinkSure Pluggable Fetch Layer
Defaults to direct httpx requests. Optionally falls back to a free-tier scraping API
ONLY when direct requests are blocked (captcha / HTTP 503 / HTTP 429).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Optional
from urllib.parse import urlencode

import httpx


@dataclass
class FetchResponse:
    final_url: str
    status_code: Optional[int]
    body: str
    error: Optional[str] = None
    provider: str = "direct"


class PluggableFetcher:
    """
    Handles HTTP fetching with pluggable fallback scraping API support.
    Direct httpx is always tried first.
    """

    def __init__(
        self,
        fallback_provider: Optional[str] = None,
        provider_api_key: Optional[str] = None,
    ):
        self.fallback_provider = (
            fallback_provider
            if fallback_provider is not None
            else os.environ.get("FETCH_FALLBACK_PROVIDER", "").strip().lower()
        )
        self.provider_api_key = (
            provider_api_key
            if provider_api_key is not None
            else os.environ.get("PROVIDER_API_KEY", "").strip()
        )

    @property
    def is_fallback_configured(self) -> bool:
        return bool(self.fallback_provider and self.provider_api_key)

    async def fetch_direct(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: Dict[str, str],
        timeout: float = 20.0,
    ) -> FetchResponse:
        """Direct HTTP GET via httpx with redirect following."""
        try:
            response = await client.get(
                url,
                headers=headers,
                timeout=timeout,
                follow_redirects=True,
            )
            return FetchResponse(
                final_url=str(response.url),
                status_code=response.status_code,
                body=response.text or "",
                provider="direct",
            )
        except httpx.TimeoutException:
            return FetchResponse(
                final_url="",
                status_code=None,
                body="",
                error=f"Request timed out after {int(timeout)}s",
                provider="direct",
            )
        except (httpx.ConnectError, httpx.RequestError) as exc:
            return FetchResponse(
                final_url="",
                status_code=None,
                body="",
                error=type(exc).__name__,
                provider="direct",
            )

    def _build_fallback_request(self, target_url: str) -> tuple[str, Dict[str, str]]:
        """Builds provider URL and optional headers for supported free-tier scraping APIs."""
        p = self.fallback_provider
        key = self.provider_api_key

        if p == "scraperapi":
            qs = urlencode({"api_key": key, "url": target_url, "follow_redirect": "true"})
            return f"https://api.scraperapi.com/?{qs}", {}

        if p == "scrapingant":
            qs = urlencode({"x-api-key": key, "url": target_url, "browser": "false"})
            return f"https://api.scrapingant.com/v2/general?{qs}", {}

        if p == "zenrows":
            qs = urlencode({"apikey": key, "url": target_url})
            return f"https://api.zenrows.com/v1/?{qs}", {}

        if p == "scrapingbee":
            qs = urlencode({"api_key": key, "url": target_url, "render_js": "false"})
            return f"https://app.scrapingbee.com/api/v1/?{qs}", {}

        if "{url}" in p:
            from urllib.parse import quote
            formatted = p.replace("{url}", quote(target_url, safe="")).replace("{api_key}", key)
            return formatted, {}

        raise ValueError(f"Unsupported FETCH_FALLBACK_PROVIDER: {p}")

    async def fetch_fallback(
        self,
        client: httpx.AsyncClient,
        target_url: str,
        timeout: float = 35.0,
    ) -> FetchResponse:
        """
        Invokes the configured fallback scraping provider.
        Only called after direct fetch resulted in BLOCKED.
        """
        if not self.is_fallback_configured:
            return FetchResponse(
                final_url=target_url,
                status_code=None,
                body="",
                error="Fallback provider not configured",
                provider="none",
            )

        try:
            proxy_url, extra_headers = self._build_fallback_request(target_url)
            response = await client.get(
                proxy_url,
                headers=extra_headers,
                timeout=timeout,
                follow_redirects=True,
            )

            # Check common resolved-URL headers returned by scraping proxies
            resolved_url = (
                response.headers.get("sa-final-url")
                or response.headers.get("spb-resolved-url")
                or response.headers.get("ant-final-url")
                or response.headers.get("x-final-url")
                or target_url
            )

            return FetchResponse(
                final_url=resolved_url,
                status_code=response.status_code,
                body=response.text or "",
                provider=self.fallback_provider,
            )
        except httpx.TimeoutException:
            return FetchResponse(
                final_url="",
                status_code=None,
                body="",
                error=f"Fallback provider timed out after {int(timeout)}s",
                provider=self.fallback_provider,
            )
        except (httpx.ConnectError, httpx.RequestError, ValueError) as exc:
            return FetchResponse(
                final_url="",
                status_code=None,
                body="",
                error=f"{type(exc).__name__}: {exc}",
                provider=self.fallback_provider,
            )
