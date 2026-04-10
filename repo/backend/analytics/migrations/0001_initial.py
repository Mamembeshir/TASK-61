# Generated manually on 2026-04-10
# Creates the analytics_summary table.

import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='AnalyticsSummary',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('metric_name', models.CharField(db_index=True, max_length=100)),
                ('dimensions', models.JSONField(default=dict)),
                ('value', models.DecimalField(decimal_places=4, max_digits=18)),
                ('period_start', models.DateTimeField()),
                ('period_end', models.DateTimeField()),
                ('computed_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'analytics_summary',
            },
        ),
        migrations.AddIndex(
            model_name='analyticssummary',
            index=models.Index(fields=['metric_name', 'computed_at'], name='analytics_summary_mn_ca_idx'),
        ),
    ]
