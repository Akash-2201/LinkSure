# Deploying LinkSure 100% Free (Cloudflare Pages + Render)

This guide deploys LinkSure publicly for **$0/month** with no dependency on your computer:
- **Frontend (Static + PWA)**: [Cloudflare Pages](https://pages.cloudflare.com/) (free unlimited bandwidth)
- **Backend (FastAPI Docker)**: [Render](https://render.com/) Free Web Service (auto-sleeps after 15 min idle, wakes in ~30s with a built-in cold-start banner in the UI)

---

## Step 1: Push Code to GitHub

1. Create a new GitHub repository (public or private).
2. Commit and push all files in this repository:
   ```bash
   git init
   git add .
   git commit -m "Initial LinkSure deployment"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

---

## Step 2: Deploy Backend on Render (Free Docker Plan)

1. Sign in to **[Render](https://dashboard.render.com/)** with GitHub.
2. Click **New +** $\rightarrow$ **Blueprint** (or **Web Service** $\rightarrow$ select your repo).
   - If using Blueprint, Render reads `render.yaml` automatically (`plan: free`, `runtime: docker`, `healthCheckPath: /api/health`).
   - If creating manually:
     - **Environment**: `Docker`
     - **Instance Type**: `Free`
     - **Health Check Path**: `/api/health`
3. Wait for the build to finish and copy your Render URL, e.g. `https://linksure-api.onrender.com`.
4. Verify `/api/health` in your browser:
   ```
   https://linksure-api.onrender.com/api/health
   ```
   You should see `{"status":"ok","service":"LinkSure Backend","demo_mode":false,...}`.

*(Keep `ALLOWED_ORIGINS` handy — you will update it right after Step 3 with your Cloudflare Pages URL.)*

---

## Step 3: Deploy Frontend on Cloudflare Pages (Free Plan)

1. Sign in to **[Cloudflare Dashboard](https://dash.cloudflare.com/)** $\rightarrow$ **Workers & Pages** $\rightarrow$ **Create** $\rightarrow$ **Pages** $\rightarrow$ **Connect to Git**.
2. Select your repository and configure the build:
   - **Production branch**: `main`
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Add **Environment Variable** (under Build & Deployments):
   - `VITE_API_BASE_URL` = `https://linksure-api.onrender.com` *(your Render URL from Step 2, without a trailing slash)*
4. Click **Save and Deploy**.
5. Copy your deployed Cloudflare Pages URL, e.g. `https://linksure.pages.dev`.

---

## Step 4: Lock Down CORS on Render

1. Go back to your Render service $\rightarrow$ **Environment**.
2. Set `ALLOWED_ORIGINS` to your exact Cloudflare Pages URL:
   ```
   https://linksure.pages.dev
   ```
   *(If using a custom domain too, separate with commas: `https://linksure.pages.dev,https://linksure.yourdomain.com`)*
3. Save changes (Render restarts automatically).

---

## Environment Variable Reference

### Backend (Render)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DEMO_MODE` | `0` | Must stay `0` in production. Only `1` serves test mock data. |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated origins allowed by CORS. Set to your Cloudflare Pages URL. |
| `CACHE_TTL_HOURS` | `24` | Hours to cache definitive results (`OK`, `REDIRECTED`, `NOT_FOUND`) per ASIN + domain. |
| `IP_HOURLY_LIMIT` | `50` | Maximum uncached ASIN checks allowed per client IP per hour. |
| `MAX_ASINS_PER_REQUEST` | `100` | Maximum ASINs accepted in a single `POST /api/check` request. |
| `DAILY_FALLBACK_CAP` | `100` | Global daily limit on fallback scraping API calls across all users. |
| `FETCH_FALLBACK_PROVIDER` | *(empty)* | Optional fallback used **only** when direct `httpx` gets `BLOCKED`: `scraperapi`, `scrapingant`, `zenrows`, or `scrapingbee`. |
| `PROVIDER_API_KEY` | *(empty)* | API key for the optional fallback provider (free tiers available on those services). |
| `CACHE_DB_PATH` | `/tmp/linksure_quota.db` | SQLite path for 24h cache, IP rate limits, and daily fallback counters. |

### Frontend (Cloudflare Pages)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | *(empty — uses `/api` proxy)* | Full URL of your Render backend (e.g. `https://linksure-api.onrender.com`). |

---

## Step 5: Verify Your Live Deployment

Open your Cloudflare Pages URL (on desktop or mobile, or install it as a PWA):
1. If Render was asleep, the UI shows **"Waking up the server (~30s)"** and automatically activates once `/api/health` responds.
2. Paste these 8 ASINs and click **Check 8 Links** (keep **Careful** speed):
   ```
   B0DS8PP26V B0DSG16349 B0DSLB1778 B0FSN4SK8T B0DTHPWFWK B0DTV21KQQ B0FFGZK7ZG B0H26YWBMX
   ```
3. **Expected result**: **5 OK** and **3 REDIRECTED** (`B0FSN4SK8T` $\rightarrow$ `B0FSMG7J6Q`, `B0FFGZK7ZG` $\rightarrow$ `B0FFGZ1FXY`, `B0H26YWBMX` $\rightarrow$ `B0GS3H6CQY`).
   - *Note on cloud IPs*: Datacenter IPs (like Render) are throttled more aggressively by Amazon than residential IPs. If Amazon returns captchas/503s from Render's IP, LinkSure honestly reports `BLOCKED` (never guesses `OK`), shows the **Blocked rate** indicator, and lets you configure an optional free-tier `FETCH_FALLBACK_PROVIDER` or click **Re-check blocked only**.
4. Run the same 8 IDs a second time within 24 hours and verify they return instantly with the **`cached`** badge; click **Force re-check** on any row or run to bypass the cache.
