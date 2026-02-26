import { hc } from 'hono/client';

import type { AppType } from '~/decomp-atlas-server/server';

export const apiClient = hc<AppType>('/');
