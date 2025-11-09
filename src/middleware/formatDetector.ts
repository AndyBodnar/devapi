import { Request, Response, NextFunction } from 'express';

export interface ClientFormat {
  version: string;
  type: 'legacy' | 'v1' | 'v2' | 'current';
  wrapInData: boolean;
  includeSuccess: boolean;
  fieldMappings?: Record<string, string>;
}

export interface FormatRequest extends Request {
  clientFormat?: ClientFormat;
}

/**
 * Format Detection Middleware
 * Detects what format the client expects based on headers
 */
export const formatDetector = (
  req: FormatRequest,
  res: Response,
  next: NextFunction
): void => {
  // Default to current format
  let format: ClientFormat = {
    version: 'current',
    type: 'current',
    wrapInData: false,
    includeSuccess: false
  };

  // Check for explicit API version header
  const apiVersion = req.headers['x-api-version'] as string;
  if (apiVersion) {
    format = getFormatByVersion(apiVersion);
  }
  // Check for app version (48 Hauling uses this)
  else if (req.headers['app-version']) {
    format = getLegacyFormat();
  }
  // Check user agent
  else if (req.headers['user-agent']) {
    const ua = req.headers['user-agent'].toLowerCase();
    
    // 48 Hauling web panel
    if (ua.includes('48hauling') || ua.includes('devapi')) {
      format = getLegacyFormat();
    }
    // Dashboard
    else if (ua.includes('devdashboard')) {
      format = getLegacyFormat();
    }
  }
  // Check for Authorization header format (legacy check)
  else if (req.headers.authorization) {
    // If they're using our JWT, assume legacy format for now
    format = getLegacyFormat();
  }

  req.clientFormat = format;
  next();
};

function getFormatByVersion(version: string): ClientFormat {
  switch (version) {
    case 'v1':
    case '1':
      return getLegacyFormat();
    case 'v2':
    case '2':
      return {
        version: 'v2',
        type: 'v2',
        wrapInData: true,
        includeSuccess: true
      };
    default:
      return {
        version: 'current',
        type: 'current',
        wrapInData: false,
        includeSuccess: false
      };
  }
}

function getLegacyFormat(): ClientFormat {
  return {
    version: 'legacy',
    type: 'legacy',
    wrapInData: true,
    includeSuccess: true,
    fieldMappings: {
      // Add any field name changes here
      // 'newFieldName': 'oldFieldName'
    }
  };
}

export default formatDetector;
