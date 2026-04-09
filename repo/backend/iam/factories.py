"""
iam/factories.py

factory_boy factories for Tenant, Site, User, UserProfile, and related models.
Import these in tests — never use bare Model.objects.create() in tests.
"""
import uuid
import factory
from factory.django import DjangoModelFactory

from tenants.models import Tenant, Site
from iam.models import User, UserProfile, UserSiteAssignment, AccountStatusHistory


class TenantFactory(DjangoModelFactory):
    class Meta:
        model = Tenant
        django_get_or_create = ("slug",)

    name = factory.Sequence(lambda n: f"Tenant {n}")
    slug = factory.Sequence(lambda n: f"tenant-{n}")
    is_active = True


class SiteFactory(DjangoModelFactory):
    class Meta:
        model = Site

    tenant = factory.SubFactory(TenantFactory)
    name   = factory.Sequence(lambda n: f"Site {n}")
    address = "123 Main St"
    timezone = "America/New_York"
    is_active = True


class UserFactory(DjangoModelFactory):
    """Creates an ACTIVE Staff user by default."""

    class Meta:
        model = User
        django_get_or_create = ("tenant", "username")

    tenant   = factory.SubFactory(TenantFactory)
    username = factory.Sequence(lambda n: f"user{n}")
    password = factory.PostGenerationMethodCall("set_password", "Test@pass1!")
    role     = User.Role.STAFF
    status   = User.AccountStatus.ACTIVE
    is_staff = False
    is_active = True


class AdminUserFactory(UserFactory):
    role     = User.Role.ADMIN
    is_staff = True


class PendingUserFactory(UserFactory):
    status = User.AccountStatus.PENDING_REVIEW


class UserProfileFactory(DjangoModelFactory):
    class Meta:
        model = UserProfile

    user   = factory.SubFactory(UserFactory)
    tenant = factory.LazyAttribute(lambda o: o.user.tenant)
    legal_first_name    = factory.Faker("first_name")
    legal_last_name     = factory.Faker("last_name")
    employee_student_id = factory.Sequence(lambda n: f"EMP{n:06d}")
    photo_id_review_status = UserProfile.PhotoIdStatus.PENDING


class UserSiteAssignmentFactory(DjangoModelFactory):
    class Meta:
        model = UserSiteAssignment

    user = factory.SubFactory(UserFactory)
    site = factory.SubFactory(SiteFactory)


class AccountStatusHistoryFactory(DjangoModelFactory):
    class Meta:
        model = AccountStatusHistory

    user       = factory.SubFactory(UserFactory)
    old_status = User.AccountStatus.PENDING_REVIEW
    new_status = User.AccountStatus.ACTIVE
    changed_by = factory.SubFactory(AdminUserFactory)
    reason     = "Approved after manual review."
