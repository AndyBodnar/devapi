import { Request, Response, NextFunction } from 'express';
import { FormatRequest, ClientFormat } from './formatDetector';

/**
 * Response Transformer Middleware
 * Transforms API responses to match client's expected format
 */
export const responseTransformer = (
  req: FormatRequest,
  res: Response,
  next: NextFunction
): void => {
  const originalJson = res.json.bind(res);

  // Override res.json to transform response
  res.json = function (data: any): Response {
    const format = req.clientFormat;

    if (!format) {
      return originalJson(data);
    }

    const transformedData = transformResponse(data, format, req);
    return originalJson(transformedData);
  };

  next();
};

function transformResponse(data: any, format: ClientFormat, req: Request): any {
  // If data is already an error response, don't transform
  if (data.error) {
    return ensureFormat(data, format);
  }

  // Handle different response types
  switch (format.type) {
    case 'legacy':
    case 'v1':
      return transformToLegacy(data, format, req);
    case 'v2':
      return transformToV2(data, format);
    case 'current':
    default:
      return data;
  }
}

function transformToLegacy(data: any, format: ClientFormat, req: Request): any {
  // If already in correct format, return as-is
  if (data.success !== undefined && data.data !== undefined) {
    return data;
  }

  // Special handling for auth endpoints
  if (req.path.includes('/auth/login') || req.path.includes('/auth/register')) {
    // Login/register expects: { success: true, data: { user, token } }
    if (data.user && data.token) {
      return {
        success: true,
        data: {
          user: data.user,
          token: data.token
        }
      };
    }
    // If it's already nested in data
    if (data.data && data.data.user && data.data.token) {
      return {
        success: true,
        data: data.data
      };
    }
  }

  // For /auth/me endpoint
  if (req.path.includes('/auth/me')) {
    if (data.user) {
      return data; // Already correct format
    }
  }

  // Generic transformation
  if (format.wrapInData) {
    return {
      success: true,
      data: data
    };
  }

  return data;
}

function transformToV2(data: any, format: ClientFormat): any {
  if (format.wrapInData && !data.data) {
    return {
      success: true,
      data: data
    };
  }
  return data;
}

function ensureFormat(data: any, format: ClientFormat): any {
  // Error responses should always have success: false
  if (data.error && !data.success) {
    return {
      success: false,
      error: data.error,
      message: data.message
    };
  }
  return data;
}

export default responseTransformer;
