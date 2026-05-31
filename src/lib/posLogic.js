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
  activeRecipes
    .filter((recipe) => recipe.productId === productId)
    .forEach((recipe) => addRequired(required, recipe.ingredientId, recipe.quantity));

  activeModifierRecipes
    .filter((recipe) => modifierIds.includes(recipe.modifierId))
    .forEach((recipe) => addRequired(required, recipe.ingredientId, recipe.quantity));

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

export function applyStockMovement(ingredients, requirements, direction) {
  const delta = direction === "out" ? -1 : 1;
  return ingredients.map((ingredient) => {
    const required = requirements.find((line) => line.ingredientId === ingredient.id);
    if (!required) return ingredient;
    return { ...ingredient, stock: Math.max(0, Number(ingredient.stock) + required.quantity * delta) };
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
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      modifierIds: item.modifierIds,
      modifiers: item.modifiers.map((modifier) => modifier.label),
      note: item.note || "",
    })),
  };
}

function addRequired(map, ingredientId, quantity) {
  map.set(ingredientId, Number(map.get(ingredientId) || 0) + Number(quantity || 0));
}
