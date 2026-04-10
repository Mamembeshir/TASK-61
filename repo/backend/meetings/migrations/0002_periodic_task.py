# Data migration: create Celery beat schedule for meetings.check_overdue_tasks
# Runs daily at 00:05 UTC.

from django.db import migrations


def create_periodic_task(apps, schema_editor):
    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask    = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        # django_celery_beat is not installed/migrated — skip gracefully
        return

    task_name = "meetings.check_overdue_tasks"

    # Skip if already exists (idempotent)
    if PeriodicTask.objects.filter(name=task_name).exists():
        return

    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute=5,
        hour=0,
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
        description = "Mark TODO/IN_PROGRESS tasks with past due_date as OVERDUE.",
    )


def delete_periodic_task(apps, schema_editor):
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(name="meetings.check_overdue_tasks").delete()


class Migration(migrations.Migration):

    dependencies = [
        ('meetings', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, reverse_code=delete_periodic_task),
    ]
