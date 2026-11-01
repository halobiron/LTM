"""Smoke tests chạy trên hệ thống đang hoạt động (BE :8001, AI API :8000).

Chạy:  python tests/test_smoke.py   (hoặc: pytest tests/test_smoke.py)
Biến môi trường: BE_URL, API_URL (mặc định localhost).
Yêu cầu: pip install httpx
"""
import os
import sys

import httpx

BE = os.getenv("BE_URL", "http://localhost:8001")
API = os.getenv("API_URL", "http://localhost:8000")


def test_be_health():
    assert httpx.get(f"{BE}/health", timeout=10).json() == {"status": "ok"}


def test_ai_api_health():
    assert httpx.get(f"{API}/health", timeout=10).status_code == 200


def test_register_rejects_short_password():
    r = httpx.post(f"{BE}/auth/register", timeout=10, json={
        "email": "smoke@example.com", "display_name": "Smoke",
        "gender": "male", "password": "123"})
    assert r.status_code == 422


def test_register_rejects_invalid_gender():
    r = httpx.post(f"{BE}/auth/register", timeout=10, json={
        "email": "smoke@example.com", "display_name": "Smoke",
        "gender": "other", "password": "password123"})
    assert r.status_code == 422


def test_login_wrong_credentials():
    r = httpx.post(f"{BE}/auth/login", timeout=10, json={
        "email": "khong-ton-tai@example.com", "password": "sai-mat-khau"})
    assert r.status_code == 401


def test_create_meeting_requires_auth():
    r = httpx.post(f"{BE}/meetings", timeout=10, json={})
    assert r.status_code in (401, 403)


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e!r}")
    sys.exit(1 if failed else 0)
