from celery import shared_task


@shared_task(name="meetings.check_overdue_tasks")
def check_overdue_tasks():
    from meetings.models import Task
    count = Task.mark_overdue()
    return {"overdue_marked": count}
