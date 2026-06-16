"""
速率限制 - slowapi
獨立模組避免 routers 與 main.py 循環 import
"""
from fastapi import Request
from slowapi import Limiter


def _get_real_ip(request: Request) -> str:
    # Cloudflare Tunnel 後面真正的用戶 IP 在 CF-Connecting-IP
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_real_ip)
