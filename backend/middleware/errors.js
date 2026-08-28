export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, _req, res, _next) {
  if (err.code === '23505') return res.status(409).json({ error: 'That record already exists' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
}
