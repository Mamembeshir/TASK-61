"""
tests/api/foodservice/test_recipes.py

Integration tests for the Recipe management API (Step 7).

Endpoints under test:
  POST   /api/v1/foodservice/recipes/
  GET    /api/v1/foodservice/recipes/
  GET    /api/v1/foodservice/recipes/{id}/
  POST   /api/v1/foodservice/recipes/{id}/versions/
  POST   /api/v1/foodservice/recipes/{id}/versions/{vid}/activate/
  GET    /api/v1/foodservice/recipes/{id}/versions/
  GET    /api/v1/foodservice/recipes/{id}/versions/{vid}/
  DELETE /api/v1/foodservice/recipes/{id}/versions/{vid}/
"""
import datetime
from decimal import Decimal

import pytest

from foodservice.models import Recipe, RecipeVersion, RecipeIngredient, RecipeStep

pytestmark = [pytest.mark.api, pytest.mark.django_db]

BASE      = "/api/v1/foodservice/recipes/"
TODAY     = datetime.date.today()
TOMORROW  = TODAY + datetime.timedelta(days=1)
YESTERDAY = TODAY - datetime.timedelta(days=1)


# ---------------------------------------------------------------------------
# Payload helpers
# ---------------------------------------------------------------------------

_DEFAULT_INGREDIENTS = [
    {"ingredient_name": "Flour",  "quantity": "2.0000", "unit": "cup",  "unit_cost": "0.5000", "sort_order": 0},
    {"ingredient_name": "Egg",    "quantity": "1.0000", "unit": "each", "unit_cost": "0.3000", "sort_order": 1},
    {"ingredient_name": "Butter", "quantity": "0.2500", "unit": "cup",  "unit_cost": "1.2000", "sort_order": 2},
]
_DEFAULT_STEPS = [
    {"step_number": 1, "instruction": "Mix dry ingredients."},
    {"step_number": 2, "instruction": "Add wet ingredients and stir."},
]


def recipe_payload(name="Pancakes", effective_from=None, servings="4", ingredients=None, steps=None):
    return {
        "name": name,
        "effective_from": str(effective_from or TODAY),
        "servings": servings,
        # Use `is not None` so callers can explicitly pass [] to test empty-list validation
        "ingredients": ingredients if ingredients is not None else _DEFAULT_INGREDIENTS,
        "steps":       steps       if steps       is not None else _DEFAULT_STEPS,
    }


def version_payload(effective_from=None, servings="4", ingredients=None, steps=None):
    return {
        "effective_from": str(effective_from or TOMORROW),
        "servings": servings,
        "ingredients": ingredients or [
            {"ingredient_name": "Oat",  "quantity": "1.0000", "unit": "cup", "unit_cost": "0.4000", "sort_order": 0},
        ],
        "steps": steps or [
            {"step_number": 1, "instruction": "Cook oats."},
        ],
    }


# ---------------------------------------------------------------------------
# 1. Create recipe: 3 ingredients, 2 steps → DRAFT version exists
# ---------------------------------------------------------------------------

class TestCreateRecipe:
    def test_create_recipe_returns_201_with_draft_version(self, admin_client, assert_status):
        resp = admin_client.post(BASE, data=recipe_payload(), format="json")
        assert_status(resp, 201)

        data = resp.json()
        assert data["name"] == "Pancakes"
        # First version is DRAFT (not yet activated)
        # active_version is None since it's DRAFT
        assert data["active_version"] is None

        recipe = Recipe.objects.get(pk=data["id"])
        assert recipe.versions.count() == 1
        v = recipe.versions.first()
        assert v.status == RecipeVersion.Status.DRAFT
        assert v.version_number == 1
        assert v.ingredients.count() == 3
        assert v.steps.count() == 2

    def test_courier_gets_403(self, courier_client, assert_status):
        resp = courier_client.post(BASE, data=recipe_payload(), format="json")
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 2. Activate version → ACTIVE, per_serving_cost computed correctly
# ---------------------------------------------------------------------------

