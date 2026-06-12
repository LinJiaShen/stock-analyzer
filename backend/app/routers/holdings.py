"""
持股管理路由
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db
from app.models.user import User
from app.models.holding import Holding
from app.schemas.holding import HoldingCreate, HoldingUpdate, HoldingResponse
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/holdings", tags=["持股管理"])


@router.get("/", response_model=List[HoldingResponse])
async def get_holdings(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得目前使用者的持股清單"""
    result = await db.execute(
        select(Holding)
        .where(Holding.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    holdings = result.scalars().all()
    return holdings


@router.post("/", response_model=HoldingResponse, status_code=status.HTTP_201_CREATED)
async def create_holding(
    holding_data: HoldingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    新增持股
    
    - **stock_code**: 股票代碼
    - **stock_name**: 股票名稱
    - **quantity**: 持股數量
    - **avg_cost**: 平均成本 (選填)
    - **purchase_date**: 購買日期 (選填)
    - **notes**: 備註 (選填)
    """
    # 檢查是否已存在相同股票
    result = await db.execute(
        select(Holding).where(
            Holding.user_id == current_user.id,
            Holding.stock_code == holding_data.stock_code
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"已持有 {holding_data.stock_code} {holding_data.stock_name}"
        )
    
    new_holding = Holding(
        user_id=current_user.id,
        **holding_data.model_dump()
    )
    
    db.add(new_holding)
    await db.commit()
    await db.refresh(new_holding)
    return new_holding


@router.put("/{holding_id}", response_model=HoldingResponse)
async def update_holding(
    holding_id: UUID,
    holding_data: HoldingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新持股資料"""
    result = await db.execute(
        select(Holding).where(
            Holding.id == holding_id,
            Holding.user_id == current_user.id
        )
    )
    holding = result.scalar_one_or_none()
    
    if not holding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到該持股記錄"
        )
    
    update_data = holding_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(holding, key, value)
    
    await db.commit()
    await db.refresh(holding)
    return holding


@router.delete("/{holding_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holding(
    holding_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """刪除持股記錄"""
    result = await db.execute(
        select(Holding).where(
            Holding.id == holding_id,
            Holding.user_id == current_user.id
        )
    )
    holding = result.scalar_one_or_none()
    
    if not holding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到該持股記錄"
        )
    
    await db.execute(
        delete(Holding).where(Holding.id == holding_id)
    )
    await db.commit()


@router.get("/{holding_id}/diagnosis")
async def get_holding_diagnosis(
    holding_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    取得持股健診報告

    整合多因子評分、決策訊號與持有損益，產生健診摘要
    """
    result = await db.execute(
        select(Holding).where(
            Holding.id == holding_id,
            Holding.user_id == current_user.id
        )
    )
    holding = result.scalar_one_or_none()

    if not holding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到該持股記錄"
        )

    from app.services.scoring import ScoringService

    service = ScoringService(db)
    try:
        score_data = await service.calculate_composite_score(holding.stock_code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"評分計算失敗: {e}")

    # 決策訊號（含操作建議）
    signal = None
    try:
        signals = await service.generate_signals(holding.stock_code, "all")
        signal = signals[0] if signals else None
    except Exception:
        pass

    # 持有損益
    current_price = score_data.get("current_price")
    avg_cost = float(holding.avg_cost) if holding.avg_cost else None
    pnl = None
    if current_price and avg_cost and holding.quantity:
        qty = float(holding.quantity)
        pnl = {
            "avg_cost": avg_cost,
            "current_price": current_price,
            "unrealized_pnl": round((current_price - avg_cost) * qty, 0),
            "unrealized_pnl_pct": round((current_price - avg_cost) / avg_cost * 100, 2),
        }

    # Rule-based 健診摘要
    total = score_data.get("total_score", 50)
    summary_parts = []
    if total >= 70:
        summary_parts.append(f"綜合評分 {total} 分，多因子面向偏多。")
    elif total >= 50:
        summary_parts.append(f"綜合評分 {total} 分，目前處於中性區間。")
    else:
        summary_parts.append(f"綜合評分 {total} 分，多項因子偏弱，建議檢視持有理由。")

    if pnl:
        if pnl["unrealized_pnl_pct"] >= 0:
            summary_parts.append(f"目前未實現獲利 {pnl['unrealized_pnl_pct']}%。")
        elif pnl["unrealized_pnl_pct"] <= -10:
            summary_parts.append(
                f"目前未實現虧損 {abs(pnl['unrealized_pnl_pct'])}%，已超過常見停損閾值（-10%），建議評估減碼。"
            )
        else:
            summary_parts.append(f"目前未實現虧損 {abs(pnl['unrealized_pnl_pct'])}%。")

    if signal and signal.get("operation"):
        op = signal["operation"]
        summary_parts.append(
            f"參考停損 {op.get('stop_loss')}、目標價 {op.get('target')}（風報比 1:{op.get('rr_ratio')}）。"
        )

    return {
        "holding_id": str(holding_id),
        "stock_code": holding.stock_code,
        "stock_name": holding.stock_name,
        "score": {
            "total_score": total,
            "technical_score": score_data.get("technical_score"),
            "chip_score": score_data.get("chip_score"),
            "fundamental_score": score_data.get("fundamental_score"),
            "sentiment_score": score_data.get("sentiment_score"),
        },
        "signal": signal,
        "pnl": pnl,
        "summary": " ".join(summary_parts),
    }
