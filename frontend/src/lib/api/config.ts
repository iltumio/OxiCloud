// Client configuration for API calls
import { createClient } from './client/client.gen';

// Create and export the client instance with base URL
export const client = createClient({
  baseUrl: '/api',
});

