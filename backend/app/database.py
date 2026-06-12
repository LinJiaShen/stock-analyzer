"""
資料庫連線設定
使用 asyncpg 驅動 + SQLAlchemy async 支援
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

# 建立非同步引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENV == "development",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# 建立非同步 Session 工廠
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


class Base(DeclarativeBase):
    """ORM 模型基底類別"""
    pass


async def get_db():
    """依賴注入: 取得非同步資料庫 Session"""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """
    初始化資料庫

    開發環境：create_all 自動建表（方便快速迭代）
    生產環境：schema 由 Alembic 管理（部署時執行 `alembic upgrade head`），
              這裡只驗證連線可用，不動 schema。
    """
    if settings.ENV == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    else:
        # 僅驗證連線
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))


async def close_db():
    """關閉資料庫連線"""
    await engine.dispose()
