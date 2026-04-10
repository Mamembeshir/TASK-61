# Data migration: create Celery beat schedules for integrations periodic tasks.
# 1. integrations.renotify_critical_alerts  — every 15 minutes
# 2. integrations.check_overdue_task_threshold — daily at 00:10 UTC

from django.db import migrations


def create_periodic_tasks(apps, schema_editor):
    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask    = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        # django_celery_beat is not installed/migrated — skip gracefully
        return

    # ------------------------------------------------------------------
    # 1. renotify_critical_alerts — every 15 minutes
    # ------------------------------------------------------------------
    renotify_name = "integrations.renotify_critical_alerts"
    if not PeriodicTask.objects.filter(name=renotify_name).exists():
        renotify_schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="*/15",
            hour="*",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            defaults={"timezone": "UTC"},
        )
        PeriodicTask.objects.create(
            crontab     = renotify_schedule,
            name        = renotify_name,
            task        = renotify_name,
            enabled     = True,
            description = "Re-notify on OPEN CRITICAL alerts older than 60 minutes.",
        )

    # ------------------------------------------------------------------
    # 2. check_overdue_task_threshold — daily at 00:10 UTC
    # ------------------------------------------------------------------
    threshold_name = "integrations.check_overdue_task_threshold"
    if not PeriodicTask.objects.filter(name=threshold_name).exists():
        threshold_schedule, _ = CrontabSchedule.objects.get_or_create(
            minute=10,
            hour=0,
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            defaults={"timezone": "UTC"},
        )
        PeriodicTask.objects.create(
            crontab     = threshold_schedule,
            name        = threshold_name,
            task        = threshold_name,
            enabled     = True,
            description = "Alert when any site has more than 10 overdue tasks.",
        )


def delete_periodic_tasks(apps, schema_editor):
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(
        name__in=[
            "integrations.renotify_critical_alerts",
            "integrations.check_overdue_task_threshold",
        ]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_periodic_tasks, reverse_code=delete_periodic_tasks),
    ]
