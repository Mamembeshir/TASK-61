"""
tests/api/foodservice/test_dishes.py

Integration tests for Dish management API (Step 8).

Endpoints under test:
  GET    /api/v1/foodservice/allergens/
  POST   /api/v1/foodservice/dishes/
  GET    /api/v1/foodservice/dishes/
  GET    /api/v1/foodservice/dishes/{id}/
  POST   /api/v1/foodservice/dishes/{id}/versions/
  POST   /api/v1/foodservice/dishes/{id}/versions/{vid}/activate/
"""
import datetime
from decimal import Decimal

import pytest

from foodservice.models import (
    Allergen, Dish, DishVersion, DishVersionAllergen,
    DishPortionSpec, DishAddon, Recipe, RecipeVersion, RecipeIngredient, RecipeStep,
)

pytestmark = [pytest.mark.api, pytest.mark.django_db]

DISHES_URL    = "/api/v1/foodservice/dishes/"
ALLERGENS_URL = "/api/v1/foodservice/allergens/"
TODAY         = datetime.date.today()
TOMORROW      = TODAY + datetime.timedelta(days=1)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def seed_allergens():
    """Ensure all 15 allergen records exist for every test."""
    from foodservice.management.commands.seed_allergens import ALLERGENS
    for code, name in ALLERGENS:
        Allergen.objects.get_or_create(code=code, defaults={"name": name})


@pytest.fixture
def allergen(code="MILK"):
    return Allergen.objects.get(code=code)


@pytest.fixture
def milk(db):
    return Allergen.objects.get(code="MILK")


@pytest.fixture
def gluten(db):
    return Allergen.objects.get(code="GLUTEN")


@pytest.fixture
def peanuts(db):
    return Allergen.objects.get(code="PEANUTS")


@pytest.fixture
def none_allergen(db):
    return Allergen.objects.get(code="NONE")


@pytest.fixture
def active_recipe(tenant, admin_user):
    """A Recipe with one ACTIVE version (cost = $5.00 per serving)."""
    recipe = Recipe.objects.create(tenant=tenant, name="Test Recipe", created_by=admin_user)
    version = RecipeVersion.objects.create(
        recipe=recipe, version_number=1,
        effective_from=TODAY, servings=Decimal("2"),
        status="DRAFT", created_by=admin_user,
    )
    RecipeIngredient.objects.create(
        recipe_version=version, ingredient_name="Sugar",
        quantity=Decimal("1"), unit="cup", unit_cost=Decimal("10.00"),
    )
    RecipeStep.objects.create(
        recipe_version=version, step_number=1, instruction="Cook."
    )
    version.activate()
    return recipe


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def dish_payload(milk, gluten, *, recipe_id=None, per_serving_cost=None,
                 allergen_ids=None, calories=None, protein_g=None,
                 carbs_g=None, fat_g=None, portions=None, addons=None,
                 effective_from=None):
    payload = {
        "name": "Pancake Stack",
        "description": "Fluffy pancakes",
        "effective_from": str(effective_from or TODAY),
        "allergen_ids": allergen_ids if allergen_ids is not None
                        else [str(milk.pk), str(gluten.pk)],
    }
    if recipe_id is not None:
        payload["recipe_id"] = str(recipe_id)
    if per_serving_cost is not None:
        payload["per_serving_cost"] = str(per_serving_cost)
    if calories is not None:
        payload["calories"] = str(calories)
    if protein_g is not None:
        payload["protein_g"] = str(protein_g)
    if carbs_g is not None:
        payload["carbs_g"] = str(carbs_g)
    if fat_g is not None:
        payload["fat_g"] = str(fat_g)
    if portions is not None:
        payload["portions"] = portions
    if addons is not None:
        payload["addons"] = addons
    return payload


# ---------------------------------------------------------------------------
# 1. Create dish with MILK and GLUTEN allergens → saved correctly
# ---------------------------------------------------------------------------

class TestCreateDishAllergens:
    def test_create_dish_with_milk_and_gluten(self, admin_client, milk, gluten, assert_status):
        payload = dish_payload(milk, gluten, per_serving_cost="3.50")
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)

        data = resp.json()
        dish = Dish.objects.get(pk=data["id"])
        version = dish.versions.first()
        allergen_codes = set(
            dv.allergen.code for dv in version.dish_allergens.select_related("allergen").all()
        )
        assert allergen_codes == {"MILK", "GLUTEN"}


# ---------------------------------------------------------------------------
# 2. Create dish with no allergens → 422
# ---------------------------------------------------------------------------

class TestNoAllergens:
    def test_no_allergens_returns_422(self, admin_client, milk, gluten, assert_status):
        payload = dish_payload(milk, gluten, allergen_ids=[], per_serving_cost="3.50")
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 422)


# ---------------------------------------------------------------------------
# 3. Create dish with NONE + MILK → 422 (NONE cannot combine)
# ---------------------------------------------------------------------------

