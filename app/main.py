from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

from app.routers import goals, person, tasks, subtasks, progresslog, progresslog_task, auth, jobs, expenses, budgets, \
    financial_analytics, savings, salary_months, income_sources
from app.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    description="Personal life tracking and self-improvement system",
    version=settings.VERSION,
    docs_url=None,
    redoc_url=None
)

# CORS middleware - Using settings.get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),  # ✅ Changed to use the method
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(person.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(subtasks.router, prefix="/api")
app.include_router(progresslog.router, prefix="/api")
app.include_router(progresslog_task.router, prefix="/api")

app.include_router(jobs.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(financial_analytics.router, prefix="/api")
app.include_router(savings.router, prefix="/api")
app.include_router(salary_months.router, prefix="/api")
app.include_router(income_sources.router, prefix="/api")

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# @app.get("/")
# def root():
#     return {
#         "message": settings.APP_NAME,
#         "version": settings.VERSION,
#         "docs": "/docs"
#     }


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui():
    return FileResponse("static/swagger-custom.html")


@app.get("/redoc", include_in_schema=False)
async def redoc_html():
    from fastapi.openapi.docs import get_redoc_html
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{settings.APP_NAME} - ReDoc"
    )
