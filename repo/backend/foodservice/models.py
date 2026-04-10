"""
foodservice/models.py

Recipe management models — supports versioned recipes with ingredients and steps.

Key design decisions (per questions.md §4.3):
  - effective_from / effective_to are for version ordering/audit only;
    they do NOT auto-activate or auto-deactivate versions at a calendar date.
  - Only one ACTIVE version is allowed per recipe at any time (partial unique index).
  - activate() is the only way to transition a DRAFT → ACTIVE; it supersedes
    the current ACTIVE version atomically.
"""
import uuid
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator

from core.exceptions import UnprocessableEntity


# ---------------------------------------------------------------------------
# Recipe
# ---------------------------------------------------------------------------

class Recipe(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.PROTECT,
        related_name="recipes",
    )
    name       = models.CharField(max_length=200)
    created_by = models.ForeignKey(
        "iam.User",
        on_delete=models.PROTECT,
        related_name="created_recipes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "foodservice_recipe"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.tenant_id})"

    @property
    def active_version(self):
        """Return the single ACTIVE version, or None."""
        return self.versions.filter(status=RecipeVersion.Status.ACTIVE).first()


# ---------------------------------------------------------------------------
# RecipeVersion
# ---------------------------------------------------------------------------

class RecipeVersion(models.Model):

    class Status(models.TextChoices):
        DRAFT      = "DRAFT",      "Draft"
        ACTIVE     = "ACTIVE",     "Active"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        ARCHIVED   = "ARCHIVED",   "Archived"

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe         = models.ForeignKey(
        Recipe,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.PositiveIntegerField()
    effective_from = models.DateField()
    effective_to   = models.DateField(null=True, blank=True)
    status         = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    servings       = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=Decimal("1"),
        validators=[MinValueValidator(Decimal("0.0001"))],
    )
    created_by     = models.ForeignKey(
        "iam.User",
        on_delete=models.PROTECT,
        related_name="created_recipe_versions",
    )
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "foodservice_recipe_version"
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["recipe"],
                condition=models.Q(status="ACTIVE"),
                name="uq_recipe_one_active_version",
            ),
            models.UniqueConstraint(
                fields=["recipe", "version_number"],
                name="uq_recipe_version_number",
            ),
        ]

    def __str__(self):
        return f"{self.recipe.name} v{self.version_number} [{self.status}]"

    # ------------------------------------------------------------------
    # Business logic
    # ------------------------------------------------------------------

    def compute_per_serving_cost(self) -> Decimal:
        """
        SUM(quantity * unit_cost) / servings, rounded HALF_UP to 2 dp.
        Returns Decimal("0.00") if no ingredients.
        """
        total = sum(
            ing.quantity * ing.unit_cost
            for ing in self.ingredients.all()
        )
        if not total:
            return Decimal("0.00")
        result = Decimal(str(total)) / Decimal(str(self.servings))
        return result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @transaction.atomic
    def activate(self):
        """
        Transition self (DRAFT) → ACTIVE.

        If a currently ACTIVE version exists:
          1. self.effective_from must be strictly after that version's effective_from.
          2. Supersede that version: status → SUPERSEDED, effective_to = self.effective_from - 1 day.
        Then set self → ACTIVE.
        """
        if self.status != self.Status.DRAFT:
            raise UnprocessableEntity(
                f"Only DRAFT versions can be activated (current status: {self.status})."
            )

        # Lock the recipe row to prevent concurrent activations
        recipe = Recipe.objects.select_for_update().get(pk=self.recipe_id)

        current_active = (
            RecipeVersion.objects
            .select_for_update()
            .filter(recipe=recipe, status=self.Status.ACTIVE)
            .first()
        )

        if current_active:
            if self.effective_from <= current_active.effective_from:
                raise UnprocessableEntity(
                    "New version's effective_from must be strictly after the current "
                    f"active version's effective_from ({current_active.effective_from})."
                )
            # Supersede the current active version
            current_active.status       = self.Status.SUPERSEDED
            current_active.effective_to = self.effective_from - timedelta(days=1)
            current_active.save(update_fields=["status", "effective_to"])

        self.status = self.Status.ACTIVE
        self.save(update_fields=["status"])

    def archive(self):
        """
        Transition self (ACTIVE) → ARCHIVED. ADMIN-only — enforced in view.
        """
        if self.status != self.Status.ACTIVE:
            raise UnprocessableEntity(
                f"Only ACTIVE versions can be archived (current status: {self.status})."
            )
        self.status = self.Status.ARCHIVED
        self.save(update_fields=["status"])


