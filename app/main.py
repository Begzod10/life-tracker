from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import goals
from app.routers import person
from app.routers import tasks
from app.routers import subtasks
from app.routers import progresslog
from app.routers import progresslog_task
from app.routers import auth
from starlette.responses import FileResponse
from app.config import settings

app = FastAPI(
    title="Life Tracker API",
    description="Personal life tracking and self-improvement system",
    version="1.0.0",
    docs_url=None,  # ✅ Disable default docs
    redoc_url=None  # ✅ Disable default redoc
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "*",
        # settings.FRONTEND_URL,
    ],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(person.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(subtasks.router, prefix="/api")
app.include_router(progresslog.router, prefix="/api")
app.include_router(progresslog_task.router, prefix="/api")

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui():
    return FileResponse("static/swagger-custom.html")


# Keep redoc for alternative
@app.get("/redoc", include_in_schema=False)
async def redoc_html():
    from fastapi.openapi.docs import get_redoc_html
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title="Life Tracker API - ReDoc"
    )
