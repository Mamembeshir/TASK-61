"""
foodservice/serializers.py
"""
from decimal import Decimal
from rest_framework import serializers

from core.exceptions import UnprocessableEntity
from foodservice.models import Recipe, RecipeVersion, RecipeIngredient, RecipeStep


# ---------------------------------------------------------------------------
# Nested read serializers
# ---------------------------------------------------------------------------

class RecipeIngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RecipeIngredient
        fields = [
            "id", "ingredient_name", "quantity", "unit",
            "unit_cost", "sort_order",
        ]


class RecipeStepSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RecipeStep
        fields = ["id", "step_number", "instruction"]


class RecipeVersionSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True, read_only=True)
    steps       = RecipeStepSerializer(many=True, read_only=True)
    per_serving_cost = serializers.SerializerMethodField()

    class Meta:
        model  = RecipeVersion
        fields = [
            "id", "version_number", "effective_from", "effective_to",
            "status", "servings", "per_serving_cost",
            "created_by_id", "created_at",
            "ingredients", "steps",
        ]

    def get_per_serving_cost(self, obj):
        return str(obj.compute_per_serving_cost())


# ---------------------------------------------------------------------------
# List serializer — minimal fields for the recipe index
# ---------------------------------------------------------------------------

class RecipeListSerializer(serializers.ModelSerializer):
    active_version_number = serializers.SerializerMethodField()
    effective_from        = serializers.SerializerMethodField()
    per_serving_cost      = serializers.SerializerMethodField()

    class Meta:
        model  = Recipe
        fields = [
            "id", "name",
            "active_version_number", "effective_from", "per_serving_cost",
            "created_at", "updated_at",
        ]

    def _active(self, obj):
        # Cached on the instance during queryset annotation to avoid N+1
        return getattr(obj, "_active_version", None) or obj.active_version

    def get_active_version_number(self, obj):
        av = self._active(obj)
        return av.version_number if av else None

    def get_effective_from(self, obj):
        av = self._active(obj)
        return str(av.effective_from) if av else None

    def get_per_serving_cost(self, obj):
        av = self._active(obj)
        return str(av.compute_per_serving_cost()) if av else None


# ---------------------------------------------------------------------------
# Detail serializer — adds the active version's ingredients and steps
# ---------------------------------------------------------------------------

class RecipeDetailSerializer(RecipeListSerializer):
    active_version = serializers.SerializerMethodField()

    class Meta(RecipeListSerializer.Meta):
        fields = RecipeListSerializer.Meta.fields + ["active_version"]

    def get_active_version(self, obj):
        av = self._active(obj)
        if av is None:
            return None
        return RecipeVersionSerializer(av, context=self.context).data


# ---------------------------------------------------------------------------
# Nested write serializers (used inside RecipeVersionCreateSerializer)
# ---------------------------------------------------------------------------

class IngredientWriteSerializer(serializers.Serializer):
    ingredient_name = serializers.CharField(max_length=200)
    quantity        = serializers.DecimalField(max_digits=10, decimal_places=4)
    unit            = serializers.ChoiceField(choices=RecipeIngredient.Unit.choices)
    unit_cost       = serializers.DecimalField(max_digits=10, decimal_places=4)
    sort_order      = serializers.IntegerField(default=0, required=False)

    def validate_quantity(self, value):
        if value <= Decimal("0"):
            raise UnprocessableEntity("quantity must be > 0.")
        return value

    def validate_unit_cost(self, value):
        if value < Decimal("0"):
            raise UnprocessableEntity("unit_cost must be >= 0.")
        return value


class StepWriteSerializer(serializers.Serializer):
    step_number = serializers.IntegerField(min_value=1)
    instruction = serializers.CharField(max_length=2000)


# ---------------------------------------------------------------------------
# Version create serializer
# ---------------------------------------------------------------------------