# ---------------------------------------------------------------------------
# RecipeIngredient
# ---------------------------------------------------------------------------

class RecipeIngredient(models.Model):

    class Unit(models.TextChoices):
        OZ    = "oz",    "Ounce"
        LB    = "lb",    "Pound"
        CUP   = "cup",   "Cup"
        TBSP  = "tbsp",  "Tablespoon"
        TSP   = "tsp",   "Teaspoon"
        FL_OZ = "fl_oz", "Fluid Ounce"
        GAL   = "gal",   "Gallon"
        QT    = "qt",    "Quart"
        PT    = "pt",    "Pint"
        EACH  = "each",  "Each"
        PINCH = "pinch", "Pinch"

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe_version  = models.ForeignKey(
        RecipeVersion,
        on_delete=models.CASCADE,
        related_name="ingredients",
    )
    ingredient_name = models.CharField(max_length=200)
    quantity        = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0.0001"))],
    )
    unit            = models.CharField(max_length=10, choices=Unit.choices)
    unit_cost       = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
    )
    sort_order      = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "foodservice_recipe_ingredient"
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.ingredient_name} ({self.quantity} {self.unit})"


# ---------------------------------------------------------------------------
# RecipeStep
# ---------------------------------------------------------------------------

class RecipeStep(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe_version = models.ForeignKey(
        RecipeVersion,
        on_delete=models.CASCADE,
        related_name="steps",
    )
    step_number    = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
    )
    instruction    = models.TextField(max_length=2000)

    class Meta:
        db_table = "foodservice_recipe_step"
        ordering = ["step_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["recipe_version", "step_number"],
                name="uq_recipe_step_number",
            ),
        ]

    def __str__(self):
        return f"Step {self.step_number}"


# ===========================================================================
# DISH MODELS
# ===========================================================================

# ---------------------------------------------------------------------------
# Allergen
# ---------------------------------------------------------------------------

class Allergen(models.Model):
    """
    Reference table for allergens. Seeded by `seed_allergens` management command.
    NONE is a sentinel value — means "no allergens"; cannot be combined with others.
    """

    class Code(models.TextChoices):
        MILK      = "MILK",      "Milk"
        EGGS      = "EGGS",      "Eggs"
        FISH      = "FISH",      "Fish"
        SHELLFISH = "SHELLFISH", "Shellfish"
        TREE_NUTS = "TREE_NUTS", "Tree Nuts"
        PEANUTS   = "PEANUTS",   "Peanuts"
        GLUTEN    = "GLUTEN",    "Gluten"
        SOY       = "SOY",       "Soy"
        SESAME    = "SESAME",    "Sesame"
        SULFITES  = "SULFITES",  "Sulfites"
        MUSTARD   = "MUSTARD",   "Mustard"
        CELERY    = "CELERY",    "Celery"
        LUPIN     = "LUPIN",     "Lupin"
        MOLLUSKS  = "MOLLUSKS",  "Mollusks"
        NONE      = "NONE",      "None"

    id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, choices=Code.choices, unique=True)

    class Meta:
        db_table = "foodservice_allergen"
        ordering = ["code"]

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# Dish
# ---------------------------------------------------------------------------

