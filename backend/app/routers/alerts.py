"""
自訂預警路由

- GET    /api/alerts          列出使用者的預警規則
- POST   /api/alerts          建立規則
- PUT    /api/alerts/{id}/toggle  啟用/停用
- DELETE /api/alerts/{id}     刪除
- POST   /api/alerts/scan     手動掃描（盤後排程亦自動執行）
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.alert_rule import AlertRule
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["預警"])

RULE_PATTERN = "^(price_above|price_below|breakout|volume_spike|ma_break_below|ma_break_above|foreign_streak)$"


class AlertRuleCreate(BaseModel):
    stock_code: str
    stock_name: Optional[str] = None
    rule_type: str = Field(..., pattern=RULE_PATTERN)
    params: dict = {}


def _serialize(r: AlertRule) -> dict:
    return {
        "id": str(r.id),
        "stock_code": r.stock_code,
        "stock_name": r.stock_name,
        "rule_type": r.rule_type,
        "params": r.params or {},
        "enabled": r.enabled,
        "last_triggered_at": r.last_triggered_at.isoformat() if r.last_triggered_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/")
async def list_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(AlertRule).where(AlertRule.user_id == current_user.id).order_by(desc(AlertRule.created_at))
    )).scalars().all()
    return {"rules": [_serialize(r) for r in rows]}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_rule(
    data: AlertRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = AlertRule(
        user_id=current_user.id,
        stock_code=data.stock_code.strip(),
        stock_name=(data.stock_name or "").strip() or None,
        rule_type=data.rule_type,
        params=data.params or {},
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.put("/{rule_id}/toggle")
async def toggle_rule(
    rule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == current_user.id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="找不到該預警規則")
    rule.enabled = not rule.enabled
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == current_user.id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="找不到該預警規則")
    await db.delete(rule)
    await db.commit()


@router.post("/scan")
async def trigger_scan(
    current_user: User = Depends(get_current_user),
):
    """手動觸發預警掃描（盤後排程亦自動執行）。"""
    from worker.alert_worker import scan_alerts
    return await scan_alerts()
