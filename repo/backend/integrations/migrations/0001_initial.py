# Generated manually on 2026-04-10

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenants', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ------------------------------------------------------------------
        # integrations_alert
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='Alert',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('alert_type', models.CharField(
                    choices=[
                        ('CELERY_FAILURE',    'Celery Task Failure'),
                        ('WEBHOOK_FAILURE',   'Webhook Delivery Failure'),
                        ('IMPORT_FAILURE',    'Bulk Import Failure'),
                        ('OVERDUE_THRESHOLD', 'Overdue Task Threshold'),
                        ('CRITICAL_RENOTIFY', 'Critical Alert Re-notification'),
                    ],
                    max_length=30,
                )),
                ('severity', models.CharField(
                    choices=[
                        ('CRITICAL', 'Critical'),
                        ('WARNING',  'Warning'),
                        ('INFO',     'Info'),
                    ],
                    db_index=True,
                    max_length=10,
                )),
                ('message', models.TextField()),
                ('status', models.CharField(
                    choices=[
                        ('OPEN',         'Open'),
                        ('ACKNOWLEDGED', 'Acknowledged'),
                        ('ASSIGNED',     'Assigned'),
                        ('CLOSED',       'Closed'),
                    ],
                    db_index=True,
                    default='OPEN',
                    max_length=15,
                )),
                ('acknowledged_at', models.DateTimeField(blank=True, null=True)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('resolution_note', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='alerts',
                    to='tenants.tenant',
                )),
                ('original_alert', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='renotifications',
                    to='integrations.alert',
                )),
                ('acknowledged_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='acknowledged_alerts',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assigned_alerts',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('closed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='closed_alerts',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'integrations_alert',
                'ordering': ['-created_at'],
            },
        ),

        # ------------------------------------------------------------------
        # integrations_webhook_endpoint
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='WebhookEndpoint',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('url', models.URLField(max_length=500)),
                ('secret', models.CharField(max_length=200)),
                ('is_active', models.BooleanField(default=True)),
                ('events', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='webhook_endpoints',
                    to='tenants.tenant',
                )),
            ],
            options={
                'db_table': 'integrations_webhook_endpoint',
            },
        ),

        # ------------------------------------------------------------------
        # integrations_webhook_delivery
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='WebhookDeliveryAttempt',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_type', models.CharField(max_length=100)),
                ('idempotency_key', models.UUIDField(default=uuid.uuid4)),
                ('payload', models.JSONField()),
                ('status', models.CharField(
                    choices=[
                        ('PENDING', 'Pending'),
                        ('SUCCESS', 'Success'),
                        ('FAILED',  'Failed'),
                    ],
                    default='PENDING',
                    max_length=10,
                )),
                ('attempt_number', models.PositiveSmallIntegerField(default=1)),
                ('response_status_code', models.IntegerField(blank=True, null=True)),
                ('response_body', models.TextField(blank=True, default='')),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('endpoint', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='deliveries',
                    to='integrations.webhookendpoint',
                )),
            ],
            options={
                'db_table': 'integrations_webhook_delivery',
                'ordering': ['-created_at'],
            },
        ),
    ]
