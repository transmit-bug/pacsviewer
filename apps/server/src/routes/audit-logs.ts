import { auditLogs } from '../db';
import { createCrudRouter } from '../lib/crud';

const auditLogsRouter = createCrudRouter(auditLogs, {
  name: '审计日志',
  queryKey: 'auditLogs',
  with: { user: true },
});

export default auditLogsRouter;
