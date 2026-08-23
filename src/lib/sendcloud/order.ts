// SENDCLOUD : création de commande après paiement. COMMERCE-PLUGIN y fait appel
// depuis le webhook ; retirer Sendcloud n'empêche pas d'enregistrer la Transaction.
// $lib/sendcloud/order-v3.ts
import dotenv from 'dotenv';
dotenv.config();

type TxForV3 = {
  id: string;
  amount: number;
  currency: string;               // "eur" ou "EUR"
  status: string;                 // "paid" etc.
  products: any;                  // array [{ name, price, quantity, ... }]

  // adresse
  address_first_name: string;
  address_last_name: string;
  address_phone: string;
  address_company?: string | null;
  address_street_number: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  address_country_code: string;   // "FR"
  customer_details_email?: string | null;

  // indicatif
  shippingMethodName: string;

  // colis
  package_length: number;
  package_width: number;
  package_height: number;
  package_dimension_unit: string; // "cm"
  package_weight: number;
  package_weight_unit: string;    // "kg"
  package_volume: number;
  package_volume_unit: string;    // "cm3"

  // relais (optionnel)
  servicePointId?: string | null;
  servicePointPostNumber?: string | null;
  servicePointLatitude?: string | null;
  servicePointLongitude?: string | null;
  servicePointType?: string | null;
  servicePointExtraRefCab?: string | null;
  servicePointExtraShopRef?: string | null;

  createdAt?: Date;
};

function authHeader() {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY;
  const sec = process.env.SENDCLOUD_SECRET_KEY;
  if (!pub || !sec) throw new Error('Sendcloud credentials missing');
  return 'Basic ' + Buffer.from(`${pub}:${sec}`).toString('base64');
}

function requireIntegrationId(): number {
  const raw = process.env.SENDCLOUD_INTEGRATION_ID;
  if (!raw) throw new Error('SENDCLOUD_INTEGRATION_ID missing (V3 Orders)');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error('SENDCLOUD_INTEGRATION_ID invalid');
  return n;
}

function cur3(x?: string | null) { return String(x || 'EUR').toUpperCase(); }
function iso2(x?: string | null) { return String(x || '').toUpperCase(); }
function arr(a: any) { return Array.isArray(a) ? a : []; }

export async function createSendcloudOrderV3(tx: TxForV3) {
  const integrationId = requireIntegrationId();

  const body = [
    {
      order_id: `ORDER-${tx.id}`,
      order_number: `ORDER-${tx.id}`,

      order_details: {
        integration: { id: integrationId },                   // <= IMPORTANT
        status: { code: 'fulfilled', message: 'Paid in full' },
        order_created_at: (tx.createdAt ?? new Date()).toISOString(),
        order_updated_at: new Date().toISOString(),
        order_items: arr(tx.products).map((p: any) => ({
          name: String(p?.name ?? 'Item'),
          quantity: Number(p?.quantity ?? 1),
          total_price: {
            value: Number((Number(p?.price ?? 0) * Number(p?.quantity ?? 1)).toFixed(2)),
            currency: cur3(tx.currency)
          },
          measurement: { weight: { value: 0.124, unit: 'kg' } } // ajuste si tu as mieux
        }))
      },

      payment_details: {
        total_price: { value: Number(tx.amount.toFixed(2)), currency: cur3(tx.currency) },
        status: { code: tx.status || 'paid', message: 'Paid' }
      },

      shipping_address: {
        name: `${tx.address_first_name} ${tx.address_last_name}`.trim(),
        address_line_1: tx.address_street,
        house_number: String(tx.address_street_number ?? ''),
        postal_code: tx.address_zip,
        city: tx.address_city,
        country_code: iso2(tx.address_country_code),
        phone_number: tx.address_phone || '',
        email: tx.customer_details_email || '',
        company_name: tx.address_company || undefined
      },

      shipping_details: {
        is_local_pickup: false,
        delivery_indicator: tx.shippingMethodName,            // juste indicatif
        measurement: {
          dimension: {
            length: tx.package_length,
            width: tx.package_width,
            height: tx.package_height,
            unit: tx.package_dimension_unit
          },
          weight: { value: tx.package_weight, unit: tx.package_weight_unit },
          volume: { value: tx.package_volume, unit: tx.package_volume_unit }
        }
      },

      ...(tx.servicePointId
        ? {
            service_point_details: {
              id: String(tx.servicePointId),
              post_number: tx.servicePointPostNumber || '',
              latitude: tx.servicePointLatitude || '',
              longitude: tx.servicePointLongitude || '',
              type: tx.servicePointType || '',
              extra_data: {
                ref_cab: tx.servicePointExtraRefCab || '',
                shop_ref: tx.servicePointExtraShopRef || ''
              }
            }
          }
        : {})
    }
  ];

  const res = await fetch('https://panel.sendcloud.sc/api/v3/orders', {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });

  console.log('[sendcloud.v3.orders] status=', res.status);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Sendcloud V3 Orders failed (${res.status}): ${txt}`);
  }

  const data = await res.json().catch(() => ({}));
  console.log('[sendcloud.v3.orders] created=', Array.isArray(data?.data) ? data.data.length : 0);
  return data;
}

// Alias pour maintenir la compatibilité avec le webhook
export const createSendcloudOrder = createSendcloudOrderV3;