class TestNoneAllergenCombination:
    def test_none_plus_milk_returns_422(self, admin_client, milk, gluten, none_allergen, assert_status):
        payload = dish_payload(
            milk, gluten,
            allergen_ids=[str(none_allergen.pk), str(milk.pk)],
            per_serving_cost="3.50",
        )
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 422)

    def test_none_alone_is_valid(self, admin_client, milk, gluten, none_allergen, assert_status):
        payload = dish_payload(
            milk, gluten,
            allergen_ids=[str(none_allergen.pk)],
            per_serving_cost="3.50",
        )
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)


# ---------------------------------------------------------------------------
# 4. Nutrition: provide calories only → 422
# ---------------------------------------------------------------------------

class TestNutritionValidation:
    def test_partial_nutrition_returns_422(self, admin_client, milk, gluten, assert_status):
        payload = dish_payload(milk, gluten, per_serving_cost="3.50", calories="350")
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 422)

    def test_all_four_nutrition_fields_returns_201(self, admin_client, milk, gluten, assert_status):
        payload = dish_payload(
            milk, gluten, per_serving_cost="3.50",
            calories="350", protein_g="12", carbs_g="45", fat_g="8",
        )
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)
        data = resp.json()
        av = data["active_version"]
        assert av is None  # still DRAFT
        # Check stored on version
        version = Dish.objects.get(pk=data["id"]).versions.first()
        assert version.calories == Decimal("350")
        assert version.has_nutrition is True

    def test_no_nutrition_returns_201(self, admin_client, milk, gluten, assert_status):
        payload = dish_payload(milk, gluten, per_serving_cost="3.50")
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)
        version = Dish.objects.get(pk=resp.json()["id"]).versions.first()
        assert version.calories is None
        assert version.has_nutrition is False


# ---------------------------------------------------------------------------
# 5. Dish with recipe → per_serving_cost auto-set from active version
# ---------------------------------------------------------------------------

class TestRecipeCostSnapshot:
    def test_recipe_linked_cost_auto_computed(self, admin_client, milk, gluten,
                                               active_recipe, assert_status):
        # active_recipe: 1 cup sugar @ $10.00 / 2 servings = $5.00
        payload = dish_payload(milk, gluten, recipe_id=active_recipe.pk)
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)

        version = Dish.objects.get(pk=resp.json()["id"]).versions.first()
        assert version.per_serving_cost == Decimal("5.00")

    def test_recipe_cost_overrides_manual_input(self, admin_client, milk, gluten,
                                                 active_recipe, assert_status):
        # Even if per_serving_cost is given, recipe cost takes precedence
        payload = dish_payload(milk, gluten, recipe_id=active_recipe.pk,
                               per_serving_cost="99.99")
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)
        version = Dish.objects.get(pk=resp.json()["id"]).versions.first()
        assert version.per_serving_cost == Decimal("5.00")  # not 99.99


# ---------------------------------------------------------------------------
# 6. Dish without recipe: per_serving_cost required
# ---------------------------------------------------------------------------

class TestManualCostRequired:
    def test_no_recipe_no_cost_returns_422(self, admin_client, milk, gluten, assert_status):
        payload = dish_payload(milk, gluten)  # no recipe_id, no per_serving_cost
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 422)

    def test_no_recipe_with_cost_returns_201(self, admin_client, milk, gluten, assert_status):
        payload = dish_payload(milk, gluten, per_serving_cost="4.25")
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)


# ---------------------------------------------------------------------------
# 7. Portion specs and addons saved and returned correctly
# ---------------------------------------------------------------------------

class TestPortionsAndAddons:
    def test_portions_and_addons_saved(self, admin_client, milk, gluten,
                                       none_allergen, assert_status):
        payload = dish_payload(
            milk, gluten,
            per_serving_cost="5.00",
            portions=[
                {"portion_label": "Small",  "serving_size_qty": "150", "serving_size_unit": "g", "price_multiplier": "0.75"},
                {"portion_label": "Large",  "serving_size_qty": "300", "serving_size_unit": "g", "price_multiplier": "1.50"},
            ],
            addons=[
                {
                    "addon_name": "Extra Syrup",
                    "additional_cost": "0.50",
                    "allergen_ids": [str(none_allergen.pk)],
                },
            ],
        )
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)

        dish    = Dish.objects.get(pk=resp.json()["id"])
        version = dish.versions.first()

        assert version.portions.count() == 2
        labels  = {p.portion_label for p in version.portions.all()}
        assert labels == {"Small", "Large"}

        assert version.addons.count() == 1
        addon = version.addons.first()
        assert addon.addon_name == "Extra Syrup"
        assert addon.additional_cost == Decimal("0.50")
        assert addon.addon_allergens.filter(allergen__code="NONE").exists()

    def test_detail_endpoint_returns_portions_and_addons(self, admin_client, milk, gluten,
                                                          none_allergen, assert_status):
        payload = dish_payload(
            milk, gluten,
            per_serving_cost="5.00",
            portions=[{"portion_label": "Regular", "serving_size_qty": "200", "serving_size_unit": "g"}],
            addons=[{"addon_name": "Whipped Cream", "additional_cost": "1.00",
                     "allergen_ids": [str(milk.pk)]}],
        )
        resp = admin_client.post(DISHES_URL, data=payload, format="json")
        assert_status(resp, 201)

        detail = admin_client.get(f"{DISHES_URL}{resp.json()['id']}/")
        assert_status(detail, 200)
        # Active version is DRAFT (not activated), so active_version is None
        # Use versions endpoint to verify
        v_resp = admin_client.get(f"{DISHES_URL}{resp.json()['id']}/versions/")
        assert_status(v_resp, 200)
        v = v_resp.json()["results"][0]
        assert len(v["portions"]) == 1
        assert v["portions"][0]["portion_label"] == "Regular"
        assert len(v["addons"]) == 1
        assert v["addons"][0]["addon_name"] == "Whipped Cream"
        assert any(a["code"] == "MILK" for a in v["addons"][0]["allergens"])


