"""
tests/api/foodservice/test_menus.py

Integration tests for Menu management API (Step 9).

Endpoints under test:
  POST   /api/v1/foodservice/menus/
  GET    /api/v1/foodservice/menus/
  GET    /api/v1/foodservice/menus/{id}/
  POST   /api/v1/foodservice/menus/{id}/versions/
  GET    /api/v1/foodservice/menus/{id}/versions/
  POST   /api/v1/foodservice/menus/{id}/versions/{vid}/publish/
  POST   /api/v1/foodservice/menus/{id}/versions/{vid}/unpublish/
  POST   /api/v1/foodservice/menus/{id}/versions/{vid}/archive/
  GET    /api/v1/foodservice/sites/{site_id}/active-menus/
"""
import datetime
from decimal import Decimal

import pytest

from iam.factories import TenantFactory, SiteFactory, AdminUserFactory
from iam.models import UserSiteAssignment, User
from foodservice.models import (
    Allergen, Dish, DishVersion, DishVersionAllergen,
    Menu, MenuVersion, MenuGroup, MenuGroupItem, MenuSiteRelease,
)

pytestmark = [pytest.mark.api, pytest.mark.django_db]

MENUS_URL     = "/api/v1/foodservice/menus/"
TODAY         = datetime.date.today()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def seed_allergens():
    from foodservice.management.commands.seed_allergens import ALLERGENS
    for code, name in ALLERGENS:
        Allergen.objects.get_or_create(code=code, defaults={"name": name})


@pytest.fixture
def milk(db):
    return Allergen.objects.get(code="MILK")


@pytest.fixture
def none_allergen(db):
    return Allergen.objects.get(code="NONE")


@pytest.fixture
def active_dish(tenant, admin_user, milk):
    """An ACTIVE DishVersion for use in menu items."""
    dish = Dish.objects.create(tenant=tenant, recipe=None, created_by=admin_user)
    version = DishVersion.objects.create(
        dish=dish,
        version_number=1,
        name="Pancake Stack",
        effective_from=TODAY,
        status=DishVersion.Status.DRAFT,
        per_serving_cost=Decimal("5.00"),
        created_by=admin_user,
    )
    DishVersionAllergen.objects.create(dish_version=version, allergen=milk)
    version.activate()
    return version


@pytest.fixture
def draft_dish(tenant, admin_user, milk):
    """A DRAFT DishVersion (cannot be published in a menu)."""
    dish = Dish.objects.create(tenant=tenant, recipe=None, created_by=admin_user)
    version = DishVersion.objects.create(
        dish=dish,
        version_number=1,
        name="Draft Dish",
        effective_from=TODAY,
        status=DishVersion.Status.DRAFT,
        per_serving_cost=Decimal("3.00"),
        created_by=admin_user,
    )
    DishVersionAllergen.objects.create(dish_version=version, allergen=milk)
    return version


@pytest.fixture
def staff_user_with_site(staff_user, site):
    """STAFF user assigned to the default site."""
    UserSiteAssignment.objects.create(user=staff_user, site=site)
    return staff_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _menu_payload(active_dish, *, name="Breakfast Menu", groups=None):
    """Build a minimal menu create payload."""
    payload = {"name": name}
    if groups is not None:
        payload["groups"] = groups
    else:
        payload["groups"] = [
            {
                "name": "Mains",
                "sort_order": 0,
                "items": [{"dish_version_id": str(active_dish.pk), "sort_order": 0}],
            }
        ]
    return payload


def _create_menu(client, active_dish, **kwargs):
    payload = _menu_payload(active_dish, **kwargs)
    return client.post(MENUS_URL, data=payload, format="json")


# ---------------------------------------------------------------------------
# 1. Create menu → 201, returns id + version info
# ---------------------------------------------------------------------------

class TestCreateMenu:
    def test_create_menu_returns_201(self, admin_client, active_dish, assert_status):
        resp = _create_menu(admin_client, active_dish)
        assert_status(resp, 201)
        data = resp.json()
        assert "id" in data
        assert data["name"] == "Breakfast Menu"

    def test_create_menu_creates_draft_version(self, admin_client, active_dish, assert_status):
        resp = _create_menu(admin_client, active_dish)
        assert_status(resp, 201)
        menu = Menu.objects.get(pk=resp.json()["id"])
        assert menu.versions.count() == 1
        assert menu.versions.first().status == MenuVersion.Status.DRAFT

    def test_create_menu_with_group_and_items(self, admin_client, active_dish, assert_status):
        resp = _create_menu(admin_client, active_dish)
        assert_status(resp, 201)
        menu = Menu.objects.get(pk=resp.json()["id"])
        version = menu.versions.first()
        assert version.groups.count() == 1
        group = version.groups.first()
        assert group.name == "Mains"
        assert group.items.count() == 1

    def test_courier_cannot_create_menu(self, courier_client, active_dish, assert_status):
        resp = _create_menu(courier_client, active_dish)
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 2. Availability time validation
# ---------------------------------------------------------------------------

