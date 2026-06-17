"""
回測（Backtest）路由

- POST /api/backtest/run       執行技術面策略回測並保存
- GET  /api/backtest/runs      列出近期回測
- GET  /api/backtest/runs/{id} 取得單次回測完整結果（含權益曲線）
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.backtest_run import BacktestRun
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/backtest", tags=["回測"])


class BacktestParams(BaseModel):
    start: str = Field(..., description="起始日 YYYY-MM-DD")
    end: str = Field(..., description="結束日 YYYY-MM-DD")
    stock_codes: Optional[List[str]] = Field(None, description="標的池（留空=預設大型股池，上限 50 檔）")
    initial_capital: float = Field(1_000_000, gt=0)
    risk_per_trade_pct: float = Field(2, gt=0, le=100)
    fee_discount: float = Field(1.0, gt=0, le=1)
    max_positions: int = Field(5, ge=1, le=50)
    max_position_pct: float = Field(20, gt=0, le=100)
    atr_pct_min: float = Field(2.5, ge=0)
    atr_pct_max: float = Field(9, ge=0)
    rsi_min: float = Field(35, ge=0, le=100)
    rsi_max: float = Field(75, ge=0, le=100)
    breakout_lookback: int = Field(20, ge=2, le=250)
    sl_atr_mult: float = Field(1.5, gt=0)
    target_pct: float = Field(5, gt=0)
    label: Optional[str] = None


@router.post("/run")
async def run_backtest_endpoint(
    params: BacktestParams,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """執行技術面策略回測（point-in-time）並保存結果。"""
    from app.services.backtest import run_backtest

    result = await run_backtest(db, params.model_dump())
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    run = BacktestRun(
        user_id=current_user.id,
        label=params.label,
        params=params.model_dump(),
        metrics=result["metrics"],
        equity_curve=result["equity_curve"],
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return {
        "id": str(run.id),
        "label": run.label,
        "metrics": result["metrics"],
        "equity_curve": result["equity_curve"],
        "trades": result["trades"],
    }


@router.get("/runs")
async def list_runs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出近期回測（不含權益曲線，僅摘要）。"""
    rows = (await db.execute(
        select(BacktestRun)
        .where(BacktestRun.user_id == current_user.id)
        .order_by(desc(BacktestRun.created_at))
        .limit(50)
    )).scalars().all()
    return {
        "runs": [
            {
                "id": str(r.id),
                "label": r.label,
                "params": r.params,
                "metrics": r.metrics,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.get("/runs/{run_id}")
async def get_run(
    run_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """取得單次回測完整結果（含權益曲線）。"""
    run = (await db.execute(
        select(BacktestRun).where(
            BacktestRun.id == run_id,
            BacktestRun.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="找不到該回測紀錄")
    return {
        "id": str(run.id),
        "label": run.label,
        "params": run.params,
        "metrics": run.metrics,
        "equity_curve": run.equity_curve,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }
