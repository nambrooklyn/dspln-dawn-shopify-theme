/**
 * Thin client for the Shopify Customer Account GraphQL API.
 * Endpoint pattern verified via /.well-known/customer-account-api.
 */

import { getAccessToken, graphqlEndpoint, shopId } from './customer-auth';

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  email: string;
  /** Numeric Shopify customer id (extracted from the GID), for the designs ownerKey. */
  customerId: string;
}

export interface CustomerOrder {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  totalAmount: string;
  totalCurrency: string;
  statusPageUrl: string | null;
}

async function query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('not-authenticated');
  const response = await fetch(graphqlEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ query: document, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `Customer API error (${response.status})`);
  }
  return payload.data as T;
}

export async function updateProfile(input: {
  firstName: string;
  lastName: string;
}): Promise<CustomerProfile> {
  interface Result {
    customerUpdate: {
      customer: {
        id: string | null;
        firstName: string | null;
        lastName: string | null;
        emailAddress: { emailAddress: string } | null;
      } | null;
      userErrors: Array<{ message: string }>;
    };
  }
  const data = await query<Result>(
    `mutation LockerProfileUpdate($input: CustomerUpdateInput!) {
      customerUpdate(input: $input) {
        customer { id firstName lastName emailAddress { emailAddress } }
        userErrors { message }
      }
    }`,
    { input },
  );
  const result = data.customerUpdate;
  if (result.userErrors.length || !result.customer) {
    throw new Error(result.userErrors[0]?.message || 'Could not update your profile.');
  }
  return {
    firstName: result.customer.firstName ?? '',
    lastName: result.customer.lastName ?? '',
    email: result.customer.emailAddress?.emailAddress ?? '',
    customerId: (result.customer.id ?? '').split('/').pop() ?? '',
  };
}

async function avatarRequest(method: 'GET' | 'POST' | 'DELETE', body?: object) {
  const token = await getAccessToken();
  if (!token) throw new Error('not-authenticated');
  return fetch('/.netlify/functions/customer-avatar', {
    method,
    headers: {
      Authorization: token,
      'X-Shopify-Shop-Id': shopId(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function fetchAvatar(): Promise<string | null> {
  const response = await avatarRequest('GET');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load your profile photo.');
  return URL.createObjectURL(await response.blob());
}

export async function saveAvatar(imageDataUrl: string): Promise<string> {
  const response = await avatarRequest('POST', { imageDataUrl });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not save your profile photo.');
  }
  const avatar = await fetchAvatar();
  if (!avatar) throw new Error('Could not load your saved profile photo.');
  return avatar;
}

export async function deleteAvatar(): Promise<void> {
  const response = await avatarRequest('DELETE');
  if (!response.ok) throw new Error('Could not remove your profile photo.');
}

export async function fetchProfile(): Promise<CustomerProfile> {
  interface Result {
    customer: {
      id: string | null;
      firstName: string | null;
      lastName: string | null;
      emailAddress: { emailAddress: string } | null;
    };
  }
  const data = await query<Result>(`
    query PortalProfile {
      customer {
        id
        firstName
        lastName
        emailAddress { emailAddress }
      }
    }
  `);
  // id is a GID like "gid://shopify/Customer/1234567890"; the designs
  // ownerKey uses the trailing numeric id (same value the theme passes
  // to the configurator as customerId).
  const gid = data.customer.id ?? '';
  const customerId = gid.split('/').pop() ?? '';
  return {
    firstName: data.customer.firstName ?? '',
    lastName: data.customer.lastName ?? '',
    email: data.customer.emailAddress?.emailAddress ?? '',
    customerId,
  };
}

export async function fetchOrders(): Promise<CustomerOrder[]> {
  interface Result {
    customer: {
      orders: {
        nodes: Array<{
          id: string;
          name: string;
          processedAt: string;
          financialStatus: string | null;
          totalPrice: { amount: string; currencyCode: string } | null;
          statusPageUrl: string | null;
        }>;
      };
    };
  }
  const data = await query<Result>(`
    query PortalOrders {
      customer {
        orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
          nodes {
            id
            name
            processedAt
            financialStatus
            totalPrice { amount currencyCode }
            statusPageUrl
          }
        }
      }
    }
  `);
  return data.customer.orders.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    processedAt: node.processedAt,
    financialStatus: node.financialStatus,
    totalAmount: node.totalPrice?.amount ?? '',
    totalCurrency: node.totalPrice?.currencyCode ?? '',
    statusPageUrl: node.statusPageUrl,
  }));
}