class TestActivateVersion:
    def _create_and_get_version(self, admin_client):
        resp = admin_client.post(BASE, data=recipe_payload(), format="json")
        recipe_id = resp.json()["id"]
        recipe = Recipe.objects.get(pk=recipe_id)
        version = recipe.versions.first()
        return recipe_id, version

    def test_activate_transitions_to_active(self, admin_client, assert_status):
        recipe_id, version = self._create_and_get_version(admin_client)
        url = f"{BASE}{recipe_id}/versions/{version.pk}/activate/"

        resp = admin_client.post(url, format="json")
        assert_status(resp, 200)

        version.refresh_from_db()
        assert version.status == RecipeVersion.Status.ACTIVE

    def test_activated_version_appears_in_recipe_detail(self, admin_client, assert_status):
        recipe_id, version = self._create_and_get_version(admin_client)
        admin_client.post(f"{BASE}{recipe_id}/versions/{version.pk}/activate/", format="json")

        resp = admin_client.get(f"{BASE}{recipe_id}/")
        assert_status(resp, 200)
        data = resp.json()
        assert data["active_version_number"] == 1
        assert data["active_version"] is not None


# ---------------------------------------------------------------------------
# 3. Per-serving cost test cases
# ---------------------------------------------------------------------------

class TestPerServingCost:
    """
    Test case 1: (2 oz @ $1.50) + (1 cup @ $3.00) / 4 servings
                 = (3.00 + 3.00) / 4 = 6.00 / 4 = $1.50

    Test case 2: (0.5 lb @ $8.00) + (3 tbsp @ $0.25) / 2 servings
                 = (4.00 + 0.75) / 2 = 4.75 / 2 = $2.375 → $2.38 (ROUND_HALF_UP)

    Test case 3: (1 each @ $10.00) / 1 serving = $10.00
    """

    def _make_recipe_active(self, admin_client, ingredients, servings):
        payload = recipe_payload(
            servings=str(servings),
            ingredients=ingredients,
            steps=[{"step_number": 1, "instruction": "Cook."}],
        )
        resp = admin_client.post(BASE, data=payload, format="json")
        assert resp.status_code == 201
        recipe_id = resp.json()["id"]
        recipe = Recipe.objects.get(pk=recipe_id)
        version = recipe.versions.first()
        admin_client.post(f"{BASE}{recipe_id}/versions/{version.pk}/activate/", format="json")
        return recipe_id

    def test_case_1(self, admin_client):
        recipe_id = self._make_recipe_active(
            admin_client,
            ingredients=[
                {"ingredient_name": "Butter", "quantity": "2.0000", "unit": "oz",  "unit_cost": "1.5000", "sort_order": 0},
                {"ingredient_name": "Cream",  "quantity": "1.0000", "unit": "cup", "unit_cost": "3.0000", "sort_order": 1},
            ],
            servings="4",
        )
        recipe = Recipe.objects.get(pk=recipe_id)
        cost = recipe.active_version.compute_per_serving_cost()
        assert cost == Decimal("1.50")

    def test_case_2(self, admin_client):
        recipe_id = self._make_recipe_active(
            admin_client,
            ingredients=[
                {"ingredient_name": "Beef",   "quantity": "0.5000", "unit": "lb",   "unit_cost": "8.0000", "sort_order": 0},
                {"ingredient_name": "Pepper", "quantity": "3.0000", "unit": "tbsp", "unit_cost": "0.2500", "sort_order": 1},
            ],
            servings="2",
        )
        recipe = Recipe.objects.get(pk=recipe_id)
        cost = recipe.active_version.compute_per_serving_cost()
        assert cost == Decimal("2.38")

    def test_case_3(self, admin_client):
        recipe_id = self._make_recipe_active(
            admin_client,
            ingredients=[
                {"ingredient_name": "Egg", "quantity": "1.0000", "unit": "each", "unit_cost": "10.0000", "sort_order": 0},
            ],
            servings="1",
        )
        recipe = Recipe.objects.get(pk=recipe_id)
        cost = recipe.active_version.compute_per_serving_cost()
        assert cost == Decimal("10.00")


# ---------------------------------------------------------------------------
# 4. Activate second version → first auto-superseded with correct effective_to
# ---------------------------------------------------------------------------

