# Generated manually on 2026-04-10
# Creates the core_request_log table for per-request API health logging.

import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_rename_core_audit_entity_idx_core_audit__entity__b88b7f_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='RequestLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('method', models.CharField(max_length=10)),
                ('path', models.CharField(max_length=500)),
                ('status_code', models.SmallIntegerField()),
                ('response_time_ms', models.IntegerField()),
                ('user_id', models.CharField(blank=True, default='anonymous', max_length=100)),
                ('timestamp', models.DateTimeField(db_index=True)),
            ],
            options={
                'db_table': 'core_request_log',
            },
        ),
        migrations.AddIndex(
            model_name='requestlog',
            index=models.Index(fields=['timestamp'], name='core_request_log_ts_idx'),
        ),
        migrations.AddIndex(
            model_name='requestlog',
            index=models.Index(fields=['status_code', 'timestamp'], name='core_request_log_sc_ts_idx'),
        ),
    ]
