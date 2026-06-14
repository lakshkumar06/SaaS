#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

: "${USDC_ADDRESS:?USDC_ADDRESS required}"
: "${COMPANY_ADDRESS:?COMPANY_ADDRESS required}"
: "${KEYSTONE_FORWARDER:?KEYSTONE_FORWARDER required}"
: "${ARC_RPC_URL:?ARC_RPC_URL required}"
: "${PRIVATE_KEY:?PRIVATE_KEY required}"

forge script contracts/script/Deploy.s.sol \
  --root contracts \
  --rpc-url "$ARC_RPC_URL" \
  --broadcast \
  --private-key "$PRIVATE_KEY"
