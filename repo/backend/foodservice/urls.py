from django.urls import path
from foodservice.views import (
    # Recipe views
    RecipeListCreateView,
    RecipeDetailView,
    RecipeVersionListCreateView,
    RecipeVersionDetailView,
    RecipeVersionActivateView,
    RecipeVersionArchiveView,
    # Dish views
    AllergenListView,
    DishListCreateView,
    DishDetailView,
    DishVersionListCreateView,
    DishVersionActivateView,
    # Menu views
    MenuListCreateView,
    MenuDetailView,
    MenuVersionListCreateView,
    MenuVersionPublishView,
    MenuVersionUnpublishView,
    MenuVersionArchiveView,
    SiteActiveMenusView,
)

urlpatterns = [
    # ── Allergens ─────────────────────────────────────────────────────────
    path("allergens/",                                       AllergenListView.as_view(),           name="allergen-list"),

    # ── Recipe CRUD ───────────────────────────────────────────────────────
    path("recipes/",                                         RecipeListCreateView.as_view(),       name="recipe-list"),
    path("recipes/<uuid:pk>/",                               RecipeDetailView.as_view(),           name="recipe-detail"),
    path("recipes/<uuid:pk>/versions/",                      RecipeVersionListCreateView.as_view(), name="recipe-version-list"),
    path("recipes/<uuid:pk>/versions/<uuid:vid>/",            RecipeVersionDetailView.as_view(),    name="recipe-version-detail"),
    path("recipes/<uuid:pk>/versions/<uuid:vid>/activate/",   RecipeVersionActivateView.as_view(),  name="recipe-version-activate"),
    path("recipes/<uuid:pk>/versions/<uuid:vid>/archive/",    RecipeVersionArchiveView.as_view(),   name="recipe-version-archive"),

    # ── Dish CRUD ─────────────────────────────────────────────────────────
    path("dishes/",                                          DishListCreateView.as_view(),          name="dish-list"),
    path("dishes/<uuid:pk>/",                                DishDetailView.as_view(),              name="dish-detail"),
    path("dishes/<uuid:pk>/versions/",                       DishVersionListCreateView.as_view(),   name="dish-version-list"),
    path("dishes/<uuid:pk>/versions/<uuid:vid>/activate/",   DishVersionActivateView.as_view(),     name="dish-version-activate"),

    # ── Menu CRUD ─────────────────────────────────────────────────────────
    path("menus/",                                                         MenuListCreateView.as_view(),       name="menu-list"),
    path("menus/<uuid:pk>/",                                               MenuDetailView.as_view(),           name="menu-detail"),
    path("menus/<uuid:pk>/versions/",                                      MenuVersionListCreateView.as_view(), name="menu-version-list"),
    path("menus/<uuid:pk>/versions/<uuid:vid>/publish/",                   MenuVersionPublishView.as_view(),   name="menu-version-publish"),
    path("menus/<uuid:pk>/versions/<uuid:vid>/unpublish/",                 MenuVersionUnpublishView.as_view(), name="menu-version-unpublish"),
    path("menus/<uuid:pk>/versions/<uuid:vid>/archive/",                   MenuVersionArchiveView.as_view(),   name="menu-version-archive"),

    # ── Site active menus ─────────────────────────────────────────────────
    path("sites/<uuid:site_id>/active-menus/",                             SiteActiveMenusView.as_view(),      name="site-active-menus"),
]
