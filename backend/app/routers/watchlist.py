"""
追蹤清單路由
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.watchlist import WatchlistItem
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/watchlist", tags=["追蹤清單"])


class WatchlistCreate(BaseModel):
    stock_code: str
    note: Optional[str] = None


class WatchlistResponse(BaseModel):
    id: UUID
    stock_code: str
    note: Optional[str]

    class Config:
        from_attributes = True


@router.get("/", response_model=List[WatchlistResponse])
async def get_watchlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """取得目前使用者的追蹤清單"""
    result = await db.execute(
        select(WatchlistItem)
        .where(WatchlistItem.user_id == current_user.id)
        .order_by(WatchlistItem.added_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=WatchlistResponse, status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    data: WatchlistCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """加入追蹤清單"""
    existing = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.user_id == current_user.id,
            WatchlistItem.stock_code == data.stock_code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{data.stock_code} 已在追蹤清單中",
        )

    item = WatchlistItem(
        user_id=current_user.id,
        stock_code=data.stock_code,
        note=data.note,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """移除追蹤清單項目"""
    result = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.id == item_id,
            WatchlistItem.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到該追蹤項目")

    await db.delete(item)
    await db.commit()
