/**
 * Thin client for the Shopify Customer Account GraphQL API.
 * Endpoint pattern verified via /.well-known/customer-account-api.
 */

import { getAccessToken, graphqlEndpoint } from './customer-auth';

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  email: string;
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

async function query<T>(document: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('not-authenticated');
  const response = await fetch(graphqlEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ query: document }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `Customer API error (${response.status})`);
  }
  return payload.data as T;
}

export async function fetchProfile(): Promise<CustomerProfile> {
  interface Result {
    customer: {
      firstName: string | null;
      lastName: string | null;
      emailAddress: { emailAddress: string } | null;
    };
  }
  const data = await query<Result>(`
    query PortalProfile {
      customer {
        firstName
        lastName
        emailAddress { emailAddress }
      }
    }
  `);
  return {
    firstName: data.customer.firstName ?? '',
    lastName: data.customer.lastName ?? '',
    email: data.customer.emailAddress?.emailAddress ?? '',
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
