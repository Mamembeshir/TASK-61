"""
assets/factories.py

factory_boy factories for AssetClassification, Asset, and AssetVersion.
Import these in tests — never use bare Model.objects.create() in tests.
"""
import factory
from factory.django import DjangoModelFactory

from assets.models import Asset, AssetClassification, AssetVersion
from iam.factories import SiteFactory, TenantFactory, UserFactory


class AssetClassificationFactory(DjangoModelFactory):
    class Meta:
        model = AssetClassification

    tenant    = factory.SubFactory(TenantFactory)
    code      = factory.Sequence(lambda n: f"CAT{n:03d}")
    name      = factory.Sequence(lambda n: f"Category {n}")
    parent    = None
    is_active = True


class AssetFactory(DjangoModelFactory):
    """
    Creates an Asset with version 1 (via post_generation).
    The factory leaves `current_version` and `fingerprint` empty initially;
    the post_generation hook creates version 1 and updates both.
    """

    class Meta:
        model = Asset

    site           = factory.SubFactory(SiteFactory)
    asset_code     = factory.Sequence(lambda n: f"AST{n:03d}")
    name           = factory.Sequence(lambda n: f"Asset {n}")
    classification = factory.SubFactory(
        AssetClassificationFactory,
        tenant=factory.SelfAttribute("..site.tenant"),
    )
    fingerprint = ""
    is_deleted  = False

    @factory.post_generation
    def with_version(self, create, extracted, **kwargs):
        """Create version 1 and set fingerprint. Pass with_version=False to skip."""
        if not create:
            return
        if extracted is False:
            return

        version = AssetVersion.objects.create(
            asset=self,
            version_number=1,
            data_snapshot=kwargs.get("data_snapshot", {}),
            change_source=AssetVersion.ChangeSource.MANUAL,
            changed_by=None,
        )
        import hashlib
        raw = "|".join([
            str(self.site_id),
            self.asset_code.lower(),
            self.name.lower(),
            self.classification.code,
        ])
        fp = hashlib.sha256(raw.encode()).hexdigest()
        Asset.objects.filter(pk=self.pk).update(
            current_version_id=version.pk,
            fingerprint=fp,
        )
        self.current_version = version
        self.fingerprint = fp


class AssetVersionFactory(DjangoModelFactory):
    class Meta:
        model = AssetVersion

    asset          = factory.SubFactory(AssetFactory)
    version_number = factory.Sequence(lambda n: n + 1)
    data_snapshot  = factory.LazyFunction(dict)
    change_source  = AssetVersion.ChangeSource.MANUAL
    changed_by     = factory.SubFactory(UserFactory)
