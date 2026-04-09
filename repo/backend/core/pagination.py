"""
core/pagination.py

Cursor-based pagination for all HarborOps API list endpoints.
Default page size: 25. Maximum: 100.
"""
from rest_framework.pagination import CursorPagination as _BaseCursorPagination
from rest_framework.response import Response


class CursorPagination(_BaseCursorPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"
    cursor_query_param = "cursor"

    def get_paginated_response(self, data):
        return Response({
            "next_cursor": self.get_next_link(),
            "previous_cursor": self.get_previous_link(),
            "results": data,
        })

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "next_cursor": {"type": "string", "nullable": True},
                "previous_cursor": {"type": "string", "nullable": True},
                "results": schema,
            },
        }
