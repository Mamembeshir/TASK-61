"""
foodservice/views.py

Recipe management API.

Access control:
  - COURIER → 403 on all endpoints
  - STAFF / ADMIN → full access (ADMIN-only: archive)

Audit log: every mutating operation records an AuditLog entry.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework.views    import APIView
from rest_framework.response import Response
from rest_framework          import status
from rest_framework.permissions import IsAuthenticated

from core.exceptions import UnprocessableEntity
from core.models     import AuditLog
from core.pagination import paginate_list
from foodservice.models      import Recipe, RecipeVersion, RecipeIngredient, RecipeStep
from tenants.models  import Site
from foodservice.serializers import (
    RecipeListSerializer,
    RecipeDetailSerializer,
    RecipeVersionSerializer,
    RecipeCreateSerializer,
    RecipeVersionCreateSerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class IsNotCourier(IsAuthenticated):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role != "COURIER"

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.user.role == "COURIER":
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Couriers do not have access to recipes.")
        return True


def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")


def _log(request, action, recipe, extra=None):
    diff = {"recipe_name": recipe.name}
    if extra:
        diff.update(extra)
    AuditLog.objects.create(
        tenant_id      = request.user.tenant_id,
        entity_type    = "Recipe",
        entity_id      = str(recipe.pk),
        action         = action,
        actor_id       = str(request.user.pk),
        actor_username = request.user.username,
        diff_json      = diff,
        ip_address     = _get_ip(request),
    )


def _next_version_number(recipe):
    """Return the next sequential version_number for a recipe."""
    last = recipe.versions.order_by("-version_number").values_list(
        "version_number", flat=True
    ).first()
    return (last or 0) + 1


def _create_version_objects(recipe_version, ingredients_data, steps_data):
    """Bulk-create RecipeIngredient and RecipeStep for a version."""
    RecipeIngredient.objects.bulk_create([
        RecipeIngredient(
            recipe_version  = recipe_version,
            ingredient_name = ing["ingredient_name"],
            quantity        = ing["quantity"],
            unit            = ing["unit"],
            unit_cost       = ing["unit_cost"],
            sort_order      = ing.get("sort_order", idx),
        )
        for idx, ing in enumerate(ingredients_data)
    ])
    RecipeStep.objects.bulk_create([
        RecipeStep(
            recipe_version = recipe_version,
            step_number    = step["step_number"],
            instruction    = step["instruction"],
        )
        for step in steps_data
    ])


# ---------------------------------------------------------------------------
# Recipe list + create   GET/POST /api/v1/recipes/
# ---------------------------------------------------------------------------

class RecipeListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        qs = Recipe.objects.filter(tenant=request.user.tenant)

        name = request.query_params.get("name", "").strip()
        if name:
            qs = qs.filter(name__icontains=name)

        ver_status = request.query_params.get("status", "").strip().upper()
        if ver_status:
            # Filter to recipes that have at least one version with this status
            qs = qs.filter(versions__status=ver_status).distinct()

        # Prefetch active versions to avoid N+1 in serializer
        from django.db.models import Prefetch
        active_qs = RecipeVersion.objects.filter(
            status=RecipeVersion.Status.ACTIVE
        ).prefetch_related("ingredients")
        qs = qs.prefetch_related(
            Prefetch("versions", queryset=active_qs, to_attr="_prefetched_active")
        ).order_by("-created_at")

        def _annotate(items):
            for recipe in items:
                prefetched = getattr(recipe, "_prefetched_active", [])
                recipe._active_version = prefetched[0] if prefetched else None
            return items

        return paginate_list(request, qs, RecipeListSerializer,
                             post_slice_hook=_annotate)

    @transaction.atomic
    def post(self, request):
        ser = RecipeCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        recipe = Recipe.objects.create(
            tenant     = request.user.tenant,
            name       = d["name"],
            created_by = request.user,
        )

        version = RecipeVersion.objects.create(
            recipe         = recipe,
            version_number = 1,
            effective_from = d["effective_from"],
            servings       = d["servings"],
            status         = RecipeVersion.Status.DRAFT,
            created_by     = request.user,
        )
        _create_version_objects(version, d["ingredients"], d["steps"])

        _log(request, AuditLog.Action.CREATE, recipe)
        return Response(RecipeDetailSerializer(recipe).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Recipe detail   GET /api/v1/recipes/{id}/
# ---------------------------------------------------------------------------

class RecipeDetailView(APIView):
    permission_classes = [IsNotCourier]

    def _get_recipe(self, request, pk):
        return get_object_or_404(Recipe, pk=pk, tenant=request.user.tenant)

    def get(self, request, pk):
        recipe = self._get_recipe(request, pk)
        return Response(RecipeDetailSerializer(recipe).data)


# ---------------------------------------------------------------------------
# Recipe versions list + create   GET/POST /api/v1/recipes/{id}/versions/
# ---------------------------------------------------------------------------

class RecipeVersionListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def _get_recipe(self, request, pk):
        return get_object_or_404(Recipe, pk=pk, tenant=request.user.tenant)

    def get(self, request, pk):
        recipe = self._get_recipe(request, pk)
        versions = recipe.versions.prefetch_related("ingredients", "steps").order_by(
            "-version_number"
        )
        return paginate_list(request, versions, RecipeVersionSerializer, ordering="-version_number")

    @transaction.atomic
    def post(self, request, pk):
        recipe = self._get_recipe(request, pk)
        ser = RecipeVersionCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        version = RecipeVersion.objects.create(
            recipe         = recipe,
            version_number = _next_version_number(recipe),
            effective_from = d["effective_from"],
            servings       = d["servings"],
            status         = RecipeVersion.Status.DRAFT,
            created_by     = request.user,
        )
        _create_version_objects(version, d["ingredients"], d["steps"])

        _log(request, AuditLog.Action.CREATE, recipe,
             {"version_number": version.version_number})
        return Response(RecipeVersionSerializer(version).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Specific version detail + delete   GET/DELETE /api/v1/recipes/{id}/versions/{vid}/
# ---------------------------------------------------------------------------

class RecipeVersionDetailView(APIView):
    permission_classes = [IsNotCourier]

    def _get_version(self, request, pk, vid):
        recipe = get_object_or_404(Recipe, pk=pk, tenant=request.user.tenant)
        return get_object_or_404(RecipeVersion, pk=vid, recipe=recipe)

    def get(self, request, pk, vid):
        version = self._get_version(request, pk, vid)
        version_qs = RecipeVersion.objects.prefetch_related(
            "ingredients", "steps"
        ).get(pk=version.pk)
        return Response(RecipeVersionSerializer(version_qs).data)

    def delete(self, request, pk, vid):
        version = self._get_version(request, pk, vid)
        if version.status != RecipeVersion.Status.DRAFT:
            raise UnprocessableEntity(
                f"Only DRAFT versions can be deleted (current status: {version.status})."
            )
        recipe = version.recipe
        _log(request, AuditLog.Action.DELETE, recipe,
             {"version_number": version.version_number})
        version.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Activate   POST /api/v1/recipes/{id}/versions/{vid}/activate/
# ---------------------------------------------------------------------------

class RecipeVersionActivateView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, pk, vid):
        recipe  = get_object_or_404(Recipe, pk=pk, tenant=request.user.tenant)
        version = get_object_or_404(RecipeVersion, pk=vid, recipe=recipe)

        # Optional site scoping: caller may POST {"site_id": "<uuid>"} to activate
        # for a specific site only; omitting it means tenant-wide (site=None).
        site_id = request.data.get("site_id")
        if site_id:
            site = get_object_or_404(Site, pk=site_id, tenant=request.user.tenant)
            version.site = site
            version.save(update_fields=["site"])

        version.activate()          # raises UnprocessableEntity on invalid state
        _log(request, AuditLog.Action.PUBLISH, recipe,
             {"version_number": version.version_number, "site_id": str(site_id) if site_id else None})
        version.refresh_from_db()
        version_qs = RecipeVersion.objects.prefetch_related(
            "ingredients", "steps"
        ).get(pk=version.pk)
        return Response(RecipeVersionSerializer(version_qs).data)


# ---------------------------------------------------------------------------
# Archive   POST /api/v1/recipes/{id}/versions/{vid}/archive/
# ---------------------------------------------------------------------------

class RecipeVersionArchiveView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, pk, vid):
        if request.user.role != "ADMIN":
            return Response(
                {"detail": "Only admins can archive recipe versions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        recipe  = get_object_or_404(Recipe, pk=pk, tenant=request.user.tenant)
        version = get_object_or_404(RecipeVersion, pk=vid, recipe=recipe)
        version.archive()           # raises UnprocessableEntity if not ACTIVE
        _log(request, AuditLog.Action.UNPUBLISH, recipe,
             {"version_number": version.version_number})
        return Response({"detail": "Version archived."})


# ===========================================================================
# DISH VIEWS
# ===========================================================================

from foodservice.models import (
    Allergen, Dish, DishVersion, DishVersionAllergen,
    DishPortionSpec, DishAddon, DishAddonAllergen,
)
from foodservice.serializers import (
    AllergenSerializer,
    DishListSerializer,
    DishDetailSerializer,
    DishVersionReadSerializer,
    DishCreateSerializer,
    DishVersionCreateSerializer,
)


def _dish_next_version_number(dish):
    last = dish.versions.order_by("-version_number").values_list("version_number", flat=True).first()
    return (last or 0) + 1


def _create_dish_version_objects(dish_version, validated_data):
    """Bulk-create allergens, portions, and addons for a DishVersion."""
    # Allergens
    DishVersionAllergen.objects.bulk_create([
        DishVersionAllergen(dish_version=dish_version, allergen=a)
        for a in validated_data["allergens"]
    ])
    # Portions
    DishPortionSpec.objects.bulk_create([
        DishPortionSpec(
            dish_version      = dish_version,
            portion_label     = p["portion_label"],
            serving_size_qty  = p["serving_size_qty"],
            serving_size_unit = p["serving_size_unit"],
            price_multiplier  = p.get("price_multiplier", "1.0000"),
        )
        for p in validated_data.get("portions", [])
    ])
    # Addons (with their allergens)
    for addon_data in validated_data.get("addons", []):
        addon = DishAddon.objects.create(
            dish_version    = dish_version,
            addon_name      = addon_data["addon_name"],
            additional_cost = addon_data["additional_cost"],
        )
        DishAddonAllergen.objects.bulk_create([
            DishAddonAllergen(dish_addon=addon, allergen=a)
            for a in addon_data.get("allergens", [])
        ])


def _resolve_cost(validated_data, recipe):
    """
    Return the per_serving_cost to store on the DishVersion.
    - If recipe is linked: snapshot from recipe's active version.
    - Otherwise: use manually provided value (or raise 422 if missing).
    """
    if recipe is not None:
        active = recipe.active_version
        if active is None:
            raise UnprocessableEntity("Linked recipe has no active version to snapshot cost from.")
        return active.compute_per_serving_cost()
    cost = validated_data.get("per_serving_cost")
    if cost is None:
        raise UnprocessableEntity(
            "per_serving_cost is required when no recipe is linked to the dish."
        )
    return cost


# ---------------------------------------------------------------------------
# Allergen list   GET /api/v1/allergens/
# ---------------------------------------------------------------------------

class AllergenListView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        allergens = Allergen.objects.all().order_by("code")
        return Response(AllergenSerializer(allergens, many=True).data)


# ---------------------------------------------------------------------------
# Dish list + create   GET/POST /api/v1/dishes/
# ---------------------------------------------------------------------------

class DishListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        from django.db.models import Prefetch
        qs = Dish.objects.filter(tenant=request.user.tenant)

        name = request.query_params.get("name", "").strip()
        if name:
            qs = qs.filter(versions__name__icontains=name, versions__status="ACTIVE").distinct()

        # Allergen filters (by code)
        include_codes = [c.strip().upper() for c in request.query_params.getlist("allergen_include") if c.strip()]
        exclude_codes = [c.strip().upper() for c in request.query_params.getlist("allergen_exclude") if c.strip()]

        if include_codes:
            for code in include_codes:
                qs = qs.filter(
                    versions__status="ACTIVE",
                    versions__dish_allergens__allergen__code=code,
                ).distinct()

        if exclude_codes:
            from django.db.models import Subquery, OuterRef
            active_versions_with_excluded = DishVersion.objects.filter(
                dish=OuterRef("pk"),
                status="ACTIVE",
                dish_allergens__allergen__code__in=exclude_codes,
            )
            qs = qs.exclude(pk__in=Subquery(active_versions_with_excluded.values("dish_id")))

        # Prefetch active version to avoid N+1
        active_qs = DishVersion.objects.filter(
            status="ACTIVE"
        ).prefetch_related(
            Prefetch("dish_allergens", queryset=DishVersionAllergen.objects.select_related("allergen"))
        )
        qs = qs.prefetch_related(
            Prefetch("versions", queryset=active_qs, to_attr="_prefetched_active")
        )

        results = list(qs.order_by("-created_at"))
        for dish in results:
            prefetched = getattr(dish, "_prefetched_active", [])
            dish._active_version = prefetched[0] if prefetched else None

        return Response(DishListSerializer(results, many=True).data)

    @transaction.atomic
    def post(self, request):
        ser = DishCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        vd = d["_version_validated"] if "_version_validated" in d else d

        # Resolve recipe
        recipe = None
        if d.get("recipe_id"):
            recipe = get_object_or_404(Recipe, pk=d["recipe_id"], tenant=request.user.tenant)

        cost = _resolve_cost(d, recipe)

        dish = Dish.objects.create(
            tenant     = request.user.tenant,
            recipe     = recipe,
            created_by = request.user,
        )

        version = DishVersion.objects.create(
            dish             = dish,
            version_number   = 1,
            name             = d["name"],
            description      = d.get("description", ""),
            effective_from   = d["effective_from"],
            status           = DishVersion.Status.DRAFT,
            calories         = d.get("calories"),
            protein_g        = d.get("protein_g"),
            carbs_g          = d.get("carbs_g"),
            fat_g            = d.get("fat_g"),
            per_serving_cost = cost,
            created_by       = request.user,
        )
        _create_dish_version_objects(version, d)

        _dish_log(request, AuditLog.Action.CREATE, dish)
        return Response(DishDetailSerializer(dish).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Dish detail   GET /api/v1/dishes/{id}/
# ---------------------------------------------------------------------------

class DishDetailView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        dish = get_object_or_404(Dish, pk=pk, tenant=request.user.tenant)
        return Response(DishDetailSerializer(dish).data)


# ---------------------------------------------------------------------------
# Dish version list + create   GET/POST /api/v1/dishes/{id}/versions/
# ---------------------------------------------------------------------------

class DishVersionListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def _get_dish(self, request, pk):
        return get_object_or_404(Dish, pk=pk, tenant=request.user.tenant)

    def get(self, request, pk):
        dish = self._get_dish(request, pk)
        versions = dish.versions.prefetch_related(
            "dish_allergens__allergen", "portions", "addons__addon_allergens__allergen"
        ).order_by("-version_number")
        return Response(DishVersionReadSerializer(versions, many=True).data)

    @transaction.atomic
    def post(self, request, pk):
        dish = self._get_dish(request, pk)
        ser = DishVersionCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        cost = _resolve_cost(d, dish.recipe)

        version = DishVersion.objects.create(
            dish             = dish,
            version_number   = _dish_next_version_number(dish),
            name             = d["name"],
            description      = d.get("description", ""),
            effective_from   = d["effective_from"],
            status           = DishVersion.Status.DRAFT,
            calories         = d.get("calories"),
            protein_g        = d.get("protein_g"),
            carbs_g          = d.get("carbs_g"),
            fat_g            = d.get("fat_g"),
            per_serving_cost = cost,
            created_by       = request.user,
        )
        _create_dish_version_objects(version, d)

        _dish_log(request, AuditLog.Action.CREATE, dish, extra={"version_number": version.version_number})
        return Response(DishVersionReadSerializer(version).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Dish version activate   POST /api/v1/dishes/{id}/versions/{vid}/activate/
# ---------------------------------------------------------------------------

class DishVersionActivateView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, pk, vid):
        dish    = get_object_or_404(Dish, pk=pk, tenant=request.user.tenant)
        version = get_object_or_404(DishVersion, pk=vid, dish=dish)
        version.activate()
        _dish_log(request, AuditLog.Action.PUBLISH, dish, extra={"version_number": version.version_number})
        version.refresh_from_db()
        v = DishVersion.objects.prefetch_related(
            "dish_allergens__allergen", "portions", "addons__addon_allergens__allergen"
        ).get(pk=version.pk)
        return Response(DishVersionReadSerializer(v).data)


def _dish_log(request, action, dish, extra=None):
    """Thin wrapper around AuditLog.objects.create for dish operations."""
    diff = {"dish_id": str(dish.pk)}
    if extra:
        diff.update(extra)
    AuditLog.objects.create(
        tenant_id      = request.user.tenant_id,
        entity_type    = "Dish",
        entity_id      = str(dish.pk),
        action         = action,
        actor_id       = str(request.user.pk),
        actor_username = request.user.username,
        diff_json      = diff,
        ip_address     = request.META.get("REMOTE_ADDR", ""),
    )


# ===========================================================================
# MENU VIEWS
# ===========================================================================

from foodservice.models import Menu, MenuVersion, MenuGroup, MenuGroupItem, MenuSiteRelease
from foodservice.serializers import (
    MenuListSerializer, MenuDetailSerializer,
    MenuVersionReadSerializer,
    MenuCreateSerializer, MenuVersionCreateSerializer, MenuPublishSerializer,
)


def _menu_log(request, action, menu, extra=None):
    """Thin wrapper around AuditLog.objects.create for menu operations."""
    diff = {"menu_id": str(menu.pk)}
    if extra:
        diff.update(extra)
    AuditLog.objects.create(
        tenant_id      = request.user.tenant_id,
        entity_type    = "Menu",
        entity_id      = str(menu.pk),
        action         = action,
        actor_id       = str(request.user.pk),
        actor_username = request.user.username,
        diff_json      = diff,
        ip_address     = request.META.get("REMOTE_ADDR", ""),
    )


def _build_menu_groups(version, groups_data, tenant):
    """Create MenuGroup and MenuGroupItem objects from validated write data."""
    for group_data in groups_data:
        items_data = group_data.pop("items", [])
        group = MenuGroup.objects.create(
            menu_version       = version,
            name               = group_data["name"],
            sort_order         = group_data.get("sort_order", 0),
            availability_start = group_data.get("availability_start"),
            availability_end   = group_data.get("availability_end"),
        )
        for item_data in items_data:
            from foodservice.models import DishVersion as _DishVersion
            dish_version = get_object_or_404(
                _DishVersion,
                pk=item_data["dish_version_id"],
                dish__tenant=tenant,
            )
            MenuGroupItem.objects.create(
                menu_group   = group,
                dish_version = dish_version,
                sort_order   = item_data.get("sort_order", 0),
            )


def _menu_next_version_number(menu):
    last = menu.versions.order_by("-version_number").first()
    return (last.version_number + 1) if last else 1


# ---------------------------------------------------------------------------
# Menu list / create   GET+POST /api/v1/foodservice/menus/
# ---------------------------------------------------------------------------

class MenuListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        menus = Menu.objects.filter(tenant=request.user.tenant).prefetch_related(
            "versions__site_releases",
        )
        ser = MenuListSerializer(menus, many=True)
        return Response(ser.data)

    def post(self, request):
        ser = MenuCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        with transaction.atomic():
            menu = Menu.objects.create(
                tenant     = request.user.tenant,
                name       = d["name"],
                created_by = request.user,
            )
            version = MenuVersion.objects.create(
                menu           = menu,
                version_number = 1,
                description    = d.get("description", ""),
                status         = MenuVersion.Status.DRAFT,
                created_by     = request.user,
            )
            _build_menu_groups(version, d.get("groups", []), request.user.tenant)

        _menu_log(request, AuditLog.Action.CREATE, menu)
        menu_out = Menu.objects.prefetch_related(
            "versions__groups__items__dish_version",
            "versions__site_releases",
        ).get(pk=menu.pk)
        return Response(MenuDetailSerializer(menu_out).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Menu detail   GET /api/v1/foodservice/menus/{id}/
# ---------------------------------------------------------------------------

class MenuDetailView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        menu = get_object_or_404(Menu, pk=pk, tenant=request.user.tenant)
        menu = Menu.objects.prefetch_related(
            "versions__groups__items__dish_version",
            "versions__site_releases",
        ).get(pk=menu.pk)
        return Response(MenuDetailSerializer(menu).data)


# ---------------------------------------------------------------------------
# Menu version list / create   GET+POST /api/v1/foodservice/menus/{id}/versions/
# ---------------------------------------------------------------------------

class MenuVersionListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        menu = get_object_or_404(Menu, pk=pk, tenant=request.user.tenant)
        versions = menu.versions.prefetch_related(
            "groups__items__dish_version",
            "site_releases",
        ).all()
        return Response(MenuVersionReadSerializer(versions, many=True).data)

    def post(self, request, pk):
        menu = get_object_or_404(Menu, pk=pk, tenant=request.user.tenant)
        ser = MenuVersionCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        with transaction.atomic():
            version = MenuVersion.objects.create(
                menu           = menu,
                version_number = _menu_next_version_number(menu),
                description    = d.get("description", ""),
                status         = MenuVersion.Status.DRAFT,
                created_by     = request.user,
            )
            _build_menu_groups(version, d.get("groups", []), request.user.tenant)

        _menu_log(request, AuditLog.Action.CREATE, menu, extra={"version_number": version.version_number})
        v = MenuVersion.objects.prefetch_related(
            "groups__items__dish_version",
            "site_releases",
        ).get(pk=version.pk)
        return Response(MenuVersionReadSerializer(v).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Menu version publish   POST /api/v1/foodservice/menus/{id}/versions/{vid}/publish/
# ---------------------------------------------------------------------------

class MenuVersionPublishView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, pk, vid):
        menu    = get_object_or_404(Menu, pk=pk, tenant=request.user.tenant)
        version = get_object_or_404(MenuVersion, pk=vid, menu=menu)
        ser = MenuPublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        site_ids = ser.validated_data["site_ids"]
        version.publish(request.user, site_ids)
        _menu_log(request, AuditLog.Action.PUBLISH, menu, extra={"version_number": version.version_number})
        try:
            from integrations.webhook_utils import dispatch_webhook
            dispatch_webhook("menu.published", {"menu_id": str(menu.pk), "version_id": str(version.pk), "site_ids": [str(s) for s in site_ids]}, request.user.tenant)
        except Exception:
            pass
        v = MenuVersion.objects.prefetch_related(
            "groups__items__dish_version",
            "site_releases",
        ).get(pk=version.pk)
        return Response(MenuVersionReadSerializer(v).data)


# ---------------------------------------------------------------------------
# Menu version unpublish   POST /api/v1/foodservice/menus/{id}/versions/{vid}/unpublish/
# ---------------------------------------------------------------------------

class MenuVersionUnpublishView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, pk, vid):
        menu    = get_object_or_404(Menu, pk=pk, tenant=request.user.tenant)
        version = get_object_or_404(MenuVersion, pk=vid, menu=menu)
        version.unpublish()
        _menu_log(request, AuditLog.Action.UPDATE, menu, extra={"version_number": version.version_number, "action": "unpublish"})
        try:
            from integrations.webhook_utils import dispatch_webhook
            dispatch_webhook("menu.unpublished", {"menu_id": str(menu.pk), "version_id": str(version.pk)}, request.user.tenant)
        except Exception:
            pass
        v = MenuVersion.objects.prefetch_related(
            "groups__items__dish_version",
            "site_releases",
        ).get(pk=version.pk)
        return Response(MenuVersionReadSerializer(v).data)


# ---------------------------------------------------------------------------
# Menu version archive   POST /api/v1/foodservice/menus/{id}/versions/{vid}/archive/
# ---------------------------------------------------------------------------

class MenuVersionArchiveView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, pk, vid):
        if request.user.role != "ADMIN":
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only ADMIN users can archive menu versions.")
        menu    = get_object_or_404(Menu, pk=pk, tenant=request.user.tenant)
        version = get_object_or_404(MenuVersion, pk=vid, menu=menu)
        version.archive()
        _menu_log(request, AuditLog.Action.UPDATE, menu, extra={"version_number": version.version_number, "action": "archive"})
        v = MenuVersion.objects.prefetch_related(
            "groups__items__dish_version",
            "site_releases",
        ).get(pk=version.pk)
        return Response(MenuVersionReadSerializer(v).data)


# ---------------------------------------------------------------------------
# Active menus for a site   GET /api/v1/foodservice/sites/{site_id}/active-menus/
# ---------------------------------------------------------------------------

class SiteActiveMenusView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, site_id):
        from tenants.models import Site
        site = get_object_or_404(Site, pk=site_id, tenant=request.user.tenant)

        # STAFF can only see their assigned sites
        if request.user.role == "STAFF":
            from iam.models import UserSiteAssignment
            if not UserSiteAssignment.objects.filter(user=request.user, site=site).exists():
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You are not assigned to this site.")

        releases = MenuSiteRelease.objects.filter(
            site=site,
            menu_version__status=MenuVersion.Status.PUBLISHED,
        ).select_related("menu_version__menu")

        version_ids = [r.menu_version_id for r in releases]
        versions = MenuVersion.objects.filter(pk__in=version_ids).prefetch_related(
            "groups__items__dish_version",
            "site_releases",
        )
        return Response(MenuVersionReadSerializer(versions, many=True).data)
