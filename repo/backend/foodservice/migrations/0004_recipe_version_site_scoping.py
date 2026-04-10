import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("foodservice", "0003_menu_models"),
        ("tenants", "0001_initial"),
    ]

    operations = [
        # Add nullable site FK to RecipeVersion
        migrations.AddField(
            model_name="recipeversion",
            name="site",
            field=models.ForeignKey(
                blank=True,
                help_text="Scope this version to a specific site. Null means tenant-wide.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="recipe_versions",
                to="tenants.site",
            ),
        ),
        # Drop the old global per-recipe active constraint
        migrations.RemoveConstraint(
            model_name="recipeversion",
            name="uq_recipe_one_active_version",
        ),
        # Add scoped per-(recipe, site) active constraint
        migrations.AddConstraint(
            model_name="recipeversion",
            constraint=models.UniqueConstraint(
                condition=models.Q(status="ACTIVE"),
                fields=["recipe", "site"],
                name="uq_recipe_site_one_active_version",
            ),
        ),
    ]