class RecipeVersionCreateSerializer(serializers.Serializer):
    effective_from = serializers.DateField()
    servings       = serializers.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal("1")
    )
    ingredients    = IngredientWriteSerializer(many=True)
    steps          = StepWriteSerializer(many=True)

    def validate_servings(self, value):
        if value <= Decimal("0"):
            raise UnprocessableEntity("servings must be > 0.")
        return value

    def validate_ingredients(self, value):
        if not value:
            raise UnprocessableEntity("At least one ingredient is required.")
        return value

    def validate_steps(self, value):
        if not value:
            raise UnprocessableEntity("At least one step is required.")
        return value


# ---------------------------------------------------------------------------
# Recipe create serializer (recipe name + first version in one request)
# ---------------------------------------------------------------------------

class RecipeCreateSerializer(serializers.Serializer):
    name           = serializers.CharField(min_length=1, max_length=200)
    effective_from = serializers.DateField()
    servings       = serializers.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal("1")
    )
    ingredients    = IngredientWriteSerializer(many=True)
    steps          = StepWriteSerializer(many=True)

    def validate_servings(self, value):
        if value <= Decimal("0"):
            raise UnprocessableEntity("servings must be > 0.")
        return value

    def validate_ingredients(self, value):
        if not value:
            raise UnprocessableEntity("At least one ingredient is required.")
        return value

    def validate_steps(self, value):
        if not value:
            raise UnprocessableEntity("At least one step is required.")
        return value


# ===========================================================================
# DISH SERIALIZERS
# ===========================================================================

from foodservice.models import (
    Allergen, Dish, DishVersion, DishVersionAllergen,
    DishPortionSpec, DishAddon, DishAddonAllergen,
)


# ---------------------------------------------------------------------------
# Allergen
# ---------------------------------------------------------------------------

class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Allergen
        fields = ["id", "code", "name"]


# ---------------------------------------------------------------------------
# Read serializers for DishVersion sub-objects
# ---------------------------------------------------------------------------

class DishPortionSpecSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DishPortionSpec
        fields = ["id", "portion_label", "serving_size_qty", "serving_size_unit", "price_multiplier"]


class DishAddonSerializer(serializers.ModelSerializer):
    allergens = serializers.SerializerMethodField()

    class Meta:
        model  = DishAddon
        fields = ["id", "addon_name", "additional_cost", "allergens"]

    def get_allergens(self, obj):
        return [
            {"id": str(da.allergen.id), "code": da.allergen.code, "name": da.allergen.name}
            for da in obj.addon_allergens.select_related("allergen").all()
        ]


class DishVersionReadSerializer(serializers.ModelSerializer):
    allergens     = serializers.SerializerMethodField()
    portions      = DishPortionSpecSerializer(many=True, read_only=True)
    addons        = DishAddonSerializer(many=True, read_only=True)
    has_nutrition = serializers.BooleanField(read_only=True)

    class Meta:
        model  = DishVersion
        fields = [
            "id", "version_number", "name", "description",
            "effective_from", "effective_to", "status",
            "calories", "protein_g", "carbs_g", "fat_g", "has_nutrition",
            "per_serving_cost", "created_by_id", "created_at",
            "allergens", "portions", "addons",
        ]

    def get_allergens(self, obj):
        return [
            {"id": str(da.allergen.id), "code": da.allergen.code, "name": da.allergen.name}
            for da in obj.dish_allergens.select_related("allergen").all()
        ]


# ---------------------------------------------------------------------------
# List serializer
# ---------------------------------------------------------------------------

class DishListSerializer(serializers.ModelSerializer):
    name             = serializers.SerializerMethodField()
    per_serving_cost = serializers.SerializerMethodField()
    allergen_names   = serializers.SerializerMethodField()
    has_nutrition    = serializers.SerializerMethodField()

    class Meta:
        model  = Dish
        fields = ["id", "name", "per_serving_cost", "allergen_names", "has_nutrition", "created_at"]

    def _av(self, obj):
        return getattr(obj, "_active_version", None) or obj.active_version

    def get_name(self, obj):
        av = self._av(obj)
        return av.name if av else None

    def get_per_serving_cost(self, obj):
        av = self._av(obj)
        return str(av.per_serving_cost) if av else None

    def get_allergen_names(self, obj):
        av = self._av(obj)
        if not av:
            return []
        return [da.allergen.name for da in av.dish_allergens.select_related("allergen").all()]

    def get_has_nutrition(self, obj):
        av = self._av(obj)
        return av.has_nutrition if av else False


