"""
assets/tasks.py

Celery tasks for the Asset Ledger.
"""
from celery import shared_task
from django.utils import timezone


@shared_task(bind=True, max_retries=0)
def process_bulk_import_async(self, job_id: str) -> None:
    """
    Parse and classify a bulk import file asynchronously.
    Sets job.status → PREVIEW_READY on success, or FAILED on error.
    """
    from assets.models import BulkImportJob
    from assets.import_export import parse_and_classify

    job = BulkImportJob.objects.select_related("tenant", "site").get(pk=job_id)

    try:
        BulkImportJob.objects.filter(pk=job.pk).update(
            status=BulkImportJob.Status.PROCESSING
        )
        results = parse_and_classify(job.file_path, job.tenant, job.site)
        BulkImportJob.objects.filter(pk=job.pk).update(
            status=BulkImportJob.Status.PREVIEW_READY,
            total_rows=len(results["rows"]),
            results_json=results,
        )
    except Exception as exc:
        BulkImportJob.objects.filter(pk=job.pk).update(
            status=BulkImportJob.Status.FAILED,
            results_json={"error": str(exc)},
            completed_at=timezone.now(),
        )
        raise
