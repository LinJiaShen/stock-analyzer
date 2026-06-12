"""
環境設定模組
使用 Pydantic Settings 管理環境變數

生產環境（ENV=production）下會在啟動時驗證:
- JWT_SECRET 不可為預設佔位值、長度至少 32 字元
- DB_PASSWORD 不可為弱預設值 'postgres'
驗證失敗時直接拒絕啟動（fail fast）。
"""
from typing import List, Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

# 已知的不安全佔位值
_PLACEHOLDER_SECRETS = {
    "REPLACE_ME",
    "your-secret-key-change-in-production",
    "change-me-in-production",
}


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
    OLLAMA_MODEL: str = "qwen3:8b"
    
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

    # 永豐金 Sinopac (shioaji)
    SINOPAC_API_KEY: str = ""
    SINOPAC_SECRET_KEY: str = ""

    # 爬蟲
    CRAWLER_DELAY: int = 3
    CRAWLER_MAX_RETRIES: int = 3

    # 錯誤追蹤（留空則不啟用 Sentry）
    SENTRY_DSN: str = ""

    @model_validator(mode="after")
    def validate_production_secrets(self):
        """生產環境啟動時驗證關鍵設定，不安全直接拒絕啟動"""
        if self.ENV != "production":
            return self

        errors = []
        if self.JWT_SECRET in _PLACEHOLDER_SECRETS:
            errors.append("JWT_SECRET 不可使用預設佔位值")
        if len(self.JWT_SECRET) < 32:
            errors.append("JWT_SECRET 長度至少需要 32 字元")
        if self.DB_PASSWORD == "postgres":
            errors.append("DB_PASSWORD 不可使用弱預設值 'postgres'")
        if "postgres:postgres@" in self.DATABASE_URL:
            errors.append("DATABASE_URL 不可使用弱預設帳密 'postgres:postgres'")

        if errors:
            raise ValueError(
                "生產環境設定驗證失敗，拒絕啟動:\n  - " + "\n  - ".join(errors)
            )
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