class TestAvailabilityTimes:
    def test_both_times_set_returns_201(self, admin_client, active_dish, assert_status):
        payload = _menu_payload(active_dish, groups=[
            {
                "name": "Breakfast",
                "sort_order": 0,
                "availability_start": "07:00:00",
                "availability_end": "10:30:00",
                "items": [{"dish_version_id": str(active_dish.pk)}],
            }
        ])
        resp = admin_client.post(MENUS_URL, data=payload, format="json")
        assert_status(resp, 201)
        version = Menu.objects.get(pk=resp.json()["id"]).versions.first()
        group = version.groups.first()
        assert str(group.availability_start) == "07:00:00"
        assert str(group.availability_end) == "10:30:00"

    def test_start_only_returns_422(self, admin_client, active_dish, assert_status):
        payload = _menu_payload(active_dish, groups=[
            {
                "name": "Lunch",
                "availability_start": "11:00:00",
                "items": [{"dish_version_id": str(active_dish.pk)}],
            }
        ])
        resp = admin_client.post(MENUS_URL, data=payload, format="json")
        assert_status(resp, 422)

    def test_end_before_start_returns_422(self, admin_client, active_dish, assert_status):
        payload = _menu_payload(active_dish, groups=[
            {
                "name": "Evening",
                "availability_start": "20:00:00",
                "availability_end": "18:00:00",
                "items": [{"dish_version_id": str(active_dish.pk)}],
            }
        ])
        resp = admin_client.post(MENUS_URL, data=payload, format="json")
        assert_status(resp, 422)

    def test_overlapping_groups_are_valid(self, admin_client, active_dish, assert_status):
        """Per questions.md §4.5, overlapping groups are allowed."""
        payload = _menu_payload(active_dish, groups=[
            {
                "name": "All Day",
                "availability_start": "08:00:00",
                "availability_end": "22:00:00",
                "items": [{"dish_version_id": str(active_dish.pk)}],
            },
            {
                "name": "Lunch Special",
                "availability_start": "11:00:00",
                "availability_end": "14:00:00",
                "items": [{"dish_version_id": str(active_dish.pk)}],
            },
        ])
        resp = admin_client.post(MENUS_URL, data=payload, format="json")
        assert_status(resp, 201)


# ---------------------------------------------------------------------------
# 3. Publish workflow
# ---------------------------------------------------------------------------

class TestPublishWorkflow:
    def _make_menu_with_active_dish(self, client, active_dish):
        resp = _create_menu(client, active_dish)
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_publish_draft_returns_200(self, admin_client, active_dish, site, assert_status):
        menu_id = self._make_menu_with_active_dish(admin_client, active_dish)
        menu = Menu.objects.get(pk=menu_id)
        version = menu.versions.first()
        pub_resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        assert_status(pub_resp, 200)
        version.refresh_from_db()
        assert version.status == MenuVersion.Status.PUBLISHED

    def test_publish_creates_site_release(self, admin_client, active_dish, site, assert_status):
        menu_id = self._make_menu_with_active_dish(admin_client, active_dish)
        menu = Menu.objects.get(pk=menu_id)
        version = menu.versions.first()
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        assert MenuSiteRelease.objects.filter(menu_version=version, site=site).exists()

    def test_publish_draft_dish_version_returns_422(
        self, admin_client, draft_dish, milk, tenant, admin_user, site, assert_status
    ):
        """Menu items must reference ACTIVE dish versions."""
        payload = _menu_payload(draft_dish)
        resp = admin_client.post(MENUS_URL, data=payload, format="json")
        assert_status(resp, 201)
        menu_id = resp.json()["id"]
        menu = Menu.objects.get(pk=menu_id)
        version = menu.versions.first()

        pub_resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        assert_status(pub_resp, 422)

    def test_publish_no_sites_returns_422(self, admin_client, active_dish, assert_status):
        menu_id = self._make_menu_with_active_dish(admin_client, active_dish)
        menu = Menu.objects.get(pk=menu_id)
        version = menu.versions.first()
        pub_resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": []},
            format="json",
        )
        assert_status(pub_resp, 422)

    def test_publish_supersedes_previous_for_same_site(
        self, admin_client, active_dish, site, assert_status
    ):
        """Publishing v2 auto-unpublishes v1 for the same site."""
        menu_id = self._make_menu_with_active_dish(admin_client, active_dish)
        menu = Menu.objects.get(pk=menu_id)
        v1 = menu.versions.first()

        # Publish v1
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{v1.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        v1.refresh_from_db()
        assert v1.status == MenuVersion.Status.PUBLISHED

        # Create v2
        v2_resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/",
            data={
                "description": "Version 2",
                "groups": [
                    {
                        "name": "Mains",
                        "items": [{"dish_version_id": str(active_dish.pk)}],
                    }
                ],
            },
            format="json",
        )
        assert v2_resp.status_code == 201
        v2_id = v2_resp.json()["id"]

        # Publish v2
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{v2_id}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )

        v1.refresh_from_db()
        assert v1.status == MenuVersion.Status.UNPUBLISHED

        v2 = MenuVersion.objects.get(pk=v2_id)
        assert v2.status == MenuVersion.Status.PUBLISHED


