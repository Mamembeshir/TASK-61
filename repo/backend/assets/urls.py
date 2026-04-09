from django.urls import path
from assets.views import (
    AssetListCreateView,
    AssetDetailUpdateDeleteView,
    AssetTimelineView,
    AssetAsOfView,
    AssetImportView,
    AssetImportDetailView,
    AssetImportCorrectView,
    AssetImportConfirmView,
    AssetExportView,
)

urlpatterns = [
    # CRUD
    path("",                          AssetListCreateView.as_view(),        name="asset-list"),
    path("<uuid:pk>/",                AssetDetailUpdateDeleteView.as_view(), name="asset-detail"),
    path("<uuid:pk>/timeline/",       AssetTimelineView.as_view(),          name="asset-timeline"),
    path("<uuid:pk>/as-of/",          AssetAsOfView.as_view(),              name="asset-as-of"),

    # Bulk import (literal paths before <uuid:pk>/ to avoid ambiguity)
    path("import/",                         AssetImportView.as_view(),        name="asset-import"),
    path("import/<uuid:job_id>/",           AssetImportDetailView.as_view(),  name="asset-import-detail"),
    path("import/<uuid:job_id>/correct/",   AssetImportCorrectView.as_view(), name="asset-import-correct"),
    path("import/<uuid:job_id>/confirm/",   AssetImportConfirmView.as_view(), name="asset-import-confirm"),

    # Export
    path("export/",                   AssetExportView.as_view(),            name="asset-export"),
]
