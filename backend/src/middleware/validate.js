const { z } = require('zod');

/**
 * Validates request body/query/params against a Zod schema.
 * @param {z.ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(422).json({ error: 'Validation failed', errors });
    }
    req[source] = result.data; // replace with parsed/coerced data
    next();
  };
};

module.exports = { validate };
