#!/usr/bin/env bash
# run_tests.sh — Run all backend and frontend tests.
# Usage:
#   ./run_tests.sh             # run both suites
#   ./run_tests.sh --backend   # backend only
#   ./run_tests.sh --frontend  # frontend only
#   ./run_tests.sh --coverage  # backend with coverage report

set -euo pipefail

DC="docker compose"
BACKEND_FAILED=0
FRONTEND_FAILED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

RUN_BACKEND=true
RUN_FRONTEND=true
COVERAGE=false

for arg in "$@"; do
  case $arg in
    --backend)  RUN_FRONTEND=false ;;
    --frontend) RUN_BACKEND=false ;;
    --coverage) COVERAGE=true ;;
  esac
done

echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}          HarborOps Test Runner           ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo ""

# ── Backend ──────────────────────────────────────────────────────────────────
if [ "$RUN_BACKEND" = true ]; then
  echo -e "${BLUE}▶  Backend (pytest)${NC}"
  echo "──────────────────────────────────────────"

  if [ "$COVERAGE" = true ]; then
    PYTEST_CMD="pytest tests/ -v \
      --cov=core --cov=iam --cov=tenants --cov=assets \
      --cov=foodservice --cov=meetings --cov=integrations \
      --cov-report=term-missing --cov-fail-under=80"
  else
    PYTEST_CMD="pytest tests/ -v"
  fi

  if $DC exec django sh -c "$PYTEST_CMD"; then
    echo -e "\n${GREEN}✓  Backend tests passed${NC}\n"
  else
    echo -e "\n${RED}✗  Backend tests FAILED${NC}\n"
    BACKEND_FAILED=1
  fi
fi

# ── Frontend ─────────────────────────────────────────────────────────────────
if [ "$RUN_FRONTEND" = true ]; then
  echo -e "${BLUE}▶  Frontend (vitest)${NC}"
  echo "──────────────────────────────────────────"

  if $DC exec frontend sh -c "npm test -- --reporter=verbose 2>&1"; then
    echo -e "\n${GREEN}✓  Frontend tests passed${NC}\n"
  else
    EXIT=$?
    if [ $EXIT -eq 1 ] && $DC exec frontend sh -c "npm test -- --reporter=verbose 2>&1" | grep -q "No test files found"; then
      echo -e "${YELLOW}⚠  No frontend test files found — skipping${NC}\n"
    else
      echo -e "\n${RED}✗  Frontend tests FAILED${NC}\n"
      FRONTEND_FAILED=1
    fi
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}                  Summary                 ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"

if [ "$RUN_BACKEND" = true ]; then
  if [ $BACKEND_FAILED -eq 0 ]; then
    echo -e "  Backend:  ${GREEN}PASSED${NC}"
  else
    echo -e "  Backend:  ${RED}FAILED${NC}"
  fi
fi

if [ "$RUN_FRONTEND" = true ]; then
  if [ $FRONTEND_FAILED -eq 0 ]; then
    echo -e "  Frontend: ${GREEN}PASSED${NC}"
  else
    echo -e "  Frontend: ${RED}FAILED${NC}"
  fi
fi

echo ""

TOTAL_FAILED=$((BACKEND_FAILED + FRONTEND_FAILED))
exit $TOTAL_FAILED
