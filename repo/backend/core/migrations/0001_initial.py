import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.UUIDField(blank=True, db_index=True, null=True)),
                ("entity_type", models.CharField(db_index=True, max_length=100)),
                ("entity_id", models.CharField(db_index=True, max_length=100)),
                ("action", models.CharField(
                    choices=[
                        ("CREATE", "Create"),
                        ("UPDATE", "Update"),
                        ("DELETE", "Delete"),
                        ("APPROVE", "Approve"),
                        ("REJECT", "Reject"),
                        ("SUSPEND", "Suspend"),
                        ("ACTIVATE", "Activate"),
                        ("LOGIN", "Login"),
                        ("LOGIN_FAILED", "Login Failed"),
                        ("LOGOUT", "Logout"),
                        ("EXPORT", "Export"),
                        ("IMPORT", "Import"),
                        ("PUBLISH", "Publish"),
                        ("UNPUBLISH", "Unpublish"),
                    ],
                    db_index=True,
                    max_length=30,
                )),
                ("actor_id", models.CharField(blank=True, max_length=100, null=True)),
                ("actor_username", models.CharField(blank=True, max_length=150, null=True)),
                ("diff_json", models.JSONField(blank=True, null=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, null=True)),
                ("timestamp", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={"db_table": "core_audit_log", "ordering": ["-timestamp"]},
        ),
        migrations.CreateModel(
            name="IdempotencyRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.CharField(db_index=True, max_length=255, unique=True)),
                ("endpoint", models.CharField(max_length=500)),
                ("response_status", models.PositiveSmallIntegerField()),
                ("response_body", models.JSONField()),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={"db_table": "core_idempotency_record"},
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["entity_type", "entity_id"], name="core_audit_entity_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["tenant_id", "timestamp"], name="core_audit_tenant_ts_idx"),
        ),
    ]
