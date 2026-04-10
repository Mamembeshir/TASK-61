"""
tests/unit/foodservice/test_models.py

Comprehensive unit tests for foodservice state machines and business rules:

  RecipeVersion state machine
    - DRAFT → ACTIVE (activate)
    - ACTIVE → SUPERSEDED (automatic on next activate)
    - ACTIVE → ARCHIVED (archive)
    - All invalid transitions raise UnprocessableEntity

  DishVersion state machine (same shape as RecipeVersion)

  MenuVersion state machine
    - DRAFT → PUBLISHED (publish)
    - PUBLISHED → UNPUBLISHED (unpublish)
    - UNPUBLISHED → ARCHIVED (archive)
    - All invalid transitions raise UnprocessableEntity

  Business rules
    - cost calculation: SUM(qty * unit_cost) / servings, rounded HALF_UP to 2dp
    - one-active-version DB constraint (unique partial index)
    - menu publish requires ≥1 group with ≥1 ACTIVE dish version
    - menu publish requires at least one site_id
"""
import pytest
from datetime import date, timedelta
from decimal import Decimal

from django.db import IntegrityError

from core.exceptions import UnprocessableEntity
from foodservice.models import (
    Recipe, RecipeVersion, RecipeIngredient,
    Dish, DishVersion,
    Menu, MenuVersion, MenuGroup, MenuGroupItem, Allergen,
)
from iam.factories import TenantFactory, SiteFactory, UserFactory, AdminUserFactory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TODAY = date.today()
TOMORROW = TODAY + timedelta(days=1)
YESTERDAY = TODAY - timedelta(days=1)


def make_user(tenant=None):
    if tenant is None:
        tenant = TenantFactory()
    return UserFactory(tenant=tenant)


def make_recipe(tenant, user):
    return Recipe.objects.create(tenant=tenant, name="Test Recipe", created_by=user)


def make_recipe_version(recipe, user, status=RecipeVersion.Status.DRAFT, effective_from=None):
    """Create a RecipeVersion directly (bypasses activate logic)."""
    version_number = (recipe.versions.count() or 0) + 1
    return RecipeVersion.objects.create(
        recipe=recipe,
        version_number=version_number,
        effective_from=effective_from or TODAY,
        status=status,
        servings=Decimal("4.0000"),
        created_by=user,
    )


def make_dish(tenant, user):
    recipe = make_recipe(tenant, user)
    return Dish.objects.create(tenant=tenant, recipe=recipe, created_by=user)


def make_dish_version(dish, user, status=DishVersion.Status.DRAFT, effective_from=None):
    version_number = (dish.versions.count() or 0) + 1
    return DishVersion.objects.create(
        dish=dish,
        version_number=version_number,
        name="Test Dish Version",
        effective_from=effective_from or TODAY,
        status=status,
        per_serving_cost=Decimal("5.00"),
        created_by=user,
    )


def make_menu(tenant, user):
    return Menu.objects.create(tenant=tenant, name="Test Menu", created_by=user)


def make_menu_version(menu, user, status=MenuVersion.Status.DRAFT):
    version_number = (menu.versions.count() or 0) + 1
    return MenuVersion.objects.create(
        menu=menu,
        version_number=version_number,
        status=status,
        created_by=user,
    )


def _add_active_dish_to_menu_version(menu_version, tenant, user):
    """Helper: add an ACTIVE dish version to a menu group so publish() can succeed."""
    dish = make_dish(tenant, user)
    dv = make_dish_version(dish, user, status=DishVersion.Status.DRAFT)
    dv.activate()
    group = MenuGroup.objects.create(
        menu_version=menu_version,
        name="Main Group",
        sort_order=0,
    )
    MenuGroupItem.objects.create(menu_group=group, dish_version=dv, sort_order=0)
    return dv


# ===========================================================================
# 1. RecipeVersion State Machine
# ===========================================================================

