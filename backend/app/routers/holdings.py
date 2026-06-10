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
    
    TODO: 整合多因子評分模型與 LLM 健診摘要
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
    
    # TODO: 呼叫 scoring_service 計算評分
    # TODO: 呼叫 llm_service 生成健診摘要
    return {
        "holding_id": str(holding_id),
        "stock_code": holding.stock_code,
        "stock_name": holding.stock_name,
        "message": "健診功能開發中，請稍候..."
    }
