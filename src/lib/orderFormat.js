export function makeNextOrderNo(orders = [], date = new Date()) {
  const dayKey = getLocalDayKey(date);
  const countToday = orders.filter((order) => getLocalDayKey(order.createdAt) === dayKey).length;
  return `#${String(countToday + 1).padStart(4, "0")}`;
}

export function getOrderDisplayNo(order) {
  if (!order) return "";
  if (order.orderNo) return order.orderNo;
  const digits = String(order.id || "").replace(/\D/g, "");
  if (digits) return `#${digits.slice(-4).padStart(4, "0")}`;
  return String(order.id || "");
}

function getLocalDayKey(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