# ---------------------------------------------------------------------------
# 4. Unpublish and archive
# ---------------------------------------------------------------------------

class TestUnpublishAndArchive:
    def _published_version(self, admin_client, active_dish, site):
        resp = _create_menu(admin_client, active_dish)
        menu_id = resp.json()["id"]
        menu = Menu.objects.get(pk=menu_id)
        version = menu.versions.first()
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        version.refresh_from_db()
        return menu_id, version

    def test_unpublish_published_returns_200(self, admin_client, active_dish, site, assert_status):
        menu_id, version = self._published_version(admin_client, active_dish, site)
        resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/unpublish/",
            format="json",
        )
        assert_status(resp, 200)
        version.refresh_from_db()
        assert version.status == MenuVersion.Status.UNPUBLISHED

    def test_unpublish_draft_returns_422(self, admin_client, active_dish, assert_status):
        resp = _create_menu(admin_client, active_dish)
        menu_id = resp.json()["id"]
        version = Menu.objects.get(pk=menu_id).versions.first()
        resp2 = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/unpublish/",
            format="json",
        )
        assert_status(resp2, 422)

    def test_archive_unpublished_returns_200(self, admin_client, active_dish, site, assert_status):
        menu_id, version = self._published_version(admin_client, active_dish, site)
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/unpublish/",
            format="json",
        )
        resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/archive/",
            format="json",
        )
        assert_status(resp, 200)
        version.refresh_from_db()
        assert version.status == MenuVersion.Status.ARCHIVED

    def test_archive_published_returns_422(self, admin_client, active_dish, site, assert_status):
        menu_id, version = self._published_version(admin_client, active_dish, site)
        resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/archive/",
            format="json",
        )
        assert_status(resp, 422)

    def test_staff_cannot_archive(
        self, auth_client, staff_user_with_site, active_dish, site, assert_status
    ):
        staff_client = auth_client(staff_user_with_site)
        resp = _create_menu(staff_client, active_dish)
        assert resp.status_code == 201
        menu_id = resp.json()["id"]
        menu = Menu.objects.get(pk=menu_id)
        version = menu.versions.first()

        # Publish first
        staff_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        # Unpublish
        staff_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/unpublish/",
            format="json",
        )
        # Archive (ADMIN-only)
        arc_resp = staff_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/archive/",
            format="json",
        )
        assert_status(arc_resp, 403)


# ---------------------------------------------------------------------------
# 5. STAFF site assignment enforcement
# ---------------------------------------------------------------------------

class TestStaffSiteRestriction:
    def test_staff_without_site_assignment_cannot_publish(
        self, auth_client, staff_user, active_dish, site, assert_status
    ):
        """STAFF user not assigned to site gets 422 when publishing."""
        client = auth_client(staff_user)
        resp = _create_menu(client, active_dish)
        assert_status(resp, 201)
        menu_id = resp.json()["id"]
        version = Menu.objects.get(pk=menu_id).versions.first()

        pub_resp = client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        assert_status(pub_resp, 422)

    def test_staff_with_site_assignment_can_publish(
        self, auth_client, staff_user_with_site, active_dish, site, assert_status
    ):
        client = auth_client(staff_user_with_site)
        resp = _create_menu(client, active_dish)
        assert_status(resp, 201)
        menu_id = resp.json()["id"]
        version = Menu.objects.get(pk=menu_id).versions.first()

        pub_resp = client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        assert_status(pub_resp, 200)


# ---------------------------------------------------------------------------
# 6. Site active menus endpoint
# ---------------------------------------------------------------------------

