"""
工具函式 - 安全性相關 (JWT, 密碼雜湊)

Token 傳遞方式（優先順序）:
1. HttpOnly Cookie `access_token`（瀏覽器，防 XSS）
2. Authorization: Bearer header（API 客戶端 / 測試 / 向後相容）
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import bcrypt
from jose import JWTError, jwt
from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import TokenData

# HTTP Bearer 認證（auto_error=False：沒有 header 時不直接 401，再檢查 cookie）
security = HTTPBearer(auto_error=False)

# 固定的 dummy hash：登入時帳號不存在仍執行一次 bcrypt，
# 使回應時間與「帳號存在但密碼錯誤」一致，防止時序攻擊枚舉帳號
_DUMMY_HASH = bcrypt.hashpw(b"timing-attack-mitigation", bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """驗證密碼"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )


def verify_dummy_password() -> None:
    """執行一次 bcrypt 比對（結果丟棄），用於拉平登入失敗的回應時間"""
    bcrypt.checkpw(b"dummy-password", _DUMMY_HASH.encode("utf-8"))


def get_password_hash(password: str) -> str:
    """產生密碼雜湊"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """建立 JWT Token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[UUID]:
    """解碼 JWT，回傳 user_id；無效時回傳 None"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            return None
        return UUID(user_id)
    except (JWTError, ValueError):
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """取得目前登入的使用者（Cookie 或 Bearer header）"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無法驗證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 優先 Cookie，其次 Authorization header
    token = access_token or (credentials.credentials if credentials else None)
    if not token:
        raise credentials_exception

    user_id = decode_token(token)
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """取得目前登入且活躍的使用者"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="使用者帳號已停用")
    return current_user
