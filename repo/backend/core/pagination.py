"""
core/pagination.py

Cursor-based pagination for all HarborOps API list endpoints.
Default page size: 25. Maximum: 100.

Usage in APIView list handlers
-------------------------------
    from core.pagination import paginate_list

    def get(self, request):
        qs = MyModel.objects.filter(...)
        return paginate_list(request, qs, MySerializer)
"""
from rest_framework.pagination import CursorPagination as _BaseCursorPagination
from rest_framework.response import Response


class CursorPagination(_BaseCursorPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"
    cursor_query_param = "cursor"

    def paginate_queryset(self, queryset, request, view=None):
        # Count total matching records before the cursor slices the queryset.
        self._total_count = queryset.count()
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        return Response({
            "count": self._total_count,
            "next_cursor": self.get_next_link(),
            "previous_cursor": self.get_previous_link(),
            "results": data,
        })

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "count": {"type": "integer"},
                "next_cursor": {"type": "string", "nullable": True},
                "previous_cursor": {"type": "string", "nullable": True},
                "results": schema,
            },
        }


def paginate_list(request, queryset, serializer_class, *,
                  ordering=None, serializer_kwargs=None, post_slice_hook=None):
    """
    Paginate *queryset* and return a DRF Response.

    Args:
        request: The DRF request object.
        queryset: A Django QuerySet (must support .count() and ordering).
        serializer_class: Serializer class to render each page item.
        ordering: String or list of strings overriding the default cursor
            ordering (``"-created_at"``).  Pass the field(s) the queryset is
            meaningfully sorted by so the cursor encodes the right position.
        serializer_kwargs: Extra kwargs forwarded to the serializer
            (e.g. ``{"context": {"request": request}}``).
        post_slice_hook: Optional callable(items) → items that runs on the
            page slice before serialisation — use for per-object annotation
            (e.g. attaching ``_active_version``).

    Returns a paginated ``{"count", "next_cursor", "previous_cursor",
    "results"}`` Response, or a plain list Response when pagination is
    suppressed (e.g. in tests that set a very large page size).
    """
    paginator = CursorPagination()
    if ordering is not None:
        paginator.ordering = ordering
    page = paginator.paginate_queryset(queryset, request)

    if page is not None:
        if post_slice_hook is not None:
            page = post_slice_hook(page)
        data = serializer_class(page, many=True, **(serializer_kwargs or {})).data
        return paginator.get_paginated_response(data)

    # Pagination suppressed (e.g. cursor out of range) — return full set
    items = list(queryset)
    if post_slice_hook is not None:
        items = post_slice_hook(items)
    data = serializer_class(items, many=True, **(serializer_kwargs or {})).data
    return Response(data)