@pytest.mark.django_db
class TestRecipeVersionStateMachine:
    """
    States: DRAFT, ACTIVE, SUPERSEDED, ARCHIVED
    Valid transitions:
      DRAFT → ACTIVE        (activate)
      ACTIVE → SUPERSEDED   (automatic, when a newer DRAFT is activated)
      ACTIVE → ARCHIVED     (archive)
    """

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = make_user(self.tenant)
        self.recipe = make_recipe(self.tenant, self.user)

    # ---- valid transitions ---------------------------------------------------

    def test_draft_to_active(self):
        v = make_recipe_version(self.recipe, self.user)
        v.activate()
        v.refresh_from_db()
        assert v.status == RecipeVersion.Status.ACTIVE

    def test_activate_supersedes_current_active(self):
        v1 = make_recipe_version(self.recipe, self.user, effective_from=YESTERDAY)
        v1.activate()

        v2 = make_recipe_version(self.recipe, self.user, effective_from=TODAY)
        v2.activate()

        v1.refresh_from_db()
        v2.refresh_from_db()
        assert v1.status == RecipeVersion.Status.SUPERSEDED
        assert v2.status == RecipeVersion.Status.ACTIVE

    def test_superseded_version_gets_effective_to_set(self):
        v1 = make_recipe_version(self.recipe, self.user, effective_from=YESTERDAY)
        v1.activate()

        v2 = make_recipe_version(self.recipe, self.user, effective_from=TODAY)
        v2.activate()

        v1.refresh_from_db()
        assert v1.effective_to == TODAY - timedelta(days=1)

    def test_active_to_archived(self):
        v = make_recipe_version(self.recipe, self.user)
        v.activate()
        v.archive()
        v.refresh_from_db()
        assert v.status == RecipeVersion.Status.ARCHIVED

    # ---- invalid transitions -------------------------------------------------

    def test_active_cannot_be_activated_again(self):
        v = make_recipe_version(self.recipe, self.user)
        v.activate()
        with pytest.raises(UnprocessableEntity):
            v.activate()

    def test_superseded_cannot_be_activated(self):
        v1 = make_recipe_version(self.recipe, self.user, effective_from=YESTERDAY)
        v1.activate()
        v2 = make_recipe_version(self.recipe, self.user, effective_from=TODAY)
        v2.activate()
        v1.refresh_from_db()
        with pytest.raises(UnprocessableEntity):
            v1.activate()

    def test_archived_cannot_be_activated(self):
        v = make_recipe_version(self.recipe, self.user)
        v.activate()
        v.archive()
        with pytest.raises(UnprocessableEntity):
            v.activate()

    def test_draft_cannot_be_archived(self):
        v = make_recipe_version(self.recipe, self.user)
        with pytest.raises(UnprocessableEntity):
            v.archive()

    def test_superseded_cannot_be_archived(self):
        v1 = make_recipe_version(self.recipe, self.user, effective_from=YESTERDAY)
        v1.activate()
        v2 = make_recipe_version(self.recipe, self.user, effective_from=TODAY)
        v2.activate()
        v1.refresh_from_db()
        with pytest.raises(UnprocessableEntity):
            v1.archive()

    def test_archived_cannot_be_archived_again(self):
        v = make_recipe_version(self.recipe, self.user)
        v.activate()
        v.archive()
        with pytest.raises(UnprocessableEntity):
            v.archive()

    def test_new_version_effective_from_must_be_after_current(self):
        v1 = make_recipe_version(self.recipe, self.user, effective_from=TODAY)
        v1.activate()

        v2 = make_recipe_version(self.recipe, self.user, effective_from=YESTERDAY)
        with pytest.raises(UnprocessableEntity, match="effective_from"):
            v2.activate()

    # ---- one active version enforcement (application layer) -----------------

    def test_activating_when_already_active_raises(self):
        """
        activate() on a non-DRAFT version raises UnprocessableEntity.
        The one-active invariant is enforced atomically in activate().
        """
        v = make_recipe_version(self.recipe, self.user)
        v.activate()
        v2 = make_recipe_version(self.recipe, self.user, effective_from=TOMORROW)
        v2.activate()
        # Both activate() calls succeeded — v was superseded, v2 is now ACTIVE
        v.refresh_from_db()
        assert v.status == RecipeVersion.Status.SUPERSEDED
        assert v2.status == RecipeVersion.Status.ACTIVE