# ---------------------------------------------------------------------------
# Detail serializer
# ---------------------------------------------------------------------------

class DishDetailSerializer(DishListSerializer):
    active_version = serializers.SerializerMethodField()
    recipe_id      = serializers.SerializerMethodField()

    class Meta(DishListSerializer.Meta):
        fields = DishListSerializer.Meta.fields + ["recipe_id", "active_version"]

    def get_recipe_id(self, obj):
        return str(obj.recipe_id) if obj.recipe_id else None

    def get_active_version(self, obj):
        av = self._av(obj)
        if av is None:
            return None
        return DishVersionReadSerializer(av, context=self.context).data


# ---------------------------------------------------------------------------
# Write helpers
# ---------------------------------------------------------------------------

class DishPortionSpecWriteSerializer(serializers.Serializer):
    portion_label      = serializers.CharField(max_length=100)
    serving_size_qty   = serializers.DecimalField(max_digits=10, decimal_places=4)
    serving_size_unit  = serializers.CharField(max_length=50)
    price_multiplier   = serializers.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal("1.0000"), required=False
    )

    def validate_serving_size_qty(self, value):
        if value <= Decimal("0"):
            raise UnprocessableEntity("serving_size_qty must be > 0.")
        return value

    def validate_price_multiplier(self, value):
        if value < Decimal("0"):
            raise UnprocessableEntity("price_multiplier must be >= 0.")
        return value


class DishAddonWriteSerializer(serializers.Serializer):
    addon_name      = serializers.CharField(max_length=200)
    additional_cost = serializers.DecimalField(max_digits=10, decimal_places=2)
    allergen_ids    = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )

    def validate_additional_cost(self, value):
        if value < Decimal("0"):
            raise UnprocessableEntity("additional_cost must be >= 0.")
        return value


class DishVersionCreateSerializer(serializers.Serializer):
    name             = serializers.CharField(min_length=1, max_length=200)
    description      = serializers.CharField(max_length=1000, required=False, default="")
    effective_from   = serializers.DateField()
    # No min_length here — empty list caught in validate() as UnprocessableEntity (422)
    allergen_ids     = serializers.ListField(child=serializers.UUIDField())
    calories         = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )
    protein_g        = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )
    carbs_g          = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )
    fat_g            = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )
    per_serving_cost = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )
    portions         = DishPortionSpecWriteSerializer(many=True, required=False, default=list)
    addons           = DishAddonWriteSerializer(many=True, required=False, default=list)

    def validate(self, data):
        # Nutrition all-or-nothing
        nutrition_vals = [data.get("calories"), data.get("protein_g"),
                          data.get("carbs_g"), data.get("fat_g")]
        provided = [v for v in nutrition_vals if v is not None]
        if 0 < len(provided) < 4:
            raise UnprocessableEntity(
                "Nutrition is all-or-nothing: provide all four fields "
                "(calories, protein_g, carbs_g, fat_g) or none."
            )

        # Allergen rules
        allergen_ids = data.get("allergen_ids", [])
        allergens    = list(Allergen.objects.filter(pk__in=allergen_ids))
        if len(allergens) != len(set(str(i) for i in allergen_ids)):
            found_ids = {str(a.pk) for a in allergens}
            bad = [str(i) for i in allergen_ids if str(i) not in found_ids]
            raise UnprocessableEntity(f"Unknown allergen IDs: {bad}")
        if not allergens:
            raise UnprocessableEntity("At least one allergen must be specified.")
        none_present  = any(a.code == "NONE" for a in allergens)
        other_present = any(a.code != "NONE" for a in allergens)
        if none_present and other_present:
            raise UnprocessableEntity("NONE allergen cannot be combined with other allergens.")
        data["allergens"] = allergens

        # Resolve addon allergens
        for addon in data.get("addons", []):
            ids = addon.get("allergen_ids", [])
            if ids:
                addon_allergens = list(Allergen.objects.filter(pk__in=ids))
                if len(addon_allergens) != len(set(str(i) for i in ids)):
                    raise UnprocessableEntity("Unknown allergen ID in addon.")
                addon["allergens"] = addon_allergens
            else:
                addon["allergens"] = []
        return data


