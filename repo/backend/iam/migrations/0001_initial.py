import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("auth", "0001_initial"),
        ("tenants", "0001_initial"),
    ]

    operations = [
        # ------------------------------------------------------------------ #
        # User                                                                 #
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="User",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("password", models.CharField(max_length=128, verbose_name="password")),
                ("last_login", models.DateTimeField(blank=True, null=True, verbose_name="last login")),
                ("is_superuser", models.BooleanField(default=False)),
                ("tenant", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="users",
                    to="tenants.tenant",
                )),
                ("username", models.CharField(max_length=150)),
                ("role", models.CharField(
                    choices=[("ADMIN", "Administrator"), ("STAFF", "Staff"), ("COURIER", "Courier")],
                    default="STAFF",
                    max_length=20,
                )),
                ("status", models.CharField(
                    choices=[
                        ("PENDING_REVIEW", "Pending Review"),
                        ("ACTIVE", "Active"),
                        ("SUSPENDED", "Suspended"),
                        ("DEACTIVATED", "Deactivated"),
                    ],
                    default="PENDING_REVIEW",
                    max_length=20,
                )),
                ("is_staff", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("failed_login_count", models.PositiveSmallIntegerField(default=0)),
                ("locked_until", models.DateTimeField(blank=True, null=True)),
            ],
            options={"db_table": "iam_user"},
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                fields=["tenant", "username"], name="uq_user_tenant_username"
            ),
        ),
        # ------------------------------------------------------------------ #
        # groups / user_permissions (from PermissionsMixin)                   #
        # ------------------------------------------------------------------ #
        migrations.AddField(
            model_name="user",
            name="groups",
            field=models.ManyToManyField(
                blank=True,
                help_text="The groups this user belongs to.",
                related_name="user_set",
                related_query_name="user",
                to="auth.group",
                verbose_name="groups",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="user_permissions",
            field=models.ManyToManyField(
                blank=True,
                help_text="Specific permissions for this user.",
                related_name="user_set",
                related_query_name="user",
                to="auth.permission",
                verbose_name="user permissions",
            ),
        ),
        # ------------------------------------------------------------------ #
        # AccountStatusHistory                                                 #
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="AccountStatusHistory",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="status_history",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("old_status", models.CharField(
                    choices=[
                        ("PENDING_REVIEW", "Pending Review"),
                        ("ACTIVE", "Active"),
                        ("SUSPENDED", "Suspended"),
                        ("DEACTIVATED", "Deactivated"),
                    ],
                    max_length=20,
                )),
                ("new_status", models.CharField(
                    choices=[
                        ("PENDING_REVIEW", "Pending Review"),
                        ("ACTIVE", "Active"),
                        ("SUSPENDED", "Suspended"),
                        ("DEACTIVATED", "Deactivated"),
                    ],
                    max_length=20,
                )),
                ("changed_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="status_changes_made",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("reason", models.TextField()),
                ("timestamp", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={"db_table": "iam_account_status_history", "ordering": ["-timestamp"]},
        ),
        # ------------------------------------------------------------------ #
        # UserProfile                                                          #
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                ("user", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    primary_key=True,
                    related_name="profile",
                    serialize=False,
                    to=settings.AUTH_USER_MODEL,
                )),
                ("tenant", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="user_profiles",
                    to="tenants.tenant",
                )),
                ("legal_first_name", models.CharField(max_length=100)),
                ("legal_last_name",  models.CharField(max_length=100)),
                ("employee_student_id", models.CharField(max_length=50)),
                ("government_id_encrypted", models.BinaryField(blank=True, null=True)),
                ("government_id_mask", models.CharField(blank=True, default="", max_length=50)),
                ("photo_id_file_path", models.CharField(blank=True, default="", max_length=500)),
                ("photo_id_review_status", models.CharField(
                    choices=[
                        ("PENDING",  "Pending"),
                        ("APPROVED", "Approved"),
                        ("REJECTED", "Rejected"),
                    ],
                    default="PENDING",
                    max_length=10,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "iam_user_profile"},
        ),
        migrations.AddConstraint(
            model_name="userprofile",
            constraint=models.UniqueConstraint(
                fields=["tenant", "employee_student_id"],
                name="uq_profile_tenant_employee_id",
            ),
        ),
        # ------------------------------------------------------------------ #
        # UserSiteAssignment                                                   #
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="UserSiteAssignment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="site_assignments",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("site", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="user_assignments",
                    to="tenants.site",
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "iam_user_site_assignment"},
        ),
        migrations.AddConstraint(
            model_name="usersiteassignment",
            constraint=models.UniqueConstraint(
                fields=["user", "site"], name="uq_user_site_assignment"
            ),
        ),
    ]
