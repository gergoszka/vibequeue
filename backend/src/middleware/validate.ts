import type { Request, Response, NextFunction } from 'express';

type SimpleRule = 'required' | 'string' | 'int' | 'alphanumeric5' | 'youtubeVideoId' | 'url';
type ParamRule = ['min', number] | ['max', number] | ['minLen', number] | ['maxLen', number] | ['oneOf', ...number[]];
type FunctionRule = (val: unknown) => boolean;
type Rule = SimpleRule | ParamRule | FunctionRule;

interface FieldSchema {
  rules?: Rule[];
  sanitize?: boolean;
  coerce?: 'int';
  message?: string;
}

type ValidateSchema = Record<string, FieldSchema>;

// Strip HTML/script tags from a string
export function sanitizeString(str: string): string {
  return typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : str;
}

// Validators
const validators: Record<string, ((...args: number[]) => (val: unknown) => boolean) | ((val: unknown) => boolean)> = {
  required: (val: unknown) => val !== undefined && val !== null && val !== '',
  string: (val: unknown) => typeof val === 'string',
  int: (val: unknown) => Number.isInteger(Number(val)) && !isNaN(Number(val)),
  min: (min: number) => (val: unknown) => Number(val) >= min,
  max: (max: number) => (val: unknown) => Number(val) <= max,
  minLen: (min: number) => (val: unknown) => typeof val === 'string' && val.trim().length >= min,
  maxLen: (max: number) => (val: unknown) => typeof val === 'string' && val.length <= max,
  oneOf: (...values: number[]) => (val: unknown) => values.includes(Number(val) as never || val as never),
  alphanumeric5: (val: unknown) => /^[A-Za-z0-9]{5}$/.test(String(val)),
  youtubeVideoId: (val: unknown) => /^[A-Za-z0-9_-]{11}$/.test(String(val)),
  url: (val: unknown) => {
    try {
      new URL(String(val));
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * validate(schema) — middleware factory
 */
export function validate(schema: ValidateSchema): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, string> = {};
    if (!req.body) req.body = {};
    const source = req.body as Record<string, unknown>;

    for (const [field, config] of Object.entries(schema)) {
      let val = source[field];

      // If the field is absent and 'required' is not in the rules, skip it entirely
      const hasRequired = (config.rules || []).some(
        (rule) => rule === 'required' || (Array.isArray(rule) && (rule as string[])[0] === 'required')
      );
      if (val === undefined && !hasRequired) {
        continue;
      }

      // Sanitize strings if requested
      if (config.sanitize && typeof val === 'string') {
        val = sanitizeString(val);
        source[field] = val;
      }

      // Coerce to int if requested
      if (config.coerce === 'int' && val !== undefined) {
        const coerced = parseInt(String(val), 10);
        if (!isNaN(coerced)) {
          val = coerced;
          source[field] = coerced;
        }
      }

      // Check rules
      for (const rule of config.rules || []) {
        let passes: boolean;
        if (typeof rule === 'function') {
          passes = rule(val);
        } else if (typeof rule === 'string') {
          const validatorFn = validators[rule];
          if (typeof validatorFn === 'function') {
            passes = (validatorFn as (val: unknown) => boolean)(val);
          } else {
            continue;
          }
        } else if (Array.isArray(rule)) {
          // Parameterized rule like ['min', 1] or ['minLen', 2]
          const [name, ...args] = rule as [string, ...number[]];
          const validatorFn = validators[name];
          if (typeof validatorFn === 'function') {
            const parameterized = (validatorFn as (...a: number[]) => (v: unknown) => boolean)(...args);
            passes = parameterized(val);
          } else {
            continue;
          }
        } else {
          continue;
        }

        if (!passes) {
          errors[field] = config.message || `${field} is invalid`;
          break;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }
    next();
  };
}
