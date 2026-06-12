"""
速率限制 - slowapi
獨立模組避免 routers 與 main.py 循環 import
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
