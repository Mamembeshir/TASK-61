# Data migration: create Celery beat schedule for analytics.compute_analytics
# Runs every 15 minutes (*/15 * * * *).

from django.db import migrations


def create_periodic_task(apps, schema_editor):
    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask    = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        # django_celery_beat is not installed/migrated — skip gracefully
        return

    task_name = "analytics.compute_analytics"

    # Skip if already exists (idempotent)
    if PeriodicTask.objects.filter(name=task_name).exists():
        return

    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="*/15",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        defaults={"timezone": "UTC"},
    )

    PeriodicTask.objects.create(
        crontab     = schedule,
        name        = task_name,
        task        = task_name,
        enabled     = True,
        description = "Compute and refresh analytics summary metrics every 15 minutes.",
    )


def delete_periodic_task(apps, schema_editor):
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(name="analytics.compute_analytics").delete()


class Migration(migrations.Migration):

    dependencies = [
        ('analytics', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, reverse_code=delete_periodic_task),
    ]
