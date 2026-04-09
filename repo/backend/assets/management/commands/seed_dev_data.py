"""
Management command: seed_dev_data

Creates a minimal but complete dev dataset so the frontend can be verified
end-to-end without manual setup. Idempotent — safe to run on every boot.

Accounts created
----------------
  admin@demo.test   / Admin1234!   (ADMIN)
  staff@demo.test   / Staff1234!   (STAFF  – assigned to Main Warehouse)
  courier@demo.test / Courier1234! (COURIER – assigned to Main Warehouse)
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Seed dev data (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options):
        from tenants.models import Tenant, Site
        from iam.models import User, UserSiteAssignment, AccountStatusHistory
        from assets.models import AssetClassification, Asset, AssetVersion

        # ── Tenant ────────────────────────────────────────────────────────────
        tenant, _ = Tenant.objects.get_or_create(
            slug="demo",
            defaults={"name": "Demo Corp", "is_active": True},
        )
        self.stdout.write(f"  tenant: {tenant.name}")

        # ── Sites ─────────────────────────────────────────────────────────────
        site_main, _ = Site.objects.get_or_create(
            tenant=tenant,
            name="Main Warehouse",
            defaults={"address": "1 Harbour Rd", "timezone": "UTC", "is_active": True},
        )
        site_b, _ = Site.objects.get_or_create(
            tenant=tenant,
            name="Depot B",
            defaults={"address": "2 Depot Ave", "timezone": "UTC", "is_active": True},
        )
        self.stdout.write(f"  sites: {site_main.name}, {site_b.name}")

        # ── Users ─────────────────────────────────────────────────────────────
        def _get_or_create_user(username, role, password):
            user, created = User.objects.get_or_create(
                tenant=tenant,
                username=username,
                defaults={
                    "role": role,
                    "status": User.AccountStatus.ACTIVE,
                    "is_staff": role == User.Role.ADMIN,
                    "is_superuser": role == User.Role.ADMIN,
                },
            )
            if created:
                user.set_password(password)
                user.save(update_fields=["password"])
                AccountStatusHistory.objects.create(
                    user=user,
                    old_status=User.AccountStatus.PENDING_REVIEW,
                    new_status=User.AccountStatus.ACTIVE,
                    changed_by=user,
                    reason="Seeded by seed_dev_data",
                )
            return user

        admin   = _get_or_create_user("admin",   User.Role.ADMIN,   "Admin1234!")
        staff   = _get_or_create_user("staff",   User.Role.STAFF,   "Staff1234!")
        courier = _get_or_create_user("courier", User.Role.COURIER, "Courier1234!")
        self.stdout.write(f"  users: admin, staff, courier")

        # ── Site assignments ──────────────────────────────────────────────────
        for user in (staff, courier):
            UserSiteAssignment.objects.get_or_create(user=user, site=site_main)
        self.stdout.write("  site assignments: staff+courier → Main Warehouse")

        # ── Classifications ───────────────────────────────────────────────────
        eq, _ = AssetClassification.objects.get_or_create(
            tenant=tenant, code="EQ",
            defaults={"name": "Equipment", "is_active": True},
        )
        it, _ = AssetClassification.objects.get_or_create(
            tenant=tenant, code="EQ.IT",
            defaults={"name": "IT Equipment", "parent": eq, "is_active": True},
        )
        laptop, _ = AssetClassification.objects.get_or_create(
            tenant=tenant, code="EQ.IT.LPT",
            defaults={"name": "Laptops", "parent": it, "is_active": True},
        )
        furn, _ = AssetClassification.objects.get_or_create(
            tenant=tenant, code="FURN",
            defaults={"name": "Furniture", "is_active": True},
        )
        self.stdout.write("  classifications: EQ / EQ.IT / EQ.IT.LPT / FURN")

        # ── Assets ────────────────────────────────────────────────────────────
        def _get_or_create_asset(site, code, name, classification, fields=None):
            try:
                asset = Asset.objects.get(site=site, asset_code=code)
                return asset, False
            except Asset.DoesNotExist:
                pass
            asset = Asset(
                site=site,
                asset_code=code,
                name=name,
                classification=classification,
            )
            asset.fingerprint = asset.compute_fingerprint()
            asset.save()
            snapshot = {"name": name, "classification_code": classification.code}
            if fields:
                snapshot.update(fields)
            version = AssetVersion.objects.create(
                asset=asset,
                version_number=1,
                data_snapshot=snapshot,
                change_source=AssetVersion.ChangeSource.MANUAL,
                changed_by=admin,
                note="Initial creation (seed)",
            )
            asset.current_version = version
            asset.save(update_fields=["current_version"])
            return asset, True

        a1, _ = _get_or_create_asset(
            site_main, "LPT-001", "MacBook Pro 14\"", laptop,
            {"serial": "C02XG1234", "condition": "Good"},
        )
        a2, _ = _get_or_create_asset(
            site_main, "LPT-002", "Dell XPS 15", laptop,
            {"serial": "5CG1234XY", "condition": "Fair"},
        )
        a3, _ = _get_or_create_asset(
            site_main, "CHR-001", "Ergonomic Chair", furn,
            {"color": "Black", "brand": "Herman Miller"},
        )
        a4, _ = _get_or_create_asset(
            site_b, "LPT-003", "ThinkPad X1 Carbon", laptop,
            {"serial": "PF2WXYZ", "condition": "New"},
        )
        self.stdout.write(f"  assets: LPT-001, LPT-002, CHR-001 @ Main Warehouse; LPT-003 @ Depot B")

        # ── Add a second version to LPT-001 for timeline testing ─────────────
        if a1.current_version and a1.current_version.version_number == 1:
            if not AssetVersion.objects.filter(asset=a1, version_number=2).exists():
                v2 = AssetVersion.objects.create(
                    asset=a1,
                    version_number=2,
                    data_snapshot={
                        "name": a1.name,
                        "classification_code": laptop.code,
                        "serial": "C02XG1234",
                        "condition": "Repaired",
                        "repair_date": "2026-01-15",
                    },
                    change_source=AssetVersion.ChangeSource.MANUAL,
                    changed_by=staff,
                    note="Post-repair condition update",
                )
                a1.current_version = v2
                a1.save(update_fields=["current_version"])
                self.stdout.write("  added v2 to LPT-001 for timeline diff test")

        self.stdout.write(self.style.SUCCESS("Dev seed complete."))
