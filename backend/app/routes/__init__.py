from fastapi import APIRouter

from app.routes import (
    achievements,
    admin,
    analytics,
    auth,
    catalog,
    health,
    insights,
    programs,
    users,
    workouts,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalog.exercises_router)
api_router.include_router(catalog.splits_router)
api_router.include_router(workouts.workouts_router)
api_router.include_router(workouts.records_router)
api_router.include_router(workouts.stats_router)
api_router.include_router(programs.router)
api_router.include_router(admin.router)
api_router.include_router(analytics.router)
api_router.include_router(insights.router)
api_router.include_router(achievements.router)
api_router.include_router(achievements.export_router)
