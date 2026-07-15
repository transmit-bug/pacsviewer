import { reportTemplates } from '../db';
import { createCrudRouter } from '../lib/crud';

const reportTemplatesRouter = createCrudRouter(reportTemplates, {
  name: '报告模板',
  queryKey: 'reportTemplates',
  defaultSort: { column: 'name', direction: 'asc' },
});

export default reportTemplatesRouter;