class TestSiteActiveMenus:
    def test_returns_published_menus_for_site(
        self, admin_client, active_dish, site, assert_status
    ):
        resp = _create_menu(admin_client, active_dish)
        assert_status(resp, 201)
        menu_id = resp.json()["id"]
        version = Menu.objects.get(pk=menu_id).versions.first()
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )

        list_resp = admin_client.get(f"/api/v1/foodservice/sites/{site.pk}/active-menus/")
        assert_status(list_resp, 200)
        data = list_resp.json()
        assert len(data) == 1
        assert data[0]["id"] == str(version.pk)

    def test_unpublished_menus_not_returned(
        self, admin_client, active_dish, site, assert_status
    ):
        resp = _create_menu(admin_client, active_dish)
        menu_id = resp.json()["id"]
        version = Menu.objects.get(pk=menu_id).versions.first()
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(site.pk)]},
            format="json",
        )
        admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/unpublish/",
            format="json",
        )

        list_resp = admin_client.get(f"/api/v1/foodservice/sites/{site.pk}/active-menus/")
        assert_status(list_resp, 200)
        assert list_resp.json() == []


# ---------------------------------------------------------------------------
# 7. Cross-tenant isolation
# ---------------------------------------------------------------------------

class TestCrossTenantIsolation:
    """
    Explicitly asserts that tenant A cannot reference tenant B's resources
    in menu operations. These tests guard against regressions that would
    re-introduce tenant-isolation defects.
    """

    @pytest.fixture
    def other_tenant(self):
        return TenantFactory()

    @pytest.fixture
    def other_tenant_dish(self, other_tenant, milk):
        """An ACTIVE DishVersion that belongs to a *different* tenant."""
        other_admin = AdminUserFactory(tenant=other_tenant)
        dish = Dish.objects.create(tenant=other_tenant, recipe=None, created_by=other_admin)
        version = DishVersion.objects.create(
            dish=dish,
            version_number=1,
            name="Foreign Dish",
            effective_from=TODAY,
            status=DishVersion.Status.DRAFT,
            per_serving_cost=Decimal("4.00"),
            created_by=other_admin,
        )
        DishVersionAllergen.objects.create(dish_version=version, allergen=milk)
        version.activate()
        return version

    @pytest.fixture
    def other_tenant_site(self, other_tenant):
        """A Site that belongs to a *different* tenant."""
        return SiteFactory(tenant=other_tenant)

    def test_foreign_tenant_dish_version_in_menu_group_returns_404(
        self, admin_client, other_tenant_dish, assert_status
    ):
        """
        Attempting to create a menu group referencing a dish_version that
        belongs to another tenant must return 404 (not 201 or 500).
        """
        payload = {
            "name": "Cross-tenant menu",
            "groups": [
                {
                    "name": "Stolen Items",
                    "sort_order": 0,
                    "items": [{"dish_version_id": str(other_tenant_dish.pk), "sort_order": 0}],
                }
            ],
        }
        resp = admin_client.post(MENUS_URL, data=payload, format="json")
        assert_status(resp, 404)

    def test_foreign_tenant_dish_in_new_version_returns_404(
        self, admin_client, active_dish, other_tenant_dish, assert_status
    ):
        """
        Same isolation check when adding a new version to an existing menu.
        """
        # Create a valid menu first
        menu_resp = _create_menu(admin_client, active_dish)
        assert menu_resp.status_code == 201
        menu_id = menu_resp.json()["id"]

        # Try to create a version referencing a foreign dish
        resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/",
            data={
                "description": "Injection attempt",
                "groups": [
                    {
                        "name": "Mains",
                        "items": [{"dish_version_id": str(other_tenant_dish.pk)}],
                    }
                ],
            },
            format="json",
        )
        assert_status(resp, 404)

    def test_foreign_tenant_site_in_publish_returns_422(
        self, admin_client, active_dish, other_tenant_site, assert_status
    ):
        """
        Attempting to publish a menu to a site owned by another tenant
        must be rejected with 422 (Unknown site IDs), not silently succeed.
        """
        menu_resp = _create_menu(admin_client, active_dish)
        assert menu_resp.status_code == 201
        menu_id = menu_resp.json()["id"]
        version = Menu.objects.get(pk=menu_id).versions.first()

        pub_resp = admin_client.post(
            f"{MENUS_URL}{menu_id}/versions/{version.pk}/publish/",
            data={"site_ids": [str(other_tenant_site.pk)]},
            format="json",
        )
        assert_status(pub_resp, 422)
        # Confirm no release was created for the foreign site
        assert not MenuSiteRelease.objects.filter(
            menu_version=version, site=other_tenant_site
        ).exists()
