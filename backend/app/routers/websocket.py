"""
WebSocket 路由 - 即時股價推送
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.services.subscription import subscription_manager
from app.services.aggregator import TAIPEI_TZ

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])


def _is_market_hours() -> bool:
    """檢查是否在台灣股市交易時間內"""
    now = datetime.now(TAIPEI_TZ)
    t = now.time()
    weekday = now.weekday()
    if weekday >= 5:
        return False
    morning = datetime.strptime("09:00", "%H:%M").time() <= t <= datetime.strptime("12:50", "%H:%M").time()
    afternoon = datetime.strptime("13:00", "%H:%M").time() <= t <= datetime.strptime("13:30", "%H:%M").time()
    return morning or afternoon


@router.websocket("/stock/{stock_code}")
async def stock_websocket(
    websocket: WebSocket,
    stock_code: str,
    interval: Optional[str] = Query("all", regex="^(all|1m|5m|daily)$"),
):
    """
    個股即時數據 WebSocket 端點
    
    - **stock_code**: 股票代碼 (如 2330)
    - **interval**: K線週期 (all, 1m, 5m, daily)，預設 all
    
    訊息格式:
    ```json
    {
      "type": "candle_update",
      "stock_code": "2330",
      "data": {
        "open_time": "2024-01-15T14:30:00+08:00",
        "open": 275.5,
        "high": 276.0,
        "low": 275.0,
        "close": 275.5,
        "volume": 1000,
        "turnover": 275500,
        "minute_bar": true,
        "completed": false
      }
    }
    ```
    """
    # 接受連線
    await websocket.accept()
    
    # 啟動訂閱管理服務
    await subscription_manager.start()
    
    # 添加連線到管理池
    await subscription_manager.add_connection(stock_code, websocket)
    
    # 發送連線成功消息
    market_open = _is_market_hours()
    await websocket.send_json({
        "type": "connected",
        "stock_code": stock_code,
        "interval": interval,
        "market_open": market_open,
        "message": "交易時間內" if market_open else "非交易時間，將使用靜態數據",
    })
    
    try:
        while True:
            # 接收客戶端消息 (用於心跳或控制)
            data = await websocket.receive_text()
            
            # 處理心跳
            if data == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.now(TAIPEI_TZ).isoformat(),
                })
            
            # 處理手動訂閱請求
            elif data.startswith("subscribe:"):
                new_code = data.split(":", 1)[1].strip()
                if new_code and new_code != stock_code:
                    await subscription_manager.add_connection(new_code, websocket)
                    await websocket.send_json({
                        "type": "subscribed",
                        "stock_code": new_code,
                    })
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket 斷線: {stock_code}")
    except Exception as e:
        logger.error(f"WebSocket 錯誤 [{stock_code}]: {e}")
    finally:
        # 清理連線
        await subscription_manager.remove_connection(stock_code, websocket)
        logger.info(f"WebSocket 資源已清理: {stock_code}")


@router.websocket("/batch/{stock_codes}")
async def batch_websocket(
    websocket: WebSocket,
    stock_codes: str,
):
    """
    批量訂閱多個股票的即時數據
    
    - **stock_codes**: 以逗號分隔的股票代碼 (如 2330,2317,2454)
    """
    await websocket.accept()
    
    codes = [c.strip() for c in stock_codes.split(",") if c.strip()]
    
    if not codes:
        await websocket.send_json({
            "type": "error",
            "message": "無效的股票代碼列表",
        })
        await websocket.close()
        return
    
    # 啟動訂閱管理服務
    await subscription_manager.start()
    
    # 添加所有連線
    for code in codes:
        await subscription_manager.add_connection(code, websocket)
    
    # 發送連線成功消息
    market_open = _is_market_hours()
    await websocket.send_json({
        "type": "connected",
        "stock_codes": codes,
        "market_open": market_open,
        "message": "交易時間內" if market_open else "非交易時間",
    })
    
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.now(TAIPEI_TZ).isoformat(),
                })
    
    except WebSocketDisconnect:
        logger.info(f"Batch WebSocket 斷線: {codes}")
    except Exception as e:
        logger.error(f"Batch WebSocket 錯誤: {e}")
    finally:
        # 清理所有連線
        for code in codes:
            await subscription_manager.remove_connection(code, websocket)
        logger.info(f"Batch WebSocket 資源已清理: {codes}")
