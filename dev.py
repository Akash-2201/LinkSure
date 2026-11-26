#!/usr/bin/env python3
"""
Python dev runner that launches FastAPI backend and Vite frontend concurrently.
Usage:
    python dev.py
    python dev.py --demo
"""

import os
import subprocess
import sys
import time

def main():
    if "--demo" in sys.argv:
        os.environ["DEMO_MODE"] = "1"
        print("[LinkSure] Starting with DEMO_MODE=1 enabled (mock Amazon server active)")

    backend_cmd = [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
    npm_bin = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_cmd = [npm_bin, "run", "dev"]

    print("\nStarting LinkSure Backend on http://127.0.0.1:8000 ...")
    backend_proc = subprocess.Popen(backend_cmd)

    time.sleep(1)

    print("Starting LinkSure Frontend on http://127.0.0.1:5173 ...\n")
    frontend_proc = subprocess.Popen(frontend_cmd, cwd="frontend")

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nStopping LinkSure services...")
        backend_proc.terminate()
        frontend_proc.terminate()

if __name__ == "__main__":
    main()
