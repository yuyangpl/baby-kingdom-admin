export function success(res, data = null, statusCode = 200) {
  const body = { success: true };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
}

export function paginated(res, data, pagination) {
  return res.status(200).json({
    success: true,
    data,
    pagination,
  });
}

export function created(res, data) {
  return success(res, data, 201);
}
