"""
認證路由 - 使用者註冊/登入/登出

安全設計:
- 登入失敗時無論帳號是否存在都執行一次 bcrypt（防時序攻擊枚舉帳號）
- Token 透過 HttpOnly Cookie 下發（防 XSS），同時回傳 JSON 供 API 客戶端使用
- /login 與 /register 有 IP 速率限制（防暴力破解）
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token
from app.utils.security import (
    verify_password,
    verify_dummy_password,
    get_password_hash,
    create_access_token,
    get_current_user,
)
from app.utils.ratelimit import limiter
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["認證"])

COOKIE_NAME = "access_token"


def _set_auth_cookie(response: Response, token: str) -> None:
    """設定 HttpOnly 認證 Cookie"""
    is_https = settings.COOKIE_DOMAIN != ""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_https,
        samesite="none" if is_https else "lax",
        domain=settings.COOKIE_DOMAIN if settings.COOKIE_DOMAIN else None,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def register(request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """
    使用者註冊

    - **username**: 使用者名稱 (唯一)
    - **email**: 電子郵件 (唯一)
    - **password**: 密碼 (至少 8 個字元)
    - **display_name**: 顯示名稱 (選填)
    """
    if len(user_data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密碼至少需要 8 個字元"
        )

    # 檢查使用者名稱是否已存在
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="使用者名稱已被使用"
        )

    # 檢查 Email 是否已存在
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="電子郵件已被註冊"
        )

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        display_name=user_data.display_name,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return new_user


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """
    使用者登入

    成功後設定 HttpOnly Cookie（瀏覽器自動帶上），
    同時回傳 access_token 供 API 客戶端使用。
    """
    result = await db.execute(select(User).where(User.username == login_data.username))
    user = result.scalar_one_or_none()

    if not user:
        # 帳號不存在仍執行一次 bcrypt，拉平回應時間（防時序攻擊）
        verify_dummy_password()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="使用者名稱或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="使用者名稱或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="使用者帳號已停用"
        )

    access_token_expires = timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )

    _set_auth_cookie(response, access_token)
    return Token(access_token=access_token)


@router.post("/logout")
async def logout(response: Response):
    """登出 — 清除認證 Cookie"""
    is_https = settings.COOKIE_DOMAIN != ""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        domain=settings.COOKIE_DOMAIN if settings.COOKIE_DOMAIN else None,
        secure=is_https,
        samesite="none" if is_https else "lax",
        httponly=True,
    )
    return {"message": "已登出"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """取得目前登入的使用者資料"""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    display_name: str = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新目前使用者的資料"""
    if display_name is not None:
        current_user.display_name = display_name

    await db.commit()
    await db.refresh(current_user)
    return current_user
