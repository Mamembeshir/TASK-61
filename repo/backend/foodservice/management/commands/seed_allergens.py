"""
Management command: seed_allergens

Creates all 15 allergen records (idempotent — safe to run repeatedly).
"""
from django.core.management.base import BaseCommand
from foodservice.models import Allergen

ALLERGENS = [
    ("MILK",      "Milk"),
    ("EGGS",      "Eggs"),
    ("FISH",      "Fish"),
    ("SHELLFISH", "Shellfish"),
    ("TREE_NUTS", "Tree Nuts"),
    ("PEANUTS",   "Peanuts"),
    ("GLUTEN",    "Gluten"),
    ("SOY",       "Soy"),
    ("SESAME",    "Sesame"),
    ("SULFITES",  "Sulfites"),
    ("MUSTARD",   "Mustard"),
    ("CELERY",    "Celery"),
    ("LUPIN",     "Lupin"),
    ("MOLLUSKS",  "Mollusks"),
    ("NONE",      "None"),
]


class Command(BaseCommand):
    help = "Seed all 15 allergen reference records (idempotent)."

    def handle(self, *args, **options):
        created = 0
        for code, name in ALLERGENS:
            _, is_new = Allergen.objects.get_or_create(code=code, defaults={"name": name})
            if is_new:
                created += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Allergens seeded: {created} created, {len(ALLERGENS) - created} already existed."
            )
        )