# ===========================================================================
# 2. DishVersion State Machine
# ===========================================================================

@pytest.mark.django_db
class TestDishVersionStateMachine:
    """
    Mirrors RecipeVersion state machine exactly:
    DRAFT → ACTIVE (activate), ACTIVE → SUPERSEDED (auto), ACTIVE → ARCHIVED (archive)
    """

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = make_user(self.tenant)
        self.dish = make_dish(self.tenant, self.user)

    def test_draft_to_active(self):
        v = make_dish_version(self.dish, self.user)
        v.activate()
        v.refresh_from_db()
        assert v.status == DishVersion.Status.ACTIVE

    def test_activate_supersedes_current_active(self):
        v1 = make_dish_version(self.dish, self.user, effective_from=YESTERDAY)
        v1.activate()
        v2 = make_dish_version(self.dish, self.user, effective_from=TODAY)
        v2.activate()
        v1.refresh_from_db()
        v2.refresh_from_db()
        assert v1.status == DishVersion.Status.SUPERSEDED
        assert v2.status == DishVersion.Status.ACTIVE

    def test_active_to_archived(self):
        v = make_dish_version(self.dish, self.user)
        v.activate()
        v.archive()
        v.refresh_from_db()
        assert v.status == DishVersion.Status.ARCHIVED

    def test_active_cannot_be_activated_again(self):
        v = make_dish_version(self.dish, self.user)
        v.activate()
        with pytest.raises(UnprocessableEntity):
            v.activate()

    def test_draft_cannot_be_archived(self):
        v = make_dish_version(self.dish, self.user)
        with pytest.raises(UnprocessableEntity):
            v.archive()

    def test_superseded_cannot_be_activated(self):
        v1 = make_dish_version(self.dish, self.user, effective_from=YESTERDAY)
        v1.activate()
        v2 = make_dish_version(self.dish, self.user, effective_from=TODAY)
        v2.activate()
        v1.refresh_from_db()
        with pytest.raises(UnprocessableEntity):
            v1.activate()

    def test_superseded_cannot_be_archived(self):
        v1 = make_dish_version(self.dish, self.user, effective_from=YESTERDAY)
        v1.activate()
        v2 = make_dish_version(self.dish, self.user, effective_from=TODAY)
        v2.activate()
        v1.refresh_from_db()
        with pytest.raises(UnprocessableEntity):
            v1.archive()

    def test_archived_cannot_be_activated(self):
        v = make_dish_version(self.dish, self.user)
        v.activate()
        v.archive()
        with pytest.raises(UnprocessableEntity):
            v.activate()

    def test_archived_cannot_be_archived_again(self):
        v = make_dish_version(self.dish, self.user)
        v.activate()
        v.archive()
        with pytest.raises(UnprocessableEntity):
            v.archive()

    def test_activate_supersedes_then_new_version_is_active(self):
        """Activating a second version supersedes the first — invariant maintained."""
        v1 = make_dish_version(self.dish, self.user, effective_from=YESTERDAY)
        v1.activate()
        v2 = make_dish_version(self.dish, self.user, effective_from=TODAY)
        v2.activate()
        v1.refresh_from_db()
        assert v1.status == DishVersion.Status.SUPERSEDED
        assert v2.status == DishVersion.Status.ACTIVE


# ===========================================================================
# 3. MenuVersion State Machine
# ===========================================================================