class DishCreateSerializer(DishVersionCreateSerializer):
    """Extends version serializer with dish-level recipe_id field."""
    recipe_id = serializers.UUIDField(required=False, allow_null=True, default=None)


# ===========================================================================
# MENU SERIALIZERS
# ===========================================================================

from foodservice.models import Menu, MenuVersion, MenuGroup, MenuGroupItem, MenuSiteRelease


# ---------------------------------------------------------------------------
# Read serializers
# ---------------------------------------------------------------------------

class MenuGroupItemReadSerializer(serializers.ModelSerializer):
    dish_version_id = serializers.UUIDField(source="dish_version.id", read_only=True)
    dish_name       = serializers.CharField(source="dish_version.name", read_only=True)

    class Meta:
        model  = MenuGroupItem
        fields = ["id", "dish_version_id", "dish_name", "sort_order"]


class MenuGroupReadSerializer(serializers.ModelSerializer):
    items = MenuGroupItemReadSerializer(many=True, read_only=True)

    class Meta:
        model  = MenuGroup
        fields = [
            "id", "name", "sort_order",
            "availability_start", "availability_end",
            "items",
        ]


class MenuVersionReadSerializer(serializers.ModelSerializer):
    groups        = MenuGroupReadSerializer(many=True, read_only=True)
    site_releases = serializers.SerializerMethodField()

    class Meta:
        model  = MenuVersion
        fields = [
            "id", "version_number", "status", "description",
            "created_by_id", "created_at",
            "groups", "site_releases",
        ]

    def get_site_releases(self, obj):
        return [
            {"site_id": str(r.site_id), "released_at": r.released_at.isoformat()}
            for r in obj.site_releases.all()
        ]


class MenuListSerializer(serializers.ModelSerializer):
    published_version_number = serializers.SerializerMethodField()

    class Meta:
        model  = Menu
        fields = ["id", "name", "published_version_number", "created_at", "updated_at"]

    def get_published_version_number(self, obj):
        av = obj.active_version
        return av.version_number if av else None


class MenuDetailSerializer(MenuListSerializer):
    versions = MenuVersionReadSerializer(many=True, read_only=True)

    class Meta(MenuListSerializer.Meta):
        fields = MenuListSerializer.Meta.fields + ["versions"]


# ---------------------------------------------------------------------------
# Write serializers
# ---------------------------------------------------------------------------

class MenuGroupItemWriteSerializer(serializers.Serializer):
    dish_version_id = serializers.UUIDField()
    sort_order      = serializers.IntegerField(default=0, required=False)


class MenuGroupWriteSerializer(serializers.Serializer):
    name               = serializers.CharField(max_length=200)
    sort_order         = serializers.IntegerField(default=0, required=False)
    availability_start = serializers.TimeField(required=False, allow_null=True, default=None)
    availability_end   = serializers.TimeField(required=False, allow_null=True, default=None)
    items              = MenuGroupItemWriteSerializer(many=True, required=False, default=list)

    def validate(self, data):
        start = data.get("availability_start")
        end   = data.get("availability_end")
        if (start is None) != (end is None):
            raise UnprocessableEntity(
                "Both availability_start and availability_end must be set together."
            )
        if start is not None and end is not None and start >= end:
            raise UnprocessableEntity(
                "availability_start must be strictly before availability_end."
            )
        return data


class MenuVersionCreateSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=1000, required=False, default="")
    groups      = MenuGroupWriteSerializer(many=True, required=False, default=list)


class MenuCreateSerializer(serializers.Serializer):
    name        = serializers.CharField(min_length=1, max_length=200)
    description = serializers.CharField(max_length=1000, required=False, default="")
    groups      = MenuGroupWriteSerializer(many=True, required=False, default=list)


class MenuPublishSerializer(serializers.Serializer):
    site_ids = serializers.ListField(child=serializers.UUIDField())

    def validate_site_ids(self, value):
        if not value:
            raise UnprocessableEntity("At least one site_id is required.")
        return value
