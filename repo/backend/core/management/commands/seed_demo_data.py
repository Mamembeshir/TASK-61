"""
core/management/commands/seed_demo_data.py

Creates a complete demo dataset for the Coastal University tenant.

Usage:
    python manage.py seed_demo_data
    python manage.py seed_demo_data --flush   # drops existing demo data first

What gets created
-----------------
Tenant:    Coastal University  (slug: coastal-university)
Sites:     3  (Main Campus, North Campus, South Campus)
Users:     5  (1 admin, 2 staff, 2 couriers) — all ACTIVE
Assets:    10 assets across the 3 sites
Recipes:   3 recipes with ingredients and an ACTIVE version each
Dishes:    5 dishes with ACTIVE versions
Menu:      1 menu with 1 PUBLISHED version (groups + items)
Meeting:   1 SCHEDULED meeting with agenda items
Alerts:    2 alerts (OPEN WARNING, OPEN CRITICAL)
Webhook:   1 active webhook endpoint
"""

from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from tenants.models import Tenant, Site
from iam.models import User, UserProfile, UserSiteAssignment


class Command(BaseCommand):
    help = "Seed demo data for the Coastal University tenant."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete existing Coastal University data before seeding.",
        )

    def handle(self, *args, **options):
        if options["flush"]:
            self.stdout.write("Flushing existing Coastal University data…")
            Tenant.objects.filter(slug="coastal-university").delete()
            self.stdout.write(self.style.WARNING("  ✓ Flushed."))

        with transaction.atomic():
            self._seed()

        self.stdout.write(self.style.SUCCESS("\n✅  Demo data seeded successfully."))

    # ------------------------------------------------------------------

    def _seed(self):
        # 1. Tenant
        tenant, created = Tenant.objects.get_or_create(
            slug="coastal-university",
            defaults={
                "name": "Coastal University",
                "is_active": True,
            },
        )
        self.stdout.write(f"  Tenant: {tenant.name} ({'created' if created else 'existing'})")

        # 2. Sites
        site_main  = self._site(tenant, "Main Campus",  "1 University Ave, Coastal City, CA 90210")
        site_north = self._site(tenant, "North Campus",  "200 North Rd, Coastal City, CA 90211")
        site_south = self._site(tenant, "South Campus",  "300 South Blvd, Coastal City, CA 90212")
        sites = [site_main, site_north, site_south]
        self.stdout.write(f"  Sites: {len(sites)} created/found")

        # 3. Users
        admin = self._user(
            tenant, "admin.coastal", "Admin", "User",
            role=User.Role.ADMIN, status=User.AccountStatus.ACTIVE,
            is_staff=True, emp_id="ADM001",
        )
        staff1 = self._user(
            tenant, "alice.staff", "Alice", "Nguyen",
            role=User.Role.STAFF, emp_id="STF001",
        )
        staff2 = self._user(
            tenant, "bob.staff", "Bob", "Chen",
            role=User.Role.STAFF, emp_id="STF002",
        )
        courier1 = self._user(
            tenant, "carlos.courier", "Carlos", "Rivera",
            role=User.Role.COURIER, emp_id="CUR001",
        )
        courier2 = self._user(
            tenant, "diana.courier", "Diana", "Patel",
            role=User.Role.COURIER, emp_id="CUR002",
        )
        self.stdout.write("  Users: 5 created/found")

        # Site assignments
        for user, assigned_sites in [
            (staff1, [site_main, site_north]),
            (staff2, [site_south]),
            (courier1, [site_main]),
            (courier2, [site_north, site_south]),
        ]:
            for site in assigned_sites:
                UserSiteAssignment.objects.get_or_create(user=user, site=site)
        self.stdout.write("  Site assignments: configured")

        # 4. Assets
        self._seed_assets(tenant, sites, admin)

        # 5. Foodservice (recipes, dishes, menu)
        self._seed_foodservice(tenant, site_main, admin)

        # 6. Meeting
        self._seed_meeting(tenant, site_main, admin, staff1)

        # 7. Alerts
        self._seed_alerts(tenant)

        # 8. Webhook endpoint
        self._seed_webhook(tenant, admin)

    # ------------------------------------------------------------------
    # Asset helpers
    # ------------------------------------------------------------------

    def _seed_assets(self, tenant, sites, user):
        from assets.models import AssetClassification, Asset, AssetVersion

        # Classifications
        l1 = self._get_or_create_classification(tenant, "EQUIP", "Equipment", None)
        l2 = self._get_or_create_classification(tenant, "EQUIP.KITCHEN", "Kitchen Equipment", l1)
        l3 = self._get_or_create_classification(tenant, "EQUIP.KITCHEN.OVEN", "Commercial Ovens", l2)

        asset_specs = [
            ("OVEN-001", "Convection Oven Alpha",  sites[0], l3),
            ("OVEN-002", "Convection Oven Beta",   sites[0], l3),
            ("OVEN-003", "Combi Oven Main",         sites[1], l3),
            ("FRZ-001",  "Walk-In Freezer A",       sites[0], l2),
            ("FRZ-002",  "Walk-In Freezer B",       sites[2], l2),
            ("GRILL-001","Commercial Grill",         sites[1], l2),
            ("MIXER-001","20QT Stand Mixer",         sites[0], l2),
            ("MIXER-002","20QT Stand Mixer",         sites[2], l2),
            ("FRYER-001","Deep Fryer Unit",          sites[1], l2),
            ("SLICER-001","Commercial Slicer",       sites[2], l2),
        ]

        count = 0
        for code, name, site, classification in asset_specs:
            try:
                asset, created = Asset.objects.get_or_create(
                    site=site,
                    asset_code=code,
                    defaults={
                        "name": name,
                        "classification": classification,
                        "fingerprint": "placeholder",
                    },
                )
                if created:
                    asset.create_version(
                        data={"name": name, "status": "operational"},
                        source=AssetVersion.ChangeSource.MANUAL,
                        user=user,
                        note="Initial seed",
                    )
                    count += 1
            except Exception:
                pass  # skip duplicates gracefully

        self.stdout.write(f"  Assets: {count} created")

    def _get_or_create_classification(self, tenant, code, name, parent):
        from assets.models import AssetClassification
        obj, _ = AssetClassification.objects.get_or_create(
            tenant=tenant,
            code=code,
            defaults={"name": name, "parent": parent, "is_active": True},
        )
        return obj

    # ------------------------------------------------------------------
    # Foodservice helpers
    # ------------------------------------------------------------------

    def _seed_foodservice(self, tenant, site, user):
        from foodservice.models import (
            Recipe, RecipeVersion, RecipeIngredient,
            Dish, DishVersion,
            Menu, MenuVersion, MenuGroup, MenuGroupItem, Allergen,
        )

        today = date.today()

        # --- Seed allergens if not already present ---
        for code, name in Allergen.Code.choices:
            Allergen.objects.get_or_create(code=code, defaults={"name": name})

        # ---- Recipes ----
        recipe_data = [
            ("Classic Marinara Sauce", [
                ("Crushed Tomatoes", Decimal("28.0000"), "oz", Decimal("0.0500")),
                ("Olive Oil",        Decimal("2.0000"),  "tbsp", Decimal("0.1000")),
                ("Garlic",           Decimal("3.0000"),  "each", Decimal("0.0500")),
                ("Basil",            Decimal("1.0000"),  "cup", Decimal("0.2000")),
            ]),
            ("Chicken Stock", [
                ("Chicken Bones",    Decimal("3.0000"),  "lb",   Decimal("0.8000")),
                ("Carrots",          Decimal("2.0000"),  "each", Decimal("0.3000")),
                ("Celery",           Decimal("2.0000"),  "each", Decimal("0.2000")),
                ("Onion",            Decimal("1.0000"),  "each", Decimal("0.5000")),
            ]),
            ("Caesar Dressing", [
                ("Egg Yolk",         Decimal("2.0000"),  "each", Decimal("0.2500")),
                ("Lemon Juice",      Decimal("2.0000"),  "tbsp", Decimal("0.1000")),
                ("Parmesan",         Decimal("0.5000"),  "cup",  Decimal("1.2000")),
                ("Anchovy Paste",    Decimal("1.0000"),  "tsp",  Decimal("0.3000")),
            ]),
        ]

        recipes = []
        for recipe_name, ingredients in recipe_data:
            recipe, _ = Recipe.objects.get_or_create(
                tenant=tenant,
                name=recipe_name,
                defaults={"created_by": user},
            )
            # Create/activate version if no active version
            if not recipe.active_version:
                existing = recipe.versions.filter(status=RecipeVersion.Status.DRAFT).first()
                if not existing:
                    existing = RecipeVersion.objects.create(
                        recipe=recipe,
                        version_number=1,
                        effective_from=today,
                        servings=Decimal("8.0000"),
                        created_by=user,
                    )
                    for i, (ing_name, qty, unit, cost) in enumerate(ingredients):
                        RecipeIngredient.objects.get_or_create(
                            recipe_version=existing,
                            ingredient_name=ing_name,
                            defaults={
                                "quantity": qty,
                                "unit": unit,
                                "unit_cost": cost,
                                "sort_order": i,
                            },
                        )
                try:
                    existing.activate()
                except Exception:
                    pass  # already active or constraint
            recipes.append(recipe)
        self.stdout.write(f"  Recipes: {len(recipes)} created/found")

        # ---- Dishes ----
        dish_specs = [
            ("Margherita Pizza",    recipes[0], Decimal("8.50")),
            ("Pasta Marinara",      recipes[0], Decimal("6.25")),
            ("Chicken Soup",        recipes[1], Decimal("4.75")),
            ("Caesar Salad",        recipes[2], Decimal("7.00")),
            ("Garlic Bread",        None,       Decimal("2.50")),
        ]

        dishes = []
        for dish_name, recipe, cost in dish_specs:
            dish, _ = Dish.objects.get_or_create(
                tenant=tenant,
                recipe=recipe,
                created_by=user,
                # Dish has no unique name — use recipe as proxy
            ) if recipe else (
                Dish.objects.filter(tenant=tenant, recipe__isnull=True).first()
                or Dish.objects.create(tenant=tenant, recipe=None, created_by=user),
                False,
            )

            if not dish.active_version:
                existing_dv = dish.versions.filter(status=DishVersion.Status.DRAFT).first()
                if not existing_dv:
                    existing_dv = DishVersion.objects.create(
                        dish=dish,
                        version_number=1,
                        name=dish_name,
                        effective_from=today,
                        per_serving_cost=cost,
                        created_by=user,
                    )
                try:
                    existing_dv.activate()
                except Exception:
                    pass
            dishes.append(dish)
        self.stdout.write(f"  Dishes: {len(dishes)} created/found")

        # ---- Menu ----
        menu, _ = Menu.objects.get_or_create(
            tenant=tenant,
            name="Spring 2026 Menu",
            defaults={"created_by": user},
        )
        if not menu.active_version:
            mv = MenuVersion.objects.create(
                menu=menu,
                version_number=1,
                description="Spring semester dining options",
                created_by=user,
                status=MenuVersion.Status.DRAFT,
            )
            # Build groups with active dish versions
            active_dish_versions = [
                d.active_version for d in dishes[:4] if d.active_version
            ]
            if active_dish_versions:
                group = MenuGroup.objects.create(
                    menu_version=mv,
                    name="Main Dishes",
                    sort_order=0,
                )
                for i, dv in enumerate(active_dish_versions[:3]):
                    MenuGroupItem.objects.get_or_create(
                        menu_group=group,
                        dish_version=dv,
                        defaults={"sort_order": i},
                    )
                try:
                    mv.publish(user, [str(site.pk)])
                    self.stdout.write("  Menu: published")
                except Exception as e:
                    self.stdout.write(f"  Menu: draft (publish failed: {e})")
            else:
                self.stdout.write("  Menu: created as draft (no active dish versions)")
        else:
            self.stdout.write("  Menu: already published")

    # ------------------------------------------------------------------
    # Meeting helpers
    # ------------------------------------------------------------------

    def _seed_meeting(self, tenant, site, admin, staff):
        from meetings.models import Meeting, AgendaItem
        from django.utils import timezone

        meeting, created = Meeting.objects.get_or_create(
            tenant=tenant,
            title="Q2 Operations Review",
            defaults={
                "site": site,
                "scheduled_at": timezone.now() + timedelta(days=7),
                "created_by": admin,
                "status": Meeting.Status.DRAFT,
            },
        )
        if created or meeting.status == Meeting.Status.DRAFT:
            # Add agenda items
            if not meeting.agenda_items.exists():
                AgendaItem.objects.create(
                    meeting=meeting,
                    title="Asset Inventory Review",
                    description="Review all assets flagged for maintenance in Q1.",
                    sort_order=0,
                    submitted_by=admin,
                )
                AgendaItem.objects.create(
                    meeting=meeting,
                    title="Menu Planning for Summer",
                    description="Propose summer menu changes based on supplier pricing.",
                    sort_order=1,
                    submitted_by=staff,
                )
            if meeting.status == Meeting.Status.DRAFT:
                try:
                    meeting.transition_status(Meeting.Status.SCHEDULED, changed_by=admin)
                except Exception:
                    pass
        self.stdout.write(f"  Meeting: '{meeting.title}' ({meeting.status})")

    # ------------------------------------------------------------------
    # Alert helpers
    # ------------------------------------------------------------------

    def _seed_alerts(self, tenant):
        from integrations.models import Alert

        Alert.objects.get_or_create(
            tenant=tenant,
            alert_type=Alert.AlertType.OVERDUE_THRESHOLD,
            severity=Alert.Severity.WARNING,
            message="10 assets have missed their scheduled inspection dates.",
            defaults={"status": Alert.Status.OPEN},
        )
        Alert.objects.get_or_create(
            tenant=tenant,
            alert_type=Alert.AlertType.CELERY_FAILURE,
            severity=Alert.Severity.CRITICAL,
            message="Bulk import job #3 failed with a parsing error on row 47.",
            defaults={"status": Alert.Status.OPEN},
        )
        self.stdout.write("  Alerts: 2 created/found")

    # ------------------------------------------------------------------
    # Webhook helpers
    # ------------------------------------------------------------------

    def _seed_webhook(self, tenant, user):
        from integrations.models import WebhookEndpoint

        WebhookEndpoint.objects.get_or_create(
            tenant=tenant,
            url="https://hooks.coastaluniversity.edu/harborops",
            defaults={
                "secret": "demo-secret-coastal-2026",
                "events": ["MENU_PUBLISHED", "ALERT_CREATED", "IMPORT_COMPLETED"],
                "is_active": True,
            },
        )
        self.stdout.write("  Webhook: 1 endpoint created/found")

    # ------------------------------------------------------------------
    # Generic helpers
    # ------------------------------------------------------------------

    def _site(self, tenant, name, address):
        site, _ = Site.objects.get_or_create(
            tenant=tenant,
            name=name,
            defaults={"address": address, "timezone": "America/New_York", "is_active": True},
        )
        return site

    def _user(self, tenant, username, first_name, last_name, emp_id,
              role=User.Role.STAFF, status=User.AccountStatus.ACTIVE, is_staff=False):
        user, created = User.objects.get_or_create(
            tenant=tenant,
            username=username,
            defaults={
                "role": role,
                "status": status,
                "is_staff": is_staff,
                "is_active": True,
            },
        )
        if created:
            user.set_password("Demo@pass1!")
            user.save(update_fields=["password"])
            UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    "tenant": tenant,
                    "legal_first_name": first_name,
                    "legal_last_name": last_name,
                    "employee_student_id": emp_id,
                    "photo_id_review_status": UserProfile.PhotoIdStatus.APPROVED,
                },
            )
        return user
