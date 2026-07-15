import { roles } from '../db';
import { createCrudRouter } from '../lib/crud';

const rolesRouter = createCrudRouter(roles, {
  name: '角色',
  queryKey: 'roles',
  defaultSort: { column: 'name', direction: 'asc' },
});

export default rolesRouter;
