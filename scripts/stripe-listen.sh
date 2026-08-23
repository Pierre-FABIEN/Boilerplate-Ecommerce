#!/usr/bin/env bash
# Relais les webhooks Stripe vers le Vite de développement (port 2000).
# Utilise STRIPE_SECRET_KEY du .env, pas la clé expirée du CLI (~/.config/stripe).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
	echo "STRIPE_SECRET_KEY manquant dans .env" >&2
	exit 1
fi

exec stripe listen \
	--api-key "$STRIPE_SECRET_KEY" \
	--forward-to http://localhost:2000/api/webhooks