class Dish(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.PROTECT,
        related_name="dishes",
    )
    recipe     = models.ForeignKey(
        Recipe,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dishes",
    )
    created_by = models.ForeignKey(
        "iam.User",
        on_delete=models.PROTECT,
        related_name="created_dishes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "foodservice_dish"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Dish({self.pk})"

    @property
    def active_version(self):
        return self.versions.filter(status=DishVersion.Status.ACTIVE).first()


# ---------------------------------------------------------------------------
# DishVersion
# ---------------------------------------------------------------------------

class DishVersion(models.Model):

    class Status(models.TextChoices):
        DRAFT      = "DRAFT",      "Draft"
        ACTIVE     = "ACTIVE",     "Active"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        ARCHIVED   = "ARCHIVED",   "Archived"

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dish            = models.ForeignKey(
        Dish,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number  = models.PositiveIntegerField()
    name            = models.CharField(max_length=200)
    description     = models.TextField(max_length=1000, blank=True)
    effective_from  = models.DateField()
    effective_to    = models.DateField(null=True, blank=True)
    status          = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    # Nutrition (all-or-nothing: if any is set, all 4 must be set)
    calories        = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    protein_g       = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    carbs_g         = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    fat_g           = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    # Cost snapshot (per questions.md §4.1)
    per_serving_cost = models.DecimalField(
        max_digits=10, decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    created_by      = models.ForeignKey(
        "iam.User",
        on_delete=models.PROTECT,
        related_name="created_dish_versions",
    )
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "foodservice_dish_version"
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["dish"],
                condition=models.Q(status="ACTIVE"),
                name="uq_dish_one_active_version",
            ),
            models.UniqueConstraint(
                fields=["dish", "version_number"],
                name="uq_dish_version_number",
            ),
        ]

    def __str__(self):
        return f"{self.name} v{self.version_number} [{self.status}]"

    @property
    def has_nutrition(self):
        return self.calories is not None

    @transaction.atomic
    def activate(self):
        if self.status != self.Status.DRAFT:
            raise UnprocessableEntity(
                f"Only DRAFT versions can be activated (current status: {self.status})."
            )
        dish = Dish.objects.select_for_update().get(pk=self.dish_id)
        current_active = (
            DishVersion.objects
            .select_for_update()
            .filter(dish=dish, status=self.Status.ACTIVE)
            .first()
        )
        if current_active:
            if self.effective_from <= current_active.effective_from:
                raise UnprocessableEntity(
                    "New version's effective_from must be strictly after the current "
                    f"active version's effective_from ({current_active.effective_from})."
                )
            current_active.status       = self.Status.SUPERSEDED
            current_active.effective_to = self.effective_from - timedelta(days=1)
            current_active.save(update_fields=["status", "effective_to"])

        self.status = self.Status.ACTIVE
        self.save(update_fields=["status"])

    def archive(self):
        if self.status != self.Status.ACTIVE:
            raise UnprocessableEntity(
                f"Only ACTIVE versions can be archived (current status: {self.status})."
            )
        self.status = self.Status.ARCHIVED
        self.save(update_fields=["status"])


# ---------------------------------------------------------------------------
# DishVersionAllergen  (M2M through table)
# ---------------------------------------------------------------------------

class DishVersionAllergen(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dish_version = models.ForeignKey(
        DishVersion,
        on_delete=models.CASCADE,
        related_name="dish_allergens",
    )
    allergen     = models.ForeignKey(
        Allergen,
        on_delete=models.PROTECT,
        related_name="dish_versions",
    )

    class Meta:
        db_table = "foodservice_dish_version_allergen"
        constraints = [
            models.UniqueConstraint(
                fields=["dish_version", "allergen"],
                name="uq_dish_version_allergen",
            ),
        ]


# ---------------------------------------------------------------------------
# DishPortionSpec
# ---------------------------------------------------------------------------

class DishPortionSpec(models.Model):
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dish_version     = models.ForeignKey(
        DishVersion,
        on_delete=models.CASCADE,
        related_name="portions",
    )
    portion_label    = models.CharField(max_length=100)
    serving_size_qty = models.DecimalField(
        max_digits=10, decimal_places=4,
        validators=[MinValueValidator(Decimal("0.0001"))],
    )
    serving_size_unit  = models.CharField(max_length=50)
    price_multiplier   = models.DecimalField(
        max_digits=10, decimal_places=4,
        default=Decimal("1.0000"),
        validators=[MinValueValidator(Decimal("0"))],
    )

    class Meta:
        db_table = "foodservice_dish_portion_spec"
        ordering = ["portion_label"]

    def __str__(self):
        return self.portion_label


# ---------------------------------------------------------------------------
# DishAddon
# ---------------------------------------------------------------------------

class DishAddon(models.Model):
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dish_version    = models.ForeignKey(
        DishVersion,
        on_delete=models.CASCADE,
        related_name="addons",
    )
    addon_name      = models.CharField(max_length=200)
    additional_cost = models.DecimalField(
        max_digits=10, decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )

    class Meta:
        db_table = "foodservice_dish_addon"
        ordering = ["addon_name"]

    def __str__(self):
        return self.addon_name


# ---------------------------------------------------------------------------
# DishAddonAllergen  (M2M through table)
# ---------------------------------------------------------------------------

class DishAddonAllergen(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dish_addon = models.ForeignKey(
        DishAddon,
        on_delete=models.CASCADE,
        related_name="addon_allergens",
    )
    allergen   = models.ForeignKey(
        Allergen,
        on_delete=models.PROTECT,
        related_name="dish_addons",
    )

    class Meta:
        db_table = "foodservice_dish_addon_allergen"
        constraints = [
            models.UniqueConstraint(
                fields=["dish_addon", "allergen"],
                name="uq_dish_addon_allergen",
            ),
        ]


# ===========================================================================
# MENU MODELS
# ===========================================================================

# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------

class Menu(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="menus",
    )
    name       = models.CharField(max_length=200)
    created_by = models.ForeignKey(
        "iam.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_menus",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "foodservice_menu"
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def active_version(self):
        return self.versions.filter(status=MenuVersion.Status.PUBLISHED).order_by("-created_at").first()


# ---------------------------------------------------------------------------
# MenuVersion
# ---------------------------------------------------------------------------

class MenuVersion(models.Model):
    class Status(models.TextChoices):
        DRAFT       = "DRAFT",       "Draft"
        PUBLISHED   = "PUBLISHED",   "Published"
        UNPUBLISHED = "UNPUBLISHED", "Unpublished"
        ARCHIVED    = "ARCHIVED",    "Archived"

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    menu           = models.ForeignKey(
        Menu,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.PositiveIntegerField()
    status         = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    description    = models.CharField(max_length=1000, blank=True, default="")
    created_by     = models.ForeignKey(
        "iam.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_menu_versions",
    )
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "foodservice_menu_version"
        ordering = ["-version_number"]

    def __str__(self):
        return f"{self.menu.name} v{self.version_number} ({self.status})"

    @transaction.atomic
    def publish(self, user, site_ids):
        """
        Transition DRAFT → PUBLISHED.
        - Validates ≥1 group with ≥1 item; all dish versions must be ACTIVE.
        - Auto-unpublishes any currently PUBLISHED version of the same menu for each site.
        - Creates MenuSiteRelease records for each site_id.
        """
        from iam.models import UserSiteAssignment
        from tenants.models import Site

        if self.status != self.Status.DRAFT:
            raise UnprocessableEntity("Only DRAFT versions can be published.")

        if not site_ids:
            raise UnprocessableEntity("At least one site must be specified for publishing.")

        # Validate groups + items
        groups = list(self.groups.prefetch_related("items__dish_version").all())
        if not groups:
            raise UnprocessableEntity("Menu version must have at least one group to publish.")
        for group in groups:
            items = list(group.items.all())
            if not items:
                raise UnprocessableEntity(
                    f"Group '{group.name}' has no items. All groups must have at least one item."
                )
            for item in items:
                if item.dish_version.status != DishVersion.Status.ACTIVE:
                    raise UnprocessableEntity(
                        f"Dish version '{item.dish_version}' in group '{group.name}' is not ACTIVE."
                    )

        # Resolve sites — scoped to this menu's tenant to prevent cross-tenant targeting
        sites = list(Site.objects.filter(pk__in=site_ids, tenant=self.menu.tenant))
        if len(sites) != len(set(str(s) for s in site_ids)):
            pass  # duplicates collapse naturally
        found_ids = {str(s.pk) for s in sites}
        bad = [str(s) for s in site_ids if str(s) not in found_ids]
        if bad:
            raise UnprocessableEntity(f"Unknown site IDs: {bad}")

        # STAFF site restriction — check user role
        if hasattr(user, 'role') and user.role == user.Role.STAFF:
            assigned = set(
                str(a.site_id)
                for a in UserSiteAssignment.objects.filter(user=user, site__in=sites)
            )
            forbidden = [str(s.pk) for s in sites if str(s.pk) not in assigned]
            if forbidden:
                raise UnprocessableEntity(
                    f"STAFF users can only publish to assigned sites. Forbidden site IDs: {forbidden}"
                )

        # Lock menu row
        Menu.objects.select_for_update().get(pk=self.menu_id)

        # Auto-unpublish currently PUBLISHED versions for same menu on each site
        existing_releases = MenuSiteRelease.objects.select_for_update().filter(
            site__in=sites,
            menu_version__menu=self.menu,
            menu_version__status=self.Status.PUBLISHED,
        ).select_related("menu_version").exclude(menu_version=self)

        versions_to_unpublish = set()
        for rel in existing_releases:
            versions_to_unpublish.add(rel.menu_version_id)

        if versions_to_unpublish:
            MenuVersion.objects.filter(pk__in=versions_to_unpublish).update(
                status=self.Status.UNPUBLISHED
            )

        # Set this version as PUBLISHED
        self.status = self.Status.PUBLISHED
        self.save(update_fields=["status", "updated_at"])

        # Create MenuSiteRelease records (upsert)
        for site in sites:
            MenuSiteRelease.objects.get_or_create(
                menu_version=self,
                site=site,
                defaults={"released_by": user},
            )

    @transaction.atomic
    def unpublish(self):
        """Transition PUBLISHED → UNPUBLISHED."""
        if self.status != self.Status.PUBLISHED:
            raise UnprocessableEntity("Only PUBLISHED versions can be unpublished.")
        self.status = self.Status.UNPUBLISHED
        self.save(update_fields=["status", "updated_at"])

    @transaction.atomic
    def archive(self):
        """Transition UNPUBLISHED → ARCHIVED."""
        if self.status != self.Status.UNPUBLISHED:
            raise UnprocessableEntity("Only UNPUBLISHED versions can be archived.")
        self.status = self.Status.ARCHIVED
        self.save(update_fields=["status", "updated_at"])


# ---------------------------------------------------------------------------
# MenuGroup
# ---------------------------------------------------------------------------

class MenuGroup(models.Model):
    id                 = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    menu_version       = models.ForeignKey(
        MenuVersion,
        on_delete=models.CASCADE,
        related_name="groups",
    )
    name               = models.CharField(max_length=200)
    sort_order         = models.IntegerField(default=0)
    availability_start = models.TimeField(null=True, blank=True)
    availability_end   = models.TimeField(null=True, blank=True)

    class Meta:
        db_table = "foodservice_menu_group"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    def clean(self):
        start = self.availability_start
        end   = self.availability_end
        if (start is None) != (end is None):
            raise ValidationError("Both availability_start and availability_end must be set together.")
        if start is not None and end is not None and start >= end:
            raise ValidationError("availability_start must be before availability_end.")


# ---------------------------------------------------------------------------
# MenuGroupItem
# ---------------------------------------------------------------------------

class MenuGroupItem(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    menu_group   = models.ForeignKey(
        MenuGroup,
        on_delete=models.CASCADE,
        related_name="items",
    )
    dish_version = models.ForeignKey(
        DishVersion,
        on_delete=models.PROTECT,
        related_name="menu_items",
    )
    sort_order   = models.IntegerField(default=0)

    class Meta:
        db_table = "foodservice_menu_group_item"
        ordering = ["sort_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["menu_group", "dish_version"],
                name="uq_menu_group_dish_version",
            ),
        ]

    def __str__(self):
        return f"{self.menu_group.name} → {self.dish_version}"


# ---------------------------------------------------------------------------
# MenuSiteRelease
# ---------------------------------------------------------------------------

class MenuSiteRelease(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    menu_version = models.ForeignKey(
        MenuVersion,
        on_delete=models.CASCADE,
        related_name="site_releases",
    )
    site         = models.ForeignKey(
        "tenants.Site",
        on_delete=models.CASCADE,
        related_name="menu_releases",
    )
    released_by  = models.ForeignKey(
        "iam.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="menu_releases",
    )
    released_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "foodservice_menu_site_release"
        constraints = [
            models.UniqueConstraint(
                fields=["menu_version", "site"],
                name="uq_menu_version_site",
            ),
        ]

    def __str__(self):
        return f"{self.menu_version} @ {self.site}"
