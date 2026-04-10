from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Scopes IdempotencyRecord by (key, endpoint, actor_id) so cached responses
    can never cross user or path boundaries.

    MySQL key-length note: (key(255) + endpoint(500) + actor_id(100)) × 4 bytes
    (utf8mb4) = 3420 bytes > InnoDB 3072-byte limit.  The UNIQUE INDEX is
    therefore created via RunSQL with prefix lengths that fit within the limit
    while still enforcing uniqueness for all realistic values.
    """

    dependencies = [
        ("core", "0003_request_log"),
    ]

    operations = [
        # Remove the global unique constraint on key alone
        migrations.AlterField(
            model_name="idempotencyrecord",
            name="key",
            field=models.CharField(max_length=255),
        ),
        # Add actor_id to scope the record to a specific user
        migrations.AddField(
            model_name="idempotencyrecord",
            name="actor_id",
            field=models.CharField(blank=True, default="anonymous", max_length=100),
        ),
        # Composite unique index scoped by (key, endpoint, actor_id).
        # DB: prefix index to satisfy MySQL's 3072-byte InnoDB key-length limit.
        # State: AlterUniqueTogether so Django's ORM tracks the constraint.
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "CREATE UNIQUE INDEX core_idempotency_key_ep_actor_uq "
                        "ON core_idempotency_record (`key`(191), endpoint(191), actor_id(100));"
                    ),
                    reverse_sql=(
                        "DROP INDEX core_idempotency_key_ep_actor_uq "
                        "ON core_idempotency_record;"
                    ),
                ),
            ],
            state_operations=[
                migrations.AlterUniqueTogether(
                    name="idempotencyrecord",
                    unique_together={("key", "endpoint", "actor_id")},
                ),
            ],
        ),
    ]
