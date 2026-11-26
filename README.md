# LinkSure — Amazon ASIN Integrity & Redirect Verifier

LinkSure is a fast, polite, and trustworthy web utility that verifies Amazon product links (`https://www.amazon.<domain>/dp/<ASIN>`) in bulk.

It detects **silent variant redirects**, **HTML canonical mismatches**, **404 dog pages**, and **bot-wall throttle challenges** before you share affiliate or product links.

---

## The Problem This Solves

When you share an Amazon link like `https://www.amazon.in/dp/B0F6ZG4YKF`, Amazon frequently redirects shoppers to a different ASIN (often a variant or seller re-listing, e.g., `B0F715G4NF?th=1`) or silently consolidates child variations under an active canonical tag. Checking dozens or hundreds of ASINs manually is tedious and error-prone.

LinkSure automates this with realistic browser headers, gentle rate-limiting, live Server-Sent Events (SSE) streaming, and clear diff visualization (`B0F6ZG4YKF → B0F715G4NF`).

---

## 3-Step Setup

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### 1. Install Python dependencies
```bash
python -m pip install fastapi uvicorn httpx pytest pytest-asyncio
```

### 2. Install Frontend dependencies
```bash
cd frontend
npm install
cd ..
```

### 3. Run LinkSure
```bash
npm run dev
# OR: python dev.py
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.
The backend runs at **[http://127.0.0.1:8000](http://127.0.0.1:8000)**.

---

## How to Demo (No Internet / Local Mock Server)

DEMO_MODE is **OFF by default** so LinkSure always checks real Amazon URLs. For offline testing or demoing without internet, LinkSure includes a **test-only mock Amazon server** (`backend/mock_server.py`) that can be enabled strictly via an explicit environment variable:

```bash
DEMO_MODE=1 python dev.py
# On Windows PowerShell:
$env:DEMO_MODE="1"; python dev.py
```

When `DEMO_MODE=1` is active, the UI displays a prominent **"DEMO MODE - results are fake"** banner so mock responses can never be mistaken for live Amazon data.

The sample IDs demonstrate every status LinkSure handles:
| ASIN | Scenario | Expected Status | Notes |
| :--- | :--- | :--- | :--- |
| `B0DVZ845X5` | Normal product listing | `OK` | Boat Bassheads 100 Earphones |
| `B0F6ZG4YKF` | HTTP 301 redirect to variant | `REDIRECTED` | Landed on `B0F715G4NF?th=1` |
| `B0DWXMXXPN` | HTML `<link rel="canonical">` mismatch | `REDIRECTED` | Canonical points to `B0FSMG7J6Q` |
| `B0DX6ZYL49` | 404 Dog page | `NOT_FOUND` | Listing does not exist |
| `B0DY1SKHYV` | 503 Captcha / Robot challenge | `BLOCKED` | Bot-wall detected (could not verify) |
| `B0DY7VMML6` | Normal product listing | `OK` | Logitech MX Master 3S Mouse |
| `B0DYZRQ2SX` | 302 redirect to search results | `REDIRECTED` | Did not land on a product page |
| `B0F1YJ4KKS` | Server 500 / Network timeout | `ERROR` | Connection or server error |

---

## Architecture

- **`backend/checker.py`**: Standalone link checking and classification module with polite concurrency controls, regex parsing, canonical extraction, and backoff retries. Fully unit-testable.
- **`backend/mock_server.py`**: Local mock Amazon service simulating redirects, canonical tags, 404s, and 503 bot walls.
- **`backend/main.py`**: FastAPI application exposing `POST /api/parse`, `POST /api/check`, `GET /api/jobs/{id}/stream` (SSE), `POST /api/jobs/{id}/cancel`, and `GET /api/jobs/{id}/export.csv`.
- **`frontend/`**: Vite + React + TypeScript with plain CSS variables, dark/light theme, keyboard accessibility, responsive table layout, and `localStorage` run history (retains last 10 runs).
- **`tests/test_checker.py`**: Pytest test suite testing checker and API endpoints against the mock server.

---

## Running Automated Tests

Run the test suite with pytest:
```bash
python -m pytest tests -v
```

All 11 unit and integration tests run offline without network access.

---

## Rate-Limiting & Honesty Rules

- **Honesty First**: LinkSure never fakes verification. If Amazon blocks a request with a captcha or 503/429 rate limit, the status is marked **`BLOCKED`**, never guessed as `OK`. `BLOCKED` means *"could not verify at this time"*, keeping it distinct from real broken links (`NOT_FOUND` / `ERROR`).
- **Polite Crawling**: Amazon actively monitors automated traffic. LinkSure provides three speed presets:
  - **Careful (Default)**: Concurrency of 3, 1.5–3.0s randomized delay between calls, 2 retries with backoff.
  - **Normal**: Concurrency of 3, 0.8–1.5s delay.
  - **Fast**: Concurrency of 5, 0.2–0.6s delay.
- **Gentle Pace Advice**: When checking hundreds of live ASINs on real Amazon, keep speed on **Careful** and avoid rapid consecutive runs to prevent temporary IP challenges.
