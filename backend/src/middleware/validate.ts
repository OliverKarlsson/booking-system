import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Zod validation middleware for body / query / params.
 *
 * The parsed result is written *back* onto the request rather than merely checked. That
 * matters for query strings in particular: everything arrives as a string, and the
 * schemas coerce `page`/`limit` to numbers and apply defaults. Handing the handler the
 * raw `req.query` after validating a coerced copy would mean the type it sees and the
 * type it was promised disagree — the sort of drift that only shows up as `"20" + 1`.
 *
 * Failures are forwarded to `errorHandler`, which owns the mapping to
 * `VALIDATION_ERROR`; nothing here formats a response, so there is one place where the
 * error envelope is constructed.
 *
 * (Writing back to `req.query` is safe on Express 4, where it is a plain property. On
 * Express 5 it becomes a getter and this would need to move to a side channel.)
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params'];
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as Request['query'];
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const validateBody = (schema: ZodType): RequestHandler => validate({ body: schema });
export const validateQuery = (schema: ZodType): RequestHandler => validate({ query: schema });
export const validateParams = (schema: ZodType): RequestHandler => validate({ params: schema });
