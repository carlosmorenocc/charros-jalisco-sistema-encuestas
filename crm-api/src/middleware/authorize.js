import { requirePermission } from '../security/permissions.js';

export function authorize(permission) {
  return function authorizationMiddleware(req, _res, next) {
    try {
      requirePermission(req.actor, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}