class TestSupersession:
    def test_second_activation_supersedes_first(self, admin_client, assert_status):
        # Create and activate v1 with effective_from = TODAY
        resp = admin_client.post(BASE, data=recipe_payload(effective_from=TODAY), format="json")
        recipe_id = resp.json()["id"]
        recipe    = Recipe.objects.get(pk=recipe_id)
        v1        = recipe.versions.first()
        admin_client.post(f"{BASE}{recipe_id}/versions/{v1.pk}/activate/", format="json")

        # Create v2 with effective_from = TOMORROW
        resp2 = admin_client.post(
            f"{BASE}{recipe_id}/versions/",
            data=version_payload(effective_from=TOMORROW),
            format="json",
        )
        assert_status(resp2, 201)
        v2_id = resp2.json()["id"]

        # Activate v2
        resp3 = admin_client.post(
            f"{BASE}{recipe_id}/versions/{v2_id}/activate/",
            format="json",
        )
        assert_status(resp3, 200)

        # v1 is now SUPERSEDED with effective_to = TOMORROW - 1 day = TODAY
        v1.refresh_from_db()
        assert v1.status == RecipeVersion.Status.SUPERSEDED
        assert v1.effective_to == TOMORROW - datetime.timedelta(days=1)

        # v2 is ACTIVE
        v2 = RecipeVersion.objects.get(pk=v2_id)
        assert v2.status == RecipeVersion.Status.ACTIVE

        # Recipe detail shows v2 as active
        detail = admin_client.get(f"{BASE}{recipe_id}/").json()
        assert detail["active_version_number"] == 2


# ---------------------------------------------------------------------------
# 5. Cannot activate with effective_from <= current active's effective_from
# ---------------------------------------------------------------------------

class TestActivationDateValidation:
    def test_cannot_activate_with_earlier_or_equal_effective_from(self, admin_client, assert_status):
        # Create and activate v1 with TODAY
        resp = admin_client.post(BASE, data=recipe_payload(effective_from=TODAY), format="json")
        recipe_id = resp.json()["id"]
        recipe    = Recipe.objects.get(pk=recipe_id)
        v1        = recipe.versions.first()
        admin_client.post(f"{BASE}{recipe_id}/versions/{v1.pk}/activate/", format="json")

        # Create v2 with effective_from = TODAY (same date — not strictly after)
        resp2 = admin_client.post(
            f"{BASE}{recipe_id}/versions/",
            data=version_payload(effective_from=TODAY),
            format="json",
        )
        assert_status(resp2, 201)
        v2_id = resp2.json()["id"]

        # Trying to activate v2 should fail with 422
        resp3 = admin_client.post(
            f"{BASE}{recipe_id}/versions/{v2_id}/activate/",
            format="json",
        )
        assert_status(resp3, 422)

        # v1 remains ACTIVE
        v1.refresh_from_db()
        assert v1.status == RecipeVersion.Status.ACTIVE


# ---------------------------------------------------------------------------
# 6. Delete DRAFT → gone
# ---------------------------------------------------------------------------

class TestDeleteVersion:
    def test_delete_draft_returns_204(self, admin_client, assert_status):
        resp = admin_client.post(BASE, data=recipe_payload(), format="json")
        recipe_id = resp.json()["id"]
        recipe    = Recipe.objects.get(pk=recipe_id)
        version   = recipe.versions.first()

        del_resp = admin_client.delete(
            f"{BASE}{recipe_id}/versions/{version.pk}/",
        )
        assert_status(del_resp, 204)
        assert not RecipeVersion.objects.filter(pk=version.pk).exists()

    def test_delete_active_returns_422(self, admin_client, assert_status):
        resp = admin_client.post(BASE, data=recipe_payload(), format="json")
        recipe_id = resp.json()["id"]
        recipe    = Recipe.objects.get(pk=recipe_id)
        version   = recipe.versions.first()

        # Activate first
        admin_client.post(f"{BASE}{recipe_id}/versions/{version.pk}/activate/", format="json")

        del_resp = admin_client.delete(
            f"{BASE}{recipe_id}/versions/{version.pk}/",
        )
        assert_status(del_resp, 422)
        assert RecipeVersion.objects.filter(pk=version.pk).exists()


# ---------------------------------------------------------------------------
# 7. Validation: 0 steps → 422
# ---------------------------------------------------------------------------

