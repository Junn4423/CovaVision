from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.accounts import router as accounts_router
from app.api.routes.attendance import router as attendance_router
from app.api.routes.auth import router as auth_router
from app.api.routes.billing import router as billing_router
from app.api.routes.cameras import router as cameras_router
from app.api.routes.employees import router as employees_router
from app.api.routes.health import router as health_router
from app.api.routes.reports import router as reports_router
from app.api.routes.settings import router as settings_router
from app.camera.discovery import CameraDiscoveryService
from app.camera.stream_manager import CameraStreamManager
from app.core.config import settings
from app.db.repository import PrismaRepository


def create_app(repository=None, camera_manager=None, camera_discovery=None) -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.state.repository = repository or PrismaRepository()
    application.state.camera_manager = camera_manager or CameraStreamManager(max_fps=30, jpeg_quality=70)
    application.state.camera_discovery = camera_discovery or CameraDiscoveryService()
    application.state.recognition_service = None
    application.include_router(health_router)
    application.include_router(auth_router)
    application.include_router(billing_router)
    application.include_router(accounts_router)
    application.include_router(employees_router)
    application.include_router(cameras_router)
    application.include_router(attendance_router)
    application.include_router(settings_router)
    application.include_router(reports_router)
    return application


app = create_app()
