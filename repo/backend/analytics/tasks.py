from celery import shared_task
from django.utils import timezone
from django.db.models import Count, Q, Avg, F
from decimal import Decimal
import datetime


@shared_task(name="analytics.compute_analytics")
def compute_analytics() -> dict:
    from analytics.models import AnalyticsSummary
    from tenants.models import Tenant, Site
    from foodservice.models import MenuVersion
    from assets.models import Asset, BulkImportJob
    from meetings.models import Task, Resolution
    from integrations.models import Alert
    from core.models import RequestLog

    now = timezone.now()
    period_start = now - datetime.timedelta(hours=24)
    period_end = now
    rows = []

    # Helper: stage a summary row for bulk insert
    def push(metric_name, value, dimensions=None):
        rows.append(AnalyticsSummary(
            metric_name  = metric_name,
            dimensions   = dimensions or {},
            value        = Decimal(str(value)),
            period_start = period_start,
            period_end   = period_end,
        ))

    # ── 1. Menu funnel by status ─────────────────────────────────────────────
    # MenuVersion status choices: DRAFT, PUBLISHED, UNPUBLISHED, ARCHIVED
    for status_val in ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]:
        total = MenuVersion.objects.filter(status=status_val).count()
        push("menu.funnel", total, {"status": status_val})

    # ── 2. Draft-to-published conversion rate ────────────────────────────────
    total_menus = MenuVersion.objects.count() or 1
    published   = MenuVersion.objects.filter(status="PUBLISHED").count()
    push("menu.draft_to_published_rate", round(published / total_menus * 100, 2))

    # ── 3. Asset utilization per site ────────────────────────────────────────
    # An asset is "active" if it has a current_version set and is not deleted.
    # AssetVersion has no status field; current_version on Asset is the pointer
    # to the latest version and is the canonical indicator of an active asset.
    sites = Site.objects.select_related("tenant").all()
    for site in sites:
        total_assets  = Asset.objects.filter(site=site, is_deleted=False).count()
        active_assets = Asset.objects.filter(
            site=site,
            is_deleted=False,
            current_version__isnull=False,
        ).count()
        util = round(active_assets / total_assets * 100, 2) if total_assets else 0
        push("asset.utilization_pct", util, {
            "site_id":   str(site.pk),
            "site_name": site.name,
            "tenant_id": str(site.tenant_id),
        })

    # ── 4. Asset import exception count ─────────────────────────────────────
    failed_imports = BulkImportJob.objects.filter(
        status="FAILED",
        created_at__gte=period_start,
    ).count()
    push("asset.import_exception_count", failed_imports)

    # ── 5. Task completion rate by site ─────────────────────────────────────
    for site in sites:
        total_tasks = Task.objects.filter(resolution__meeting__site=site).count()
        done_tasks  = Task.objects.filter(
            resolution__meeting__site=site, status="DONE"
        ).count()
        rate = round(done_tasks / total_tasks * 100, 2) if total_tasks else 0
        push("task.completion_rate_pct", rate, {
            "site_id":   str(site.pk),
            "site_name": site.name,
        })

    # ── 6. Overdue task count by site ────────────────────────────────────────
    for site in sites:
        overdue = Task.objects.filter(
            resolution__meeting__site=site, status="OVERDUE"
        ).count()
        push("task.overdue_count", overdue, {
            "site_id":   str(site.pk),
            "site_name": site.name,
        })

    # ── 7. Resolution completion rate ────────────────────────────────────────
    total_res     = Resolution.objects.count() or 1
    completed_res = Resolution.objects.filter(status="COMPLETED").count()
    push("resolution.completion_rate_pct", round(completed_res / total_res * 100, 2))

    # ── 8. API health: p95 response time + error rate ────────────────────────
    logs       = RequestLog.objects.filter(timestamp__gte=period_start)
    total_reqs = logs.count()
    if total_reqs > 0:
        times   = list(
            logs.order_by("response_time_ms")
                .values_list("response_time_ms", flat=True)
        )
        p95_idx = max(0, int(len(times) * 0.95) - 1)
        p95     = times[p95_idx]
        push("api.p95_response_time_ms", p95)

        error_count = logs.filter(status_code__gte=500).count()
        error_rate  = round(error_count / total_reqs * 100, 2)
        push("api.error_rate_pct", error_rate)
    else:
        push("api.p95_response_time_ms", 0)
        push("api.error_rate_pct", 0)

    # ── 9. Alert MTTR: avg(closed_at - created_at) in minutes ───────────────
    closed_alerts = Alert.objects.filter(
        status="CLOSED",
        closed_at__isnull=False,
        created_at__gte=period_start,
    )
    if closed_alerts.exists():
        durations = [
            (a.closed_at - a.created_at).total_seconds() / 60
            for a in closed_alerts
        ]
        mttr_min = round(sum(durations) / len(durations), 2)
    else:
        mttr_min = 0
    push("alert.mttr_minutes", mttr_min)

    # ── Bulk upsert ──────────────────────────────────────────────────────────
    # Delete old summaries for this period before inserting fresh ones.
    AnalyticsSummary.objects.filter(period_start=period_start).delete()
    AnalyticsSummary.objects.bulk_create(rows, ignore_conflicts=True)

    return {"metrics_computed": len(rows)}