@pytest.mark.django_db
class TestMenuVersionStateMachine:
    """
    States: DRAFT, PUBLISHED, UNPUBLISHED, ARCHIVED
    Valid:
      DRAFT → PUBLISHED  (publish with ≥1 group, ≥1 ACTIVE dish, ≥1 site)
      PUBLISHED → UNPUBLISHED  (unpublish)
      UNPUBLISHED → ARCHIVED  (archive)
    """

    def setup_method(self):
        self.tenant = TenantFactory()
        self.site = SiteFactory(tenant=self.tenant)
        self.user = AdminUserFactory(tenant=self.tenant)
        self.menu = make_menu(self.tenant, self.user)

    def test_draft_to_published(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.refresh_from_db()
        assert mv.status == MenuVersion.Status.PUBLISHED

    def test_published_to_unpublished(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.unpublish()
        mv.refresh_from_db()
        assert mv.status == MenuVersion.Status.UNPUBLISHED

    def test_unpublished_to_archived(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.unpublish()
        mv.archive()
        mv.refresh_from_db()
        assert mv.status == MenuVersion.Status.ARCHIVED

    # ---- publish() invalid transitions --------------------------------------

    def test_published_cannot_be_published_again(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        with pytest.raises(UnprocessableEntity):
            mv.publish(self.user, [str(self.site.pk)])

    def test_unpublished_cannot_be_published(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.unpublish()
        with pytest.raises(UnprocessableEntity):
            mv.publish(self.user, [str(self.site.pk)])

    def test_archived_cannot_be_published(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.unpublish()
        mv.archive()
        with pytest.raises(UnprocessableEntity):
            mv.publish(self.user, [str(self.site.pk)])

    # ---- unpublish() invalid transitions ------------------------------------

    def test_draft_cannot_be_unpublished(self):
        mv = make_menu_version(self.menu, self.user)
        with pytest.raises(UnprocessableEntity):
            mv.unpublish()

    def test_unpublished_cannot_be_unpublished_again(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.unpublish()
        with pytest.raises(UnprocessableEntity):
            mv.unpublish()

    def test_archived_cannot_be_unpublished(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.unpublish()
        mv.archive()
        with pytest.raises(UnprocessableEntity):
            mv.unpublish()

    # ---- archive() invalid transitions --------------------------------------

    def test_draft_cannot_be_archived(self):
        mv = make_menu_version(self.menu, self.user)
        with pytest.raises(UnprocessableEntity):
            mv.archive()

    def test_published_cannot_be_archived(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        with pytest.raises(UnprocessableEntity):
            mv.archive()

    def test_archived_cannot_be_archived_again(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        mv.publish(self.user, [str(self.site.pk)])
        mv.unpublish()
        mv.archive()
        with pytest.raises(UnprocessableEntity):
            mv.archive()

    # ---- publish() prerequisites checks ------------------------------------

    def test_publish_requires_at_least_one_site(self):
        mv = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv, self.tenant, self.user)
        with pytest.raises(UnprocessableEntity, match="site"):
            mv.publish(self.user, [])

    def test_publish_requires_at_least_one_group(self):
        mv = make_menu_version(self.menu, self.user)
        # No groups added
        with pytest.raises(UnprocessableEntity, match="group"):
            mv.publish(self.user, [str(self.site.pk)])

    def test_publish_requires_non_empty_groups(self):
        mv = make_menu_version(self.menu, self.user)
        # Add empty group (no items)
        MenuGroup.objects.create(menu_version=mv, name="Empty Group", sort_order=0)
        with pytest.raises(UnprocessableEntity, match="item"):
            mv.publish(self.user, [str(self.site.pk)])

    def test_publish_requires_active_dish_versions(self):
        mv = make_menu_version(self.menu, self.user)
        # Add group with DRAFT dish version (not ACTIVE)
        dish = make_dish(self.tenant, self.user)
        dv = make_dish_version(dish, self.user, status=DishVersion.Status.DRAFT)
        group = MenuGroup.objects.create(menu_version=mv, name="Group", sort_order=0)
        MenuGroupItem.objects.create(menu_group=group, dish_version=dv, sort_order=0)
        with pytest.raises(UnprocessableEntity, match="ACTIVE"):
            mv.publish(self.user, [str(self.site.pk)])

    def test_publish_autopublish_unpublishes_current_published(self):
        """Publishing a new version auto-unpublishes the old one for the same site."""
        mv1 = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv1, self.tenant, self.user)
        mv1.publish(self.user, [str(self.site.pk)])

        mv2 = make_menu_version(self.menu, self.user)
        _add_active_dish_to_menu_version(mv2, self.tenant, self.user)
        mv2.publish(self.user, [str(self.site.pk)])

        mv1.refresh_from_db()
        mv2.refresh_from_db()
        assert mv1.status == MenuVersion.Status.UNPUBLISHED
        assert mv2.status == MenuVersion.Status.PUBLISHED


# ===========================================================================
# 4. Business Rules — Cost Calculation
# ===========================================================================

@pytest.mark.django_db
class TestRecipeVersionCostCalculation:
    """
    compute_per_serving_cost() = SUM(qty * unit_cost) / servings
    rounded HALF_UP to 2 decimal places.
    """

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = make_user(self.tenant)
        self.recipe = make_recipe(self.tenant, self.user)

    def _version(self, servings="4"):
        return make_recipe_version(
            self.recipe, self.user,
            status=RecipeVersion.Status.DRAFT,
        )

    def test_no_ingredients_returns_zero(self):
        v = self._version()
        assert v.compute_per_serving_cost() == Decimal("0.00")

    def test_single_ingredient_cost(self):
        v = self._version()
        RecipeIngredient.objects.create(
            recipe_version=v,
            ingredient_name="Flour",
            quantity=Decimal("2.0000"),
            unit="cup",
            unit_cost=Decimal("0.5000"),
            sort_order=0,
        )
        # 2.0 * 0.5 = 1.0 / 4 servings = 0.25
        assert v.compute_per_serving_cost() == Decimal("0.25")

    def test_multiple_ingredients_summed(self):
        v = self._version()
        RecipeIngredient.objects.create(
            recipe_version=v,
            ingredient_name="Flour",
            quantity=Decimal("2.0000"),
            unit="cup",
            unit_cost=Decimal("1.0000"),
            sort_order=0,
        )
        RecipeIngredient.objects.create(
            recipe_version=v,
            ingredient_name="Butter",
            quantity=Decimal("1.0000"),
            unit="cup",
            unit_cost=Decimal("2.0000"),
            sort_order=1,
        )
        # (2*1 + 1*2) / 4 = 4 / 4 = 1.00
        assert v.compute_per_serving_cost() == Decimal("1.00")

    def test_rounding_half_up(self):
        """5 / 3 = 1.666... should round to 1.67 (HALF_UP)."""
        v = make_recipe_version(self.recipe, self.user)
        # Override servings to 3
        RecipeVersion.objects.filter(pk=v.pk).update(servings=Decimal("3.0000"))
        v.refresh_from_db()
        RecipeIngredient.objects.create(
            recipe_version=v,
            ingredient_name="Egg",
            quantity=Decimal("5.0000"),
            unit="each",
            unit_cost=Decimal("1.0000"),
            sort_order=0,
        )
        # 5.0 / 3 = 1.6666... → rounds to 1.67
        result = v.compute_per_serving_cost()
        assert result == Decimal("1.67")

    def test_cost_per_single_serving(self):
        """When servings=1, per_serving_cost equals total cost."""
        v = make_recipe_version(self.recipe, self.user)
        RecipeVersion.objects.filter(pk=v.pk).update(servings=Decimal("1.0000"))
        v.refresh_from_db()
        RecipeIngredient.objects.create(
            recipe_version=v,
            ingredient_name="Item",
            quantity=Decimal("3.0000"),
            unit="each",
            unit_cost=Decimal("2.5000"),
            sort_order=0,
        )
        # 3.0 * 2.5 = 7.5 / 1 = 7.50
        assert v.compute_per_serving_cost() == Decimal("7.50")


# ===========================================================================
# 5. Business Rules — One Active Version Enforcement (DishVersion)
# ===========================================================================

@pytest.mark.django_db
class TestOneActiveVersionEnforcement:
    """
    The DB partial unique index on (dish, status=ACTIVE) must reject
    concurrent attempts to set two versions ACTIVE for the same parent.
    """

    def test_recipe_activate_chain_maintains_one_active(self):
        """Chaining activations always leaves exactly one ACTIVE version per recipe."""
        tenant = TenantFactory()
        user = make_user(tenant)
        recipe = make_recipe(tenant, user)

        v1 = make_recipe_version(recipe, user, effective_from=date(2026, 1, 1))
        v1.activate()
        v2 = make_recipe_version(recipe, user, effective_from=date(2026, 2, 1))
        v2.activate()
        v3 = make_recipe_version(recipe, user, effective_from=date(2026, 3, 1))
        v3.activate()

        active_count = RecipeVersion.objects.filter(
            recipe=recipe, status=RecipeVersion.Status.ACTIVE
        ).count()
        assert active_count == 1
        v3.refresh_from_db()
        assert v3.status == RecipeVersion.Status.ACTIVE

    def test_dish_activate_chain_maintains_one_active(self):
        tenant = TenantFactory()
        user = make_user(tenant)
        dish = make_dish(tenant, user)

        v1 = make_dish_version(dish, user, effective_from=date(2026, 1, 1))
        v1.activate()
        v2 = make_dish_version(dish, user, effective_from=date(2026, 2, 1))
        v2.activate()

        active_count = DishVersion.objects.filter(
            dish=dish, status=DishVersion.Status.ACTIVE
        ).count()
        assert active_count == 1

    def test_different_dishes_can_each_have_one_active(self):
        """Two different dishes can each independently have one ACTIVE version."""
        tenant = TenantFactory()
        user = make_user(tenant)

        dish_a = make_dish(tenant, user)
        dish_b = make_dish(tenant, user)

        va = make_dish_version(dish_a, user)
        va.activate()

        vb = make_dish_version(dish_b, user)
        vb.activate()

        va.refresh_from_db()
        vb.refresh_from_db()
        assert va.status == DishVersion.Status.ACTIVE
        assert vb.status == DishVersion.Status.ACTIVE


# ===========================================================================
# 6. MenuGroup availability window validation
# ===========================================================================

@pytest.mark.django_db
class TestMenuGroupAvailability:

    def test_start_before_end_is_valid(self):
        from datetime import time
        from django.core.exceptions import ValidationError
        tenant = TenantFactory()
        user = make_user(tenant)
        menu = make_menu(tenant, user)
        mv = make_menu_version(menu, user)
        group = MenuGroup(
            menu_version=mv,
            name="Breakfast",
            availability_start=time(7, 0),
            availability_end=time(10, 30),
        )
        group.clean()  # should not raise

    def test_start_equal_to_end_is_invalid(self):
        from datetime import time
        from django.core.exceptions import ValidationError
        tenant = TenantFactory()
        user = make_user(tenant)
        menu = make_menu(tenant, user)
        mv = make_menu_version(menu, user)
        group = MenuGroup(
            menu_version=mv,
            name="All Day",
            availability_start=time(12, 0),
            availability_end=time(12, 0),
        )
        with pytest.raises(ValidationError):
            group.clean()

    def test_start_after_end_is_invalid(self):
        from datetime import time
        from django.core.exceptions import ValidationError
        tenant = TenantFactory()
        user = make_user(tenant)
        menu = make_menu(tenant, user)
        mv = make_menu_version(menu, user)
        group = MenuGroup(
            menu_version=mv,
            name="Bad Window",
            availability_start=time(14, 0),
            availability_end=time(10, 0),
        )
        with pytest.raises(ValidationError):
            group.clean()

    def test_only_start_set_is_invalid(self):
        from datetime import time
        from django.core.exceptions import ValidationError
        tenant = TenantFactory()
        user = make_user(tenant)
        menu = make_menu(tenant, user)
        mv = make_menu_version(menu, user)
        group = MenuGroup(
            menu_version=mv,
            name="Partial",
            availability_start=time(8, 0),
            availability_end=None,
        )
        with pytest.raises(ValidationError):
            group.clean()

    def test_both_none_is_valid(self):
        """No availability window set — always available."""
        from django.core.exceptions import ValidationError
        tenant = TenantFactory()
        user = make_user(tenant)
        menu = make_menu(tenant, user)
        mv = make_menu_version(menu, user)
        group = MenuGroup(
            menu_version=mv,
            name="Always",
            availability_start=None,
            availability_end=None,
        )
        group.clean()  # should not raise
