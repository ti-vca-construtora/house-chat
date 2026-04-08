/**
 * RBAC hardcoded — sem dependência de tabelas no banco.
 * Para adicionar um novo role ou permissão, edite ROLE_PERMISSIONS abaixo.
 */

const ROLE_PERMISSIONS = {
  admin: new Set([
    'view_empreendimentos',
    'view_unidades',
    'view_reservas',
    'view_clientes',
    'view_financeiro',
    'view_tabela_preco',
  ]),
  corretor: new Set([
    'view_empreendimentos',
    'view_unidades',
    'view_tabela_preco',
  ]),
};

async function hasPermissions(role, permissionNames) {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  return permissionNames.every((p) => rolePerms.has(p));
}

async function getRolePermissions(role) {
  return Array.from(ROLE_PERMISSIONS[role] || []);
}

// Mantido por compatibilidade — no-op
function invalidateCache() {}

module.exports = { hasPermissions, getRolePermissions, invalidateCache };
