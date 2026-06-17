"""
站內通知路由

- GET  /api/notifications      最近通知 + 未讀數
- POST /api/notifications/read 全部標記已讀
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.notification import Notification
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["通知"])


@router.get("/")
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .limit(50)
    )).scalars().all()
    return {
        "notifications": [
            {
                "id": str(r.id),
                "type": r.type,
                "message": r.message,
                "read": r.read,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "unread": sum(1 for r in rows if not r.read),
    }


@router.post("/read")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    await db.commit()
    return {"ok": True}
