export const categories = ["เบอร์เกอร์", "เครื่องดื่ม", "ของทานเล่น"];

export const seedIngredients = [
  { id: "pork_patty", name: "แผ่นหมูบด", stock: 28, unit: "ชิ้น", minimumStock: 12 },
  { id: "bun", name: "ขนมปังเบอร์เกอร์", stock: 34, unit: "คู่", minimumStock: 12 },
  { id: "cheese", name: "ชีส", stock: 18, unit: "แผ่น", minimumStock: 10 },
  { id: "lettuce", name: "ผักสด", stock: 620, unit: "กรัม", minimumStock: 300 },
  { id: "fries", name: "เฟรนช์ฟรายส์", stock: 4200, unit: "กรัม", minimumStock: 1500 },
  { id: "cola", name: "น้ำโคล่า", stock: 22, unit: "แก้ว", minimumStock: 10 },
  { id: "sauce", name: "ซอสเบอร์เกอร์", stock: 1800, unit: "กรัม", minimumStock: 500 },
];

export const purchaseUnits = [
  { id: "pork_pack_10", ingredientId: "pork_patty", label: "แพ็ค", ratio: 10, baseUnit: "ชิ้น" },
  { id: "bun_bag_12", ingredientId: "bun", label: "ถุง", ratio: 12, baseUnit: "คู่" },
  { id: "cheese_pack_20", ingredientId: "cheese", label: "แพ็ค", ratio: 20, baseUnit: "แผ่น" },
  { id: "lettuce_kg", ingredientId: "lettuce", label: "กิโล", ratio: 1000, baseUnit: "กรัม" },
  { id: "fries_bag_1000", ingredientId: "fries", label: "ถุง", ratio: 1000, baseUnit: "กรัม" },
];

export const products = [
  { id: "pork_burger", name: "เบอร์เกอร์หมู", price: 69, category: "เบอร์เกอร์", color: "bg-emerald-50" },
  { id: "cheese_burger", name: "ชีสเบอร์เกอร์", price: 89, category: "เบอร์เกอร์", color: "bg-amber-50" },
  { id: "fries", name: "เฟรนช์ฟรายส์", price: 45, category: "ของทานเล่น", color: "bg-orange-50" },
  { id: "cola", name: "โคล่า", price: 25, category: "เครื่องดื่ม", color: "bg-sky-50" },
];

export const recipes = [
  { productId: "pork_burger", ingredientId: "pork_patty", quantity: 1 },
  { productId: "pork_burger", ingredientId: "bun", quantity: 1 },
  { productId: "pork_burger", ingredientId: "lettuce", quantity: 30 },
  { productId: "pork_burger", ingredientId: "sauce", quantity: 20 },
  { productId: "cheese_burger", ingredientId: "pork_patty", quantity: 1 },
  { productId: "cheese_burger", ingredientId: "bun", quantity: 1 },
  { productId: "cheese_burger", ingredientId: "cheese", quantity: 1 },
  { productId: "cheese_burger", ingredientId: "lettuce", quantity: 30 },
  { productId: "cheese_burger", ingredientId: "sauce", quantity: 20 },
  { productId: "fries", ingredientId: "fries", quantity: 180 },
  { productId: "cola", ingredientId: "cola", quantity: 1 },
];

export const modifiers = [
  { id: "extra_patty", label: "เพิ่มหมู", price: 25, productIds: ["pork_burger", "cheese_burger"] },
  { id: "extra_cheese", label: "เพิ่มชีส", price: 15, productIds: ["pork_burger", "cheese_burger"] },
  { id: "no_veg", label: "ไม่ใส่ผัก", price: 0, productIds: ["pork_burger", "cheese_burger"] },
];

export const modifierRecipes = [
  { modifierId: "extra_patty", ingredientId: "pork_patty", quantity: 1 },
  { modifierId: "extra_cheese", ingredientId: "cheese", quantity: 1 },
  { modifierId: "no_veg", ingredientId: "lettuce", quantity: -30 },
];