class TestValidation:
    def test_zero_steps_returns_422(self, admin_client, assert_status):
        payload = recipe_payload(steps=[])
        resp = admin_client.post(BASE, data=payload, format="json")
        assert_status(resp, 422)

    def test_zero_ingredients_returns_422(self, admin_client, assert_status):
        payload = recipe_payload(ingredients=[])
        resp = admin_client.post(BASE, data=payload, format="json")
        assert_status(resp, 422)

    def test_ingredient_quantity_zero_returns_422(self, admin_client, assert_status):
        payload = recipe_payload(
            ingredients=[
                {"ingredient_name": "Salt", "quantity": "0.0000", "unit": "tsp", "unit_cost": "0.0100"},
            ]
        )
        resp = admin_client.post(BASE, data=payload, format="json")
        assert_status(resp, 422)

    def test_ingredient_quantity_negative_returns_422(self, admin_client, assert_status):
        payload = recipe_payload(
            ingredients=[
                {"ingredient_name": "Salt", "quantity": "-1.0000", "unit": "tsp", "unit_cost": "0.0100"},
            ]
        )
        resp = admin_client.post(BASE, data=payload, format="json")
        assert_status(resp, 422)


# ---------------------------------------------------------------------------
# 8. Site-scoping activation-mode consistency
# ---------------------------------------------------------------------------

class TestActivationModeMixingRejected:
    """
    A recipe cannot have both tenant-wide (site=None) and site-scoped ACTIVE
    versions simultaneously.  activate() must reject the conflicting call with 422.
    """

    def _make_recipe_with_two_draft_versions(self, admin_client):
        """Create a recipe with v1 already in it; return (recipe_id, v1, url_base)."""
        resp = admin_client.post(BASE, data=recipe_payload(effective_from=TODAY), format="json")
        recipe_id = resp.json()["id"]
        recipe = Recipe.objects.get(pk=recipe_id)
        v1 = recipe.versions.first()
        url = f"{BASE}{recipe_id}/versions/"
        return recipe_id, v1, url

    def test_site_scoped_activation_after_tenant_wide_returns_422(
        self, admin_client, site, assert_status
    ):
        """Activating site-scoped v2 while v1 is tenant-wide ACTIVE → 422."""
        recipe_id, v1, versions_url = self._make_recipe_with_two_draft_versions(admin_client)

        # Activate v1 tenant-wide (site=None)
        resp = admin_client.post(
            f"{BASE}{recipe_id}/versions/{v1.pk}/activate/",
            format="json",
        )
        assert_status(resp, 200)

        # Create v2
        resp2 = admin_client.post(
            versions_url,
            data=version_payload(effective_from=TOMORROW),
            format="json",
        )
        assert_status(resp2, 201)
        v2_id = resp2.json()["id"]

        # Attempt to activate v2 for a specific site → must be rejected
        resp3 = admin_client.post(
            f"{BASE}{recipe_id}/versions/{v2_id}/activate/",
            data={"site_id": str(site.pk)},
            format="json",
        )
        assert_status(resp3, 422)

        # v1 remains ACTIVE
        v1.refresh_from_db()
        assert v1.status == RecipeVersion.Status.ACTIVE

    def test_tenant_wide_activation_after_site_scoped_returns_422(
        self, admin_client, site, assert_status
    ):
        """Activating tenant-wide v2 while v1 is site-scoped ACTIVE → 422."""
        recipe_id, v1, versions_url = self._make_recipe_with_two_draft_versions(admin_client)

        # Activate v1 for a specific site
        resp = admin_client.post(
            f"{BASE}{recipe_id}/versions/{v1.pk}/activate/",
            data={"site_id": str(site.pk)},
            format="json",
        )
        assert_status(resp, 200)

        # Create v2
        resp2 = admin_client.post(
            versions_url,
            data=version_payload(effective_from=TOMORROW),
            format="json",
        )
        assert_status(resp2, 201)
        v2_id = resp2.json()["id"]

        # Attempt to activate v2 tenant-wide (no site_id) → must be rejected
        resp3 = admin_client.post(
            f"{BASE}{recipe_id}/versions/{v2_id}/activate/",
            format="json",
        )
        assert_status(resp3, 422)

        # v1 remains ACTIVE
        v1.refresh_from_db()
        assert v1.status == RecipeVersion.Status.ACTIVE
