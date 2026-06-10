"""
環境設定模組
使用 Pydantic Settings 管理環境變數
"""
from typing import List, Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # 環境
    ENV: str = "development"
    
    # 資料庫 - 支援直接傳入 DATABASE_URL 或個別組件
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/stock_analyzer"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_NAME: str = "stock_analyzer"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    
    @property
    def DATABASE_URL_SYNC(self) -> str:
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    
    # JWT
    JWT_SECRET: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 小時
    
    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen:7b"
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"
    
    @property
    def allowed_origins(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # TWSE API
    TWSE_BASE_URL: str = "https://ops.twse.com.tw"
    TWSE_RATE_LIMIT_DELAY: int = 2  # 秒
    
    # Yahoo Finance
    YAHOO_BASE_URL: str = "https://query1.finance.yahoo.com/v8/finance/chart"
    
    # 爬蟲
    CRAWLER_DELAY: int = 3
    CRAWLER_MAX_RETRIES: int = 3
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
