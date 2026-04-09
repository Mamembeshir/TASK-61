"""
assets/management/commands/recover_stale_imports.py

Startup recovery: find PROCESSING import jobs older than 1 hour and mark them
FAILED. Run this at container start to clean up jobs that were interrupted by
a crash or restart.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from assets.models import BulkImportJob


class Command(BaseCommand):
    help = "Mark stale PROCESSING import jobs (>1 hour old) as FAILED."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=1)
        count = BulkImportJob.objects.filter(
            status=BulkImportJob.Status.PROCESSING,
            created_at__lt=cutoff,
        ).update(
            status=BulkImportJob.Status.FAILED,
            results_json={"error": "Auto-failed: stalled import job."},
            completed_at=timezone.now(),
        )
        self.stdout.write(f"Marked {count} stale import job(s) as FAILED.")