# ---------------------------------------------------------------------------
# 8. Activate new version → previous superseded
# ---------------------------------------------------------------------------

class TestActivation:
    def _create_dish(self, client, milk, gluten, effective_from):
        payload = dish_payload(milk, gluten, per_serving_cost="3.00",
                               effective_from=effective_from)
        return client.post(DISHES_URL, data=payload, format="json")

    def test_activate_then_supersede(self, admin_client, milk, gluten, assert_status):
        resp1 = self._create_dish(admin_client, milk, gluten, TODAY)
        dish_id = resp1.json()["id"]
        dish    = Dish.objects.get(pk=dish_id)
        v1      = dish.versions.first()

        # Activate v1
        admin_client.post(f"{DISHES_URL}{dish_id}/versions/{v1.pk}/activate/", format="json")
        v1.refresh_from_db()
        assert v1.status == DishVersion.Status.ACTIVE

        # Create v2 with TOMORROW effective_from
        v2_resp = admin_client.post(
            f"{DISHES_URL}{dish_id}/versions/",
            data={
                "name": "Pancake Stack v2",
                "effective_from": str(TOMORROW),
                "allergen_ids": [str(milk.pk), str(gluten.pk)],
                "per_serving_cost": "3.50",
            },
            format="json",
        )
        assert_status(v2_resp, 201)
        v2_id = v2_resp.json()["id"]

        # Activate v2 → v1 should be SUPERSEDED
        act_resp = admin_client.post(
            f"{DISHES_URL}{dish_id}/versions/{v2_id}/activate/",
            format="json",
        )
        assert_status(act_resp, 200)

        v1.refresh_from_db()
        assert v1.status == DishVersion.Status.SUPERSEDED
        assert v1.effective_to == TOMORROW - datetime.timedelta(days=1)

        v2 = DishVersion.objects.get(pk=v2_id)
        assert v2.status == DishVersion.Status.ACTIVE


# ---------------------------------------------------------------------------
# 9. Allergen filtering: exclude=PEANUTS returns dishes without peanuts
# ---------------------------------------------------------------------------

class TestAllergenFiltering:
    def test_exclude_peanuts(self, admin_client, milk, gluten, peanuts,
                              none_allergen, assert_status):
        # Dish A: MILK + GLUTEN (no peanuts) — create and activate
        resp_a = admin_client.post(DISHES_URL, data=dish_payload(
            milk, gluten, per_serving_cost="3.00",
            allergen_ids=[str(milk.pk), str(gluten.pk)],
        ), format="json")
        assert_status(resp_a, 201)
        a_id  = resp_a.json()["id"]
        dish_a = Dish.objects.get(pk=a_id)
        v_a    = dish_a.versions.first()
        v_a.activate()

        # Dish B: PEANUTS — create and activate
        resp_b = admin_client.post(DISHES_URL, data=dish_payload(
            milk, gluten, per_serving_cost="4.00",
            allergen_ids=[str(peanuts.pk)],
        ), format="json")
        assert_status(resp_b, 201)
        b_id   = resp_b.json()["id"]
        dish_b = Dish.objects.get(pk=b_id)
        v_b    = dish_b.versions.first()
        v_b.activate()

        # GET with allergen_exclude=PEANUTS — should return only dish A
        list_resp = admin_client.get(f"{DISHES_URL}?allergen_exclude=PEANUTS")
        assert_status(list_resp, 200)
        ids = [d["id"] for d in list_resp.json()["results"]]
        assert a_id in ids
        assert b_id not in ids

    def test_list_all_allergens(self, admin_client, assert_status):
        resp = admin_client.get(ALLERGENS_URL)
        assert_status(resp, 200)
        codes = {a["code"] for a in resp.json()["results"]}
        assert "MILK" in codes
        assert "NONE" in codes
        assert len(resp.json()["results"]) == 15
