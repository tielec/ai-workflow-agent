import { logger as baseLogger } from '../../utils/logger.js';

function resolveLogger(): typeof baseLogger {
  const override = (globalThis as {
    __ai_workflow_logger_override?: typeof baseLogger;
  }).__ai_workflow_logger_override;
  return override ?? baseLogger;
}

export const logger: typeof baseLogger = new Proxy(baseLogger, {
  get(_target, prop) {
    const resolved = resolveLogger();
    return (resolved as any)[prop as keyof typeof resolved];
  },
});
