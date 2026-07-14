import { modifierRecipes, recipes } from "../data/seedData.js";

export function money(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export function getIngredientMap(ingredients) {
  return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
}

export function getProductRequirements(productId, modifierIds = [], catalog = {}) {
  const activeRecipes = catalog.recipes || recipes;
  const activeModifierRecipes = catalog.modifierRecipes || modifierRecipes;
  const required = new Map();
  const modifierCounts = countIds(modifierIds);
  activeRecipes
    .filter((recipe) => recipe.productId === productId)
    .forEach((recipe) => addRequired(required, recipe.ingredientId, recipe.quantity));

  activeModifierRecipes
    .forEach((recipe) => {
      const modifierCount = Number(modifierCounts.get(recipe.modifierId) || 0);
      if (modifierCount) addRequired(required, recipe.ingredientId, recipe.quantity * modifierCount);
    });

  return Array.from(required.entries())
    .map(([ingredientId, quantity]) => ({ ingredientId, quantity: Math.max(0, quantity) }))
    .filter((item) => item.quantity > 0);
}

export function getCartRequirements(cart, catalog = {}) {
  const required = new Map();
  cart.forEach((item) => {
    getProductRequirements(item.product.id, item.modifierIds, catalog).forEach((line) => {
      addRequired(required, line.ingredientId, line.quantity * item.quantity);
    });
  });
  return Array.from(required.entries()).map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
}

export function getOrderRequirements(order, catalog = {}) {
  const required = new Map();
  (order.items || []).forEach((item) => {
    getProductRequirements(item.productId, item.modifierIds || [], catalog).forEach((line) => {
      addRequired(required, line.ingredientId, line.quantity * Number(item.quantity || 0));
    });
  });
  return Array.from(required.entries())
    .map(([ingredientId, quantity]) => ({ ingredientId, quantity }))
    .filter((item) => item.quantity > 0);
}

export function getMissingIngredients(requirements, ingredients) {
  const ingredientMap = getIngredientMap(ingredients);
  return requirements
    .map((line) => {
      const ingredient = ingredientMap.get(line.ingredientId);
      const stock = Number(ingredient?.stock || 0);
      return {
        ...line,
        name: ingredient?.name || line.ingredientId,
        unit: ingredient?.unit || "",
        stock,
        missing: Math.max(0, line.quantity - stock),
      };
    })
    .filter((line) => line.missing > 0);
}

export function canSellProduct(productId, ingredients, modifierIds = [], catalog = {}) {
  return getMissingIngredients(getProductRequirements(productId, modifierIds, catalog), ingredients).length === 0;
}

export function applyStockMovement(ingredients, requirements, direction, { allowNegative = false } = {}) {
  const delta = direction === "out" ? -1 : 1;
  return ingredients.map((ingredient) => {
    const required = requirements.find((line) => line.ingredientId === ingredient.id);
    if (!required) return ingredient;
    const nextStock = Number(ingredient.stock) + required.quantity * delta;
    return { ...ingredient, stock: allowNegative ? nextStock : Math.max(0, nextStock) };
  });
}

export function calculateCartTotal(cart) {
  return cart.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

export function makeOrderPayload({ cart, orderNo, paymentMethod, cashReceived, total }) {
  return {
    id: `ORD-${Date.now()}`,
    orderNo,
    createdAt: new Date().toISOString(),
    paymentStatus: "COMPLETED",
    paymentMethod,
    totalAmount: total,
    cashReceived: paymentMethod === "CASH" ? Number(cashReceived || 0) : null,
    changeDue: paymentMethod === "CASH" ? Math.max(0, Number(cashReceived || 0) - total) : 0,
    items: cart.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      category: item.product.category || "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      modifierIds: item.modifierIds,
      modifiers: summarizeModifiers(item.modifiers),
      note: item.note || "",
    })),
  };
}

function countIds(ids = []) {
  return ids.reduce((counts, id) => {
    counts.set(id, Number(counts.get(id) || 0) + 1);
    return counts;
  }, new Map());
}

function summarizeModifiers(modifiers = []) {
  const summary = new Map();
  modifiers.forEach((modifier) => {
    const key = modifier.id || modifier.label;
    const current = summary.get(key) || { label: modifier.label || key, count: 0 };
    summary.set(key, { ...current, count: current.count + 1 });
  });
  return Array.from(summary.values()).map((item) => (item.count > 1 ? `${item.label} x${item.count}` : item.label));
}

function addRequired(map, ingredientId, quantity) {
  map.set(ingredientId, Number(map.get(ingredientId) || 0) + Number(quantity || 0));
}
