import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Tenant",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255, unique=True)),
                ("slug", models.SlugField(max_length=100, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "tenants_tenant"},
        ),
        migrations.CreateModel(
            name="Site",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="sites",
                    to="tenants.tenant",
                )),
                ("name", models.CharField(max_length=255)),
                ("address", models.TextField(blank=True, default="")),
                ("timezone", models.CharField(default="America/New_York", max_length=64)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "tenants_site"},
        ),
        migrations.AddConstraint(
            model_name="site",
            constraint=models.UniqueConstraint(
                fields=["tenant", "name"], name="uq_site_tenant_name"
            ),
        ),
    ]
