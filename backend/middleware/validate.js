/** Validate req.body against a zod schema; replaces body with parsed data. */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Check the highlighted fields', issues: result.error.flatten().fieldErrors });
  }
  req.body = result.data;
  next();
};
