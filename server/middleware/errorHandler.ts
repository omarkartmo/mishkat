import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('💥 [Server Internal Error]', err);

  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  
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
