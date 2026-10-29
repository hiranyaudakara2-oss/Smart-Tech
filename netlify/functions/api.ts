import { handleSmartTechApiRequest } from '../../src/server/apiCore';

interface NetlifyHandlerEvent {
  httpMethod: string;
  path: string;
  rawUrl?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface NetlifyHandlerResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

export const handler = async (event: NetlifyHandlerEvent): Promise<NetlifyHandlerResult> => {
  try {
    let pathname = event.path || '/';
    if (event.rawUrl) {
      try {
        const parsedUrl = new URL(event.rawUrl);
        pathname = parsedUrl.pathname;
      } catch {
        // Fallback to event.path
      }
    }

    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(event.headers || {})) {
      headers[k.toLowerCase()] = v;
    }

    const rawBody = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
      : Buffer.alloc(0);

    const forwardedIp = (
      headers['x-nf-client-connection-ip'] ||
      headers['x-forwarded-for'] ||
      'unknown'
    )
      .split(',')[0]
      .trim();

    const response = await handleSmartTechApiRequest({
      method: event.httpMethod || 'GET',
      pathname,
      query: event.queryStringParameters || {},
      headers,
      rawBody,
      ip: forwardedIp,
    });

    if (response.isBinary && Buffer.isBuffer(response.body)) {
      return {
        statusCode: response.status,
        headers: response.headers,
        body: response.body.toString('base64'),
        isBase64Encoded: true,
      };
    }

    return {
      statusCode: response.status,
      headers: response.headers,
      body: Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.body,
      isBase64Encoded: false,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal serverless execution error.',
      }),
    };
  }
};
