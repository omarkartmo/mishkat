import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { supportAgentService } from '../services/supportAgentService';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  logger.error(`[Server Internal Error] ${err.message}`, {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    status,
    code,
  });

  // Automatically enqueue severe server errors (500+) to support agent outbound queue
  if (status >= 500) {
    supportAgentService.enqueueOutboundReport({
      sourceType: 'server',
      component: 'express_server',
      errorType: 'server_internal_error',
      errorCode: String(code),
      severity: 'critical',
      message: err.message || 'Unhandled Server Error',
      stackTrace: err.stack,
      diagnosticContext: {
        method: req.method,
        route: req.originalUrl || req.url,
        statusCode: status,
      },
    }).catch(() => {});
  }
  
  // Clean message for production without stack traces
  const message = err.isCustomError || status < 500
    ? err.message
    : 'حدث خطأ في معالجة الطلب على خادم المكتبة المركزي. يرجى المحاولة لاحقاً.';

  res.status(status).json({
    success: false,
    error: {
      code: String(code),
      message: message,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
}

