"""
Mock Amazon Server for Unit Testing and Demo Mode.
Reproduces real Amazon behaviors without external internet:
- 301 redirect to a different ASIN with ?th=1 (B0F6ZG4YKF -> B0F715G4NF?th=1)
- 200 normal product pages (B0DVZ845X5, B0DY7VMML6)
- 404 not found / dog page (B0DX6ZYL49)
- 503 captcha / bot-wall page (B0DY1SKHYV)
- 200 page whose canonical points to a different ASIN (B0DWXMXXPN -> canonical B0FSMG7J6Q)
- 302 redirect to non-product search page (B0DYZRQ2SX)
- 500 error / broken response (B0F1YJ4KKS)
"""

from __future__ import annotations

import asyncio
from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

mock_app = FastAPI(title="Fake Amazon Server", description="Simulates Amazon product & bot behaviors")

MOCK_PRODUCTS = {
    "B0DVZ845X5": {
        "title": "Boat Bassheads 100 in-Ear Wired Earphones with Super Extra Bass, in-line Mic, Hawk-Inspired Design - (Black)",
        "canonical": "https://www.amazon.in/dp/B0DVZ845X5",
    },
    "B0DY7VMML6": {
        "title": "Logitech MX Master 3S Wireless Performance Mouse, Quiet Clicks, 8K DPI Sensor, Bluetooth, USB-C - Graphite",
        "canonical": "https://www.amazon.in/dp/B0DY7VMML6",
    },
    "B0F715G4NF": {
        "title": "Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones with Auto NC Optimizer, 30hr Battery - Black",
        "canonical": "https://www.amazon.in/dp/B0F715G4NF",
    },
    "B0FSMG7J6Q": {
        "title": "beAAtho Fusion Work & Study Desk with Drawer & Cabinet, 17mm Engineered Wood (Walnut Finish)",
        "canonical": "https://www.amazon.in/dp/B0FSMG7J6Q",
    },
}


@mock_app.get("/dp/{asin}")
async def mock_dp(asin: str, request: Request):
    asin_clean = asin.upper().strip()
    root_path = request.scope.get("root_path", "")
    mount_base = f"{str(request.base_url).rstrip('/')}{root_path}"

    # 1. Known Redirect: B0F6ZG4YKF -> 301 to B0F715G4NF?th=1
    if asin_clean == "B0F6ZG4YKF":
        return RedirectResponse(
            url=f"{mount_base}/dp/B0F715G4NF?th=1",
            status_code=301,
            headers={"Location": f"{mount_base}/dp/B0F715G4NF?th=1"},
        )

    # 2. Redirect to non-product page: B0DYZRQ2SX -> 302 to search
    if asin_clean == "B0DYZRQ2SX":
        return RedirectResponse(
            url=f"{mount_base}/s?k=electronics",
            status_code=302,
        )

    # 3. Canonical Mismatch: B0DWXMXXPN / B0FSN4SK8T land on 200, but canonical tag points to B0FSMG7J6Q
    if asin_clean in ("B0DWXMXXPN", "B0FSN4SK8T"):
        target_canonical = f"{mount_base}/dp/B0FSMG7J6Q"
        html = f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>beAAtho Fusion Work & Study Desk (Variant Listing) : Amazon.in: Home & Kitchen</title>
    <link rel="canonical" href="{target_canonical}">
</head>
<body>
    <h1>beAAtho Fusion Work & Study Desk</h1>
    <div id="productDescription">This product variation has merged into the master canonical listing.</div>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=200)

    # 4. 404 Page Not Found: B0DX6ZYL49
    if asin_clean == "B0DX6ZYL49":
        html = """<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Page Not Found : Amazon.in</title>
</head>
<body>
    <img src="/images/dog.png" alt="Dogs of Amazon">
    <h2>Looking for something?</h2>
    <p>We're sorry. The Web address you entered is not a functioning page on our site.</p>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=404)

    # 5. 503 Bot-wall / Captcha: B0DY1SKHYV
    if asin_clean == "B0DY1SKHYV":
        html = """<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Robot Check : Amazon.in</title>
</head>
<body>
    <form method="get" action="/errors/validatecaptcha">
        <h4>Enter the characters you see below</h4>
        <p>Sorry, we just need to make sure you're not a robot. For best results, please make sure your browser is accepting cookies.</p>
        <img src="/captcha.jpg" alt="captcha">
        <input type="text" name="field-keywords">
        <button type="submit">Continue shopping</button>
    </form>
    <p>To discuss automated access to Amazon data please contact api-services-support@amazon.com.</p>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=503)

    # 6. Server / Network Error: B0F1YJ4KKS
    if asin_clean == "B0F1YJ4KKS":
        return Response(content="Internal Server Error: Gateway timeout", status_code=500)

    # 7. Normal product pages
    if asin_clean in MOCK_PRODUCTS:
        prod = MOCK_PRODUCTS[asin_clean]
        canonical = f"{mount_base}/dp/{asin_clean}"
        html = f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{prod['title']} : Amazon.in: Electronics</title>
    <link rel="canonical" href="{canonical}">
</head>
<body>
    <span id="productTitle">{prod['title']}</span>
    <span class="a-price-whole">1,499</span>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=200)

    # Unknown test ASIN -> 404 (never return fake OK placeholder products)
    return HTMLResponse(
        content="<!doctype html><html><head><title>Page Not Found : Amazon.in</title></head><body><h2>Looking for something?</h2></body></html>",
        status_code=404,
    )


@mock_app.get("/s")
async def mock_search(k: str = ""):
    html = f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Amazon.in : {k}</title>
</head>
<body>
    <h1>Amazon Search Results for {k}</h1>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


@mock_app.get("/health")
async def mock_health():
    return {"status": "ok", "service": "fake_amazon"}
