import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CreditCard,
  Database,
  Edit3,
  FileImage,
  Menu,
  Minus,
  MoreVertical,
  Package,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Trash2,
  UploadCloud,
  Utensils,
  WalletCards,
  Wifi,
  X,
} from "lucide-react";
import { createLayout } from "animejs";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  categories,
  modifierRecipes as seedModifierRecipes,
  modifiers as seedModifiers,
  products as seedProducts,
  purchaseUnits as seedPurchaseUnits,
  recipes as seedRecipes,
  seedIngredients,
} from "./data/seedData.js";
import { addLocalJob, listLocalJobs, updateLocalJob } from "./lib/localQueues.js";
import { getOrderDisplayNo, makeNextOrderNo } from "./lib/orderFormat.js";
import {
  applyStockMovement,
  calculateCartTotal,
  canSellProduct,
  getCartRequirements,
  getMissingIngredients,
  makeOrderPayload,
  money,
} from "./lib/posLogic.js";
import { makePrinterTestJob, sendPrintJob } from "./lib/printBridge.js";
import { usePersistentState } from "./lib/storage.js";

const navItems = [
  { id: "pos", label: "ขาย", icon: Store, children: [{ id: "sales-history", label: "ประวัติขาย", tab: "pos", view: "history" }] },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "menu", label: "รายการสินค้า", icon: Utensils, children: [{ id: "categories", label: "หมวดหมู่", tab: "categories" }, { id: "modifiers", label: "จัดการตัวเลือกเสริม", tab: "modifiers" }] },
  { id: "inventory", label: "วัตถุดิบ", icon: Package },
  { id: "expense", label: "รายจ่าย", icon: ReceiptText, children: [{ id: "expense-history", label: "ประวัติรายจ่าย", tab: "expense", view: "history" }] },
  { id: "settings", label: "ตั้งค่า", icon: Settings },
];

const salesChannels = [
  { id: "store", label: "หน้าร้าน" },
  { id: "grab", label: "Grab" },
  { id: "lineman", label: "Lineman" },
  { id: "shopee", label: "Shopee Food" },
];

const defaultSettings = {
  printerModel: "POS-8390",
  printerConnection: "WIFI_LAN",
  bridgeUrl: "http://127.0.0.1:8080/print",
  printerIp: "192.168.1.150",
  printerPort: "9100",
  paperSize: "80mm",
  bridgeMethod: "POST",
  buzzerEnabled: true,
  defaultPrintOptions: { kitchen: true, receipt: false },
  sheetId: "1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI",
  kitchenTemplate: "[ORDER_NO]\nรายการอาหาร: ตัวหนา\n  - ตัวเลือกเสริม: ตัวบางและเยื้อง\nหมายเหตุ\nเวลาสั่ง",
  receiptLogoDataUrl: "",
  receiptLogoName: "",
  receiptTemplate: "ใบเสร็จรับเงิน\n[LOGO]\n--------------------------------------\nหมายเลขคำสั่งซื้อ : [ORDER_NO]\nวันและเวลา : [ORDER_DATE]\n--------------------------------------\nสินค้า                  ราคา     จำนวน            รวม\n[ITEMS]            [PRICE]  [QUANTITY]   [TOTAL (price*quantity)]\nรวม                                                  [TOTAL]",
};

function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return prefersReduced;
}

function useAnimatedNumber(value, { duration = 700, prefersReducedMotion = false } = {}) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (prefersReducedMotion || typeof window === "undefined") {
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const from = displayRef.current;
    if (from === target) return undefined;

    let frameId = 0;
    const startedAt = performance.now();
    const easeOutCubic = (point) => 1 - Math.pow(1 - point, 3);

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const next = Math.round(from + (target - from) * easeOutCubic(progress));
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, prefersReducedMotion, target]);

  return display;
}

function useAnimeLayout(rootRef, signature, params) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const layoutRef = useRef(null);
  const readyRef = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion) return undefined;
    layoutRef.current = createLayout(root, params);
    layoutRef.current.record();
    readyRef.current = false;
    return () => {
      layoutRef.current?.revert?.();
      layoutRef.current = null;
      readyRef.current = false;
    };
  }, [params, prefersReducedMotion, rootRef]);

  useLayoutEffect(() => {
    if (!layoutRef.current || prefersReducedMotion) return;
    if (!readyRef.current) {
      readyRef.current = true;
      layoutRef.current.record();
      return;
    }
    layoutRef.current.animate();
  }, [prefersReducedMotion, signature]);
}

function useAnimeModal(onClose, children) {
  const backdropRef = useRef(null);
  const layoutRef = useRef(null);
  const closeTimerRef = useRef(null);
  const didCloseRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const root = backdropRef.current;
    if (!root) return undefined;
    if (prefersReducedMotion) {
      root.classList.add("is-open");
      return undefined;
    }

    const layout = createLayout(root, {
      children,
      properties: ["--overlay-alpha"],
      duration: 240,
      ease: "outQuad",
      enterFrom: {
        transform: "translateY(100px) scale(.25)",
        opacity: 0,
        duration: 350,
        ease: "out(3)",
      },
      leaveTo: {
        transform: "translateY(-100px) scale(.25)",
        opacity: 0,
        duration: 280,
        ease: "out(3)",
      },
    });
    layoutRef.current = layout;
    layout.update(({ root: layoutRoot }) => {
      layoutRoot.classList.add("is-open");
    });

    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      layoutRef.current?.revert?.();
      layoutRef.current = null;
    };
  }, [children, prefersReducedMotion]);

  function closeWithAnimation() {
    if (didCloseRef.current) return;
    const root = backdropRef.current;
    const layout = layoutRef.current;
    const finish = () => {
      if (didCloseRef.current) return;
      didCloseRef.current = true;
      onClose();
    };

    if (prefersReducedMotion || !root || !layout) {
      finish();
      return;
    }

    layout.update(({ root: layoutRoot }) => {
      layoutRoot.classList.add("is-closing");
    }, {
      duration: 260,
      leaveTo: {
        transform: "translateY(-100px) scale(.25)",
        opacity: 0,
        duration: 280,
        ease: "out(3)",
      },
    });
    closeTimerRef.current = window.setTimeout(finish, 360);
  }

  return { backdropRef, closeWithAnimation };
}

const cartLayoutParams = {
  children: [".cart-row"],
  duration: 250,
  ease: "outQuad",
  enterFrom: {
    transform: "translateY(100px) scale(.25)",
    opacity: 0,
    duration: 350,
    ease: "out(3)",
  },
  leaveTo: {
    transform: "translateY(-100px) scale(.25)",
    opacity: 0,
    duration: 300,
    ease: "out(3)",
  },
};

const expenseLayoutParams = {
  children: [".expense-entry-row"],
  duration: 250,
  ease: "outQuad",
  enterFrom: {
    transform: "translateY(100px) scale(.25)",
    opacity: 0,
    duration: 350,
    ease: "out(3)",
  },
  leaveTo: {
    transform: "translateY(-100px) scale(.25)",
    opacity: 0,
    duration: 300,
    ease: "out(3)",
  },
};

const modifierModalChildren = [".modal-card", "h3", "p", ".modifier-row", ".modal-actions button"];
const paymentModalChildren = [".modal-card", "h3", ".payment-tabs button", ".receipt-preview", ".pay-total", ".modal-actions button"];

export default function App() {
  const [activeTab, setActiveTab] = useState("pos");
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [menuCategories, setMenuCategories] = usePersistentState("burger-pos.menuCategories", categories);
  const [ingredients, setIngredients] = usePersistentState("burger-pos.ingredients", seedIngredients);
  const [purchaseUnits, setPurchaseUnits] = usePersistentState("burger-pos.purchaseUnits", seedPurchaseUnits);
  const [products, setProducts] = usePersistentState("burger-pos.products", seedProducts);
  const [recipes, setRecipes] = usePersistentState("burger-pos.recipes", seedRecipes);
  const [modifiers, setModifiers] = usePersistentState("burger-pos.modifiers", seedModifiers);
  const [modifierRecipes, setModifierRecipes] = usePersistentState("burger-pos.modifierRecipes", seedModifierRecipes);
  const [orders, setOrders] = usePersistentState("burger-pos.orders", []);
  const [expenses, setExpenses] = usePersistentState("burger-pos.expenses", []);
  const [shifts, setShifts] = usePersistentState("burger-pos.shifts", []);
  const [stockMovements, setStockMovements] = usePersistentState("burger-pos.stockMovements", []);
  const [settings, setSettings] = usePersistentState("burger-pos.settings", defaultSettings);
  const resolvedSettings = useMemo(() => ({ ...defaultSettings, ...settings }), [settings]);
  const [cart, setCart] = useState([]);
  const [posView, setPosView] = useState("sale");
  const [salesChannel, setSalesChannel] = useState("store");
  const [expenseView, setExpenseView] = useState("entry");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [modifierIds, setModifierIds] = useState([]);
  const [modifierNote, setModifierNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [closeShiftToken, setCloseShiftToken] = useState(0);
  const [queueLists, setQueueLists] = useState({ print: [], sheet: [] });
  const [cartLeavingKeys, setCartLeavingKeys] = useState([]);

  const catalog = useMemo(() => ({ recipes, modifierRecipes }), [recipes, modifierRecipes]);
  const printOptions = resolvedSettings.defaultPrintOptions || defaultSettings.defaultPrintOptions;
  const activeProducts = useMemo(() => products.filter((product) => isProductActiveForChannel(product, salesChannel)), [products, salesChannel]);
  const lowStock = useMemo(
    () => ingredients.filter((item) => Number(item.stock) <= Number(item.minimumStock)),
    [ingredients],
  );
  const openShift = useMemo(() => shifts.find((shift) => !shift.closedAt) || null, [shifts]);
  const total = calculateCartTotal(cart);

  useEffect(() => {
    refreshQueues();
  }, []);

  useEffect(() => {
    if (!activeProducts.some((product) => product.category === activeCategory)) {
      setActiveCategory(activeProducts[0]?.category || menuCategories[0] || categories[0]);
    }
  }, [activeCategory, activeProducts, menuCategories]);

  async function refreshQueues() {
    const [print, sheet] = await Promise.all([
      listLocalJobs("printJobs").catch(() => []),
      listLocalJobs("sheetSyncJobs").catch(() => []),
    ]);
    setQueueLists({ print, sheet });
  }

  async function flushPrintQueue() {
    const jobs = await listLocalJobs("printJobs").catch(() => []);
    const pendingJobs = jobs.filter((job) => job.status !== "PRINTED").slice(0, 10);
    for (const job of pendingJobs) {
      try {
        await sendPrintJob(job, resolvedSettings);
        await updateLocalJob("printJobs", { ...job, status: "PRINTED", lastError: "" });
      } catch (error) {
        await updateLocalJob("printJobs", {
          ...job,
          status: "FAILED",
          retryCount: Number(job.retryCount || 0) + 1,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await refreshQueues();
  }

  function preserveScrollPosition() {
    if (typeof window === "undefined") return;
    const scrollY = window.scrollY;
    const restore = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(scrollY, maxScroll));
    };
    window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 80);
    });
  }

  function openProduct(product) {
    if (!canSellProduct(product.id, ingredients, [], catalog)) return;
    const productModifiers = modifiers.filter((modifier) => modifier.productIds.includes(product.id));
    if (!productModifiers.length) {
      addToCart(product, []);
      return;
    }
    setSelectedProduct(product);
    setModifierIds([]);
    setModifierNote("");
  }

  function addToCart(product, selectedModifierIds, note = "") {
    preserveScrollPosition();
    const selectedModifiers = modifiers.filter((modifier) => selectedModifierIds.includes(modifier.id));
    const unitPrice = getChannelPrice(product, salesChannel) + selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
    const normalizedModifierIds = [...selectedModifierIds].sort();
    const normalizedNote = note.trim();
    setCart((current) => {
      const existing = current.find((item) =>
        item.product.id === product.id &&
        normalizeModifierKey(item.modifierIds) === normalizeModifierKey(normalizedModifierIds) &&
        (item.note || "") === normalizedNote
      );
      if (existing) {
        return current.map((item) => (item.key === existing.key ? { ...item, quantity: item.quantity + 1 } : item));
      }
      const key = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return [
        ...current,
        {
          key,
          product,
          quantity: 1,
          unitPrice,
          modifierIds: normalizedModifierIds,
          modifiers: selectedModifiers,
          note: normalizedNote,
        },
      ];
    });
    setSelectedProduct(null);
    setModifierNote("");
  }

  function changeQuantity(key, delta) {
    preserveScrollPosition();
    setCart((current) => {
      const target = current.find((item) => item.key === key);
      if (!target) return current;

      const nextQuantity = target.quantity + delta;
      if (nextQuantity <= 0) {
        setCartLeavingKeys((keys) => keys.filter((item) => item !== key));
        return current.filter((item) => item.key !== key);
      }

      return current.map((item) => (item.key === key ? { ...item, quantity: nextQuantity } : item));
    });
  }

  async function completeOrder(payment) {
    if (!openShift) {
      alert("กรุณาเปิดกะก่อนเริ่มขาย");
      return;
    }
    const requirements = getCartRequirements(cart, catalog);
    const missing = getMissingIngredients(requirements, ingredients);
    if (missing.length) {
      alert(`วัตถุดิบไม่พอ: ${missing.map((item) => item.name).join(", ")}`);
      return;
    }
    const order = {
      ...makeOrderPayload({ cart, orderNo: makeNextOrderNo(orders), total, ...payment }),
      salesChannel,
      shiftId: openShift.id,
      note: "",
      printOptions,
    };
    const movements = makeSaleMovements(requirements, ingredients, order.id);

    setIngredients((current) => applyStockMovement(current, requirements, "out"));
    setOrders((current) => [order, ...current].slice(0, 200));
    setStockMovements((current) => [...movements, ...current].slice(0, 500));
    setLastOrder(order);
    setCart([]);
    setPaymentOpen(false);

    if (printOptions.kitchen) await addLocalJob("printJobs", { type: "KITCHEN", order });
    if (printOptions.receipt) await addLocalJob("printJobs", { type: "RECEIPT", order });
    await addLocalJob("sheetSyncJobs", { type: "ORDER", payload: order });
    await refreshQueues();
    void flushPrintQueue();
  }

  async function queueHistoricalPrint(order, type) {
    await addLocalJob("printJobs", { type, order, source: "HISTORY_REPRINT" });
    await refreshQueues();
    void flushPrintQueue();
    return true;
  }

  function openNewShift(openingCash) {
    const shift = {
      id: `SHIFT-${Date.now()}`,
      openedAt: new Date().toISOString(),
      openingCash: Number(openingCash || 0),
      closedAt: null,
      closingCash: null,
      summary: null,
    };
    setShifts((current) => [shift, ...current]);
    return true;
  }

  function closeCurrentShift(closingCash) {
    if (!openShift) return false;
    if (closingCash === "" || closingCash === null || closingCash === undefined) {
      alert("กรุณาใส่เงินสดตอนปิดกะ");
      return false;
    }
    const closedAt = new Date().toISOString();
    const summary = {
      ...calculateShiftSummary(openShift, orders, Number(closingCash || 0)),
      openedAt: openShift.openedAt,
      closedAt,
    };
    setShifts((current) =>
      current.map((shift) =>
        shift.id === openShift.id
          ? { ...shift, closedAt, closingCash: Number(closingCash || 0), summary }
          : shift,
      ),
    );
    setCart([]);
    setPaymentOpen(false);
    return { summary };
  }

  async function recordExpense(expense) {
    const movements = [];
    setIngredients((current) =>
      current.map((ingredient) => {
        const additions = expense.items
          .filter((item) => item.ingredientId === ingredient.id)
          .reduce((sum, item) => sum + Number(item.stockQuantity || 0), 0);
        if (!additions) return ingredient;
        const nextStock = Number(ingredient.stock) + additions;
        movements.push({
          id: `MOV-${Date.now()}-${ingredient.id}`,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          type: "PURCHASE",
          quantityDelta: additions,
          quantityAfter: nextStock,
          sourceId: expense.id,
          createdAt: expense.createdAt,
        });
        return { ...ingredient, stock: nextStock };
      }),
    );
    setExpenses((current) => [expense, ...current].slice(0, 200));
    setStockMovements((current) => [...movements, ...current].slice(0, 500));
    await addLocalJob("sheetSyncJobs", { type: "EXPENSE", payload: expense });
    await refreshQueues();
  }

  function saveIngredient(nextIngredient) {
    setIngredients((current) => {
      const exists = current.some((ingredient) => ingredient.id === nextIngredient.id);
      return exists
        ? current.map((ingredient) => (ingredient.id === nextIngredient.id ? nextIngredient : ingredient))
        : [...current, nextIngredient];
    });
  }

  function deleteIngredient(ingredientId) {
    setIngredients((current) => current.filter((ingredient) => ingredient.id !== ingredientId));
    setPurchaseUnits((current) => current.filter((unit) => unit.ingredientId !== ingredientId));
    setRecipes((current) => current.filter((recipe) => recipe.ingredientId !== ingredientId));
  }

  function deleteProduct(productId) {
    setProducts((current) => current.filter((product) => product.id !== productId));
    setRecipes((current) => current.filter((recipe) => recipe.productId !== productId));
  }

  function adjustStock({ ingredientId, quantityDelta, reason }) {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient || !quantityDelta) return;
    const nextStock = Math.max(0, Number(ingredient.stock) + Number(quantityDelta));
    const movement = {
      id: `MOV-${Date.now()}`,
      ingredientId,
      ingredientName: ingredient.name,
      type: "ADJUSTMENT",
      quantityDelta: Number(quantityDelta),
      quantityAfter: nextStock,
      reason,
      sourceId: "manual",
      createdAt: new Date().toISOString(),
    };
    setIngredients((current) =>
      current.map((item) => (item.id === ingredientId ? { ...item, stock: nextStock } : item)),
    );
    setStockMovements((current) => [movement, ...current].slice(0, 500));
  }

  function navigateMain(tabId) {
    setActiveTab(tabId);
    if (tabId === "pos") setPosView("sale");
    if (tabId === "expense") setExpenseView("entry");
    setIsNavOpen(false);
  }

  function navigateSub(item) {
    setActiveTab(item.tab);
    if (item.tab === "pos") setPosView(item.view || "sale");
    if (item.tab === "expense") setExpenseView(item.view || "entry");
    setIsNavOpen(false);
  }

  function isNavActive(item) {
    return activeTab === item.id || item.children?.some((child) => child.tab === activeTab);
  }

  function isSubNavActive(item) {
    if (item.tab !== activeTab) return false;
    if (item.tab === "pos") return posView === item.view;
    if (item.tab === "expense") return expenseView === item.view;
    return true;
  }

  const queueStats = {
    print: queueLists.print.filter((job) => job.status !== "PRINTED").length,
    sheet: queueLists.sheet.filter((job) => job.status !== "SYNCED").length,
  };

  return (
    <div className="min-h-screen bg-soft text-ink">
      <div className={`app-grid ${isNavOpen ? "is-nav-open" : ""}`}>
        {isNavOpen ? <button className="nav-scrim" onClick={() => setIsNavOpen(false)} type="button" aria-label="ปิดเมนูหลัก" /> : null}
        <aside className="nav-rail" aria-hidden={!isNavOpen}>
          <div className="brand-block">
            <img className="brand-mark" src={`${import.meta.env.BASE_URL}boy-burger-logo.png`} alt="BOY Burger & BBQ" />
            <div>
              <h1>BOY Burger POS</h1>
              <p>Burger & BBQ counter</p>
            </div>
            <button className="nav-close-button" onClick={() => setIsNavOpen(false)} type="button" aria-label="ปิดเมนู">
              <X size={20} />
            </button>
          </div>
          <nav className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <div className={`nav-group ${isNavActive(item) ? "is-open" : ""}`} key={item.id}>
                  <button
                    className={`nav-button ${activeTab === item.id ? "is-active" : ""}`}
                    onClick={() => navigateMain(item.id)}
                    type="button"
                  >
                    <Icon size={22} />
                    <span>{item.label}</span>
                  </button>
                  {item.children?.length ? (
                    <div className="nav-sub-list">
                      {item.children.map((child) => (
                        <button
                          className={`nav-sub-button ${isSubNavActive(child) ? "is-active" : ""}`}
                          key={child.id}
                          onClick={() => navigateSub(child)}
                          type="button"
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <StatusPanel lowStock={lowStock.length} queueStats={queueStats} />
        </aside>

        <main className="main-pane">
          <Header
            activeTab={activeTab}
            expenseView={expenseView}
            lowStock={lowStock.length}
            onOpenNav={() => setIsNavOpen(true)}
            onRequestCloseShift={() => setCloseShiftToken((token) => token + 1)}
            openShift={openShift}
            posView={posView}
            salesChannel={salesChannel}
            setSalesChannel={setSalesChannel}
          />
          <MobileSubnav activeTab={activeTab} expenseView={expenseView} navigateMain={navigateMain} navigateSub={navigateSub} />
          {activeTab === "pos" ? (
            <PosScreen
              activeCategory={activeCategory}
              cart={cart}
              cartLeavingKeys={cartLeavingKeys}
              closeShiftToken={closeShiftToken}
              catalog={catalog}
              changeQuantity={changeQuantity}
              ingredients={ingredients}
              menuCategories={menuCategories}
              onCategory={setActiveCategory}
              onCheckout={() => setPaymentOpen(true)}
              onCloseShift={closeCurrentShift}
              onOpenShift={openNewShift}
              onProduct={openProduct}
              onReprintOrder={queueHistoricalPrint}
              orders={orders}
              openShift={openShift}
              printOptions={printOptions}
              products={activeProducts}
              posView={posView}
              salesChannel={salesChannel}
              setPosView={setPosView}
              shifts={shifts}
              total={total}
            />
          ) : null}
          {activeTab === "dashboard" ? (
            <DashboardScreen
              expenses={expenses}
              ingredients={ingredients}
              orders={orders}
              products={products}
              shifts={shifts}
            />
          ) : null}
          {activeTab === "inventory" ? (
            <InventoryScreen
              adjustStock={adjustStock}
              deleteIngredient={deleteIngredient}
              ingredients={ingredients}
              onAddPurchaseUnit={setPurchaseUnits}
              purchaseUnits={purchaseUnits}
              saveIngredient={saveIngredient}
            />
          ) : null}
          {activeTab === "menu" ? (
            <MenuRecipeScreen
              ingredients={ingredients}
              menuCategories={menuCategories}
              products={products}
              recipes={recipes}
              deleteProduct={deleteProduct}
              setProducts={setProducts}
              setRecipes={setRecipes}
            />
          ) : null}
          {activeTab === "categories" ? (
            <CategoryManagementScreen
              menuCategories={menuCategories}
              products={products}
              setMenuCategories={setMenuCategories}
              setProducts={setProducts}
            />
          ) : null}
          {activeTab === "modifiers" ? (
            <ModifierManagementScreen
              ingredients={ingredients}
              modifierRecipes={modifierRecipes}
              modifiers={modifiers}
              products={products}
              setModifierRecipes={setModifierRecipes}
              setModifiers={setModifiers}
            />
          ) : null}
          {activeTab === "expense" ? (
            <ExpenseScreen
              ingredients={ingredients}
              onAddIngredient={setIngredients}
              onAddPurchaseUnit={setPurchaseUnits}
              onRecord={recordExpense}
              purchaseUnits={purchaseUnits}
              recentExpenses={expenses}
              setView={setExpenseView}
              view={expenseView}
            />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsScreen
              flushPrintQueue={flushPrintQueue}
              orders={orders}
              queueLists={queueLists}
              refreshQueues={refreshQueues}
              setSettings={setSettings}
              settings={resolvedSettings}
            />
          ) : null}
        </main>
      </div>

      {selectedProduct ? (
        <ModifierModal
          ingredients={ingredients}
          modifierIds={modifierIds}
          modifierRecipes={modifierRecipes}
          modifiers={modifiers}
          onClose={() => {
            setSelectedProduct(null);
            setModifierNote("");
          }}
          note={modifierNote}
          onConfirm={() => addToCart(selectedProduct, modifierIds, modifierNote)}
          onNoteChange={setModifierNote}
          onToggle={(id) =>
            setModifierIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
          }
          product={selectedProduct}
        />
      ) : null}

      {paymentOpen ? (
        <PaymentModal cart={cart} onClose={() => setPaymentOpen(false)} onSubmit={completeOrder} total={total} />
      ) : null}

      {lastOrder ? <OrderSuccessDialog order={lastOrder} onClose={() => setLastOrder(null)} /> : null}
    </div>
  );
}

function Header({ activeTab, expenseView, lowStock, onOpenNav, onRequestCloseShift, openShift, posView, salesChannel, setSalesChannel }) {
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const title = {
    pos: posView === "history" ? "ประวัติการขาย" : "ขายหน้าร้าน",
    dashboard: "Dashboard สรุปยอดขาย",
    inventory: "เช็ควัตถุดิบ",
    menu: "รายการสินค้า",
    categories: "หมวดหมู่สินค้า",
    modifiers: "จัดการตัวเลือกเสริม",
    expense: expenseView === "history" ? "ประวัติรายจ่าย" : "บันทึกรายจ่าย",
    settings: "ตั้งค่าระบบ",
  }[activeTab];
  const channelLabel = getSalesChannelLabel(salesChannel);
  const showPosControls = activeTab === "pos" && posView === "sale";
  return (
    <header className={`topbar topbar-${activeTab}`}>
      <button className="hamburger-button" onClick={onOpenNav} type="button" aria-label="เปิดเมนูหลัก">
        <Menu size={24} />
      </button>
      {showPosControls ? (
        <label className="sales-channel-select">
          <span className="sr-only">ช่องทางขาย</span>
          <select value={salesChannel} onChange={(event) => setSalesChannel(event.target.value)}>
            {salesChannels.map((channel) => (
              <option key={channel.id} value={channel.id}>{getSalesChannelLabel(channel.id)}</option>
            ))}
          </select>
        </label>
      ) : (
        <h2>{title}</h2>
      )}
      <div className="top-status">
        <span className={lowStock ? "text-danger" : ""}><Bell size={16} /> ใกล้หมด {lowStock}</span>
      </div>
      {showPosControls && openShift ? (
        <div className="pos-kebab topbar-kebab">
          <button
            aria-expanded={topMenuOpen}
            aria-label={`เมนูเพิ่มเติม ${channelLabel}`}
            className="kebab-button"
            onClick={() => setTopMenuOpen((current) => !current)}
            type="button"
          >
            <MoreVertical size={22} />
          </button>
          {topMenuOpen ? (
            <div className="kebab-menu">
              <button
                onClick={() => {
                  setTopMenuOpen(false);
                  onRequestCloseShift();
                }}
                type="button"
              >
                ปิดกะ
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function MobileSubnav({ activeTab, expenseView, navigateMain, navigateSub }) {
  if (activeTab === "pos") return null;
  const menuChildren = [
    { id: "menu-main", label: "รายการสินค้า", tab: "menu" },
    { id: "categories-main", label: "หมวดหมู่", tab: "categories" },
    { id: "modifiers-main", label: "ตัวเลือกเสริม", tab: "modifiers" },
  ];
  const expenseChildren = [
    { id: "expense-entry-main", label: "บันทึกรายจ่าย", tab: "expense", view: "entry" },
    { id: "expense-history-main", label: "ประวัติรายจ่าย", tab: "expense", view: "history" },
  ];
  const items = activeTab === "menu" || activeTab === "categories" || activeTab === "modifiers" ? menuChildren : activeTab === "expense" ? expenseChildren : [];
  if (!items.length) return null;
  return (
    <div className="mobile-child-tabs">
      {items.map((item) => {
        const active = item.tab === "expense" ? activeTab === "expense" && expenseView === item.view : activeTab === item.tab;
        return (
          <button
            className={active ? "is-active" : ""}
            key={item.id}
            onClick={() => {
              if (item.view) navigateSub(item);
              else navigateMain(item.tab);
            }}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPanel({ lowStock, queueStats }) {
  return (
    <section className="status-card">
      <div><Wifi size={18} /> Realtime listener</div>
      <div><Printer size={18} /> คิวพิมพ์ {queueStats.print}</div>
      <div><Database size={18} /> คิว Google Sheet {queueStats.sheet}</div>
      <div className={lowStock ? "text-danger" : ""}><AlertTriangle size={18} /> แจ้งเตือน {lowStock}</div>
    </section>
  );
}

function DashboardScreen({ expenses, ingredients, orders, products, shifts }) {
  const data = useMemo(() => buildDashboardData(orders, expenses, ingredients, products, shifts), [orders, expenses, ingredients, products, shifts]);
  const prefersReducedMotion = usePrefersReducedMotion();
  const animatedTotalSales = useAnimatedNumber(data.totalSales, { prefersReducedMotion });
  const animatedAverageOrder = useAnimatedNumber(data.averageOrder, { prefersReducedMotion });
  const animatedCashSales = useAnimatedNumber(data.cashSales, { prefersReducedMotion });
  const animatedTransferSales = useAnimatedNumber(data.transferSales, { prefersReducedMotion });
  const animatedOrderCount = useAnimatedNumber(data.orderCount, { duration: 520, prefersReducedMotion });
  const animatedCashOrders = useAnimatedNumber(data.cashOrders, { duration: 520, prefersReducedMotion });
  const animatedTransferOrders = useAnimatedNumber(data.transferOrders, { duration: 520, prefersReducedMotion });
  const animatedCashPercent = useAnimatedNumber(data.cashPercent, { duration: 620, prefersReducedMotion });
  const animatedExpenseTotal = useAnimatedNumber(data.expenseTotal, { prefersReducedMotion });
  const animatedExpenseCount = useAnimatedNumber(data.expenseCount, { duration: 520, prefersReducedMotion });
  const animatedNetAfterExpenses = useAnimatedNumber(data.netAfterExpenses, { prefersReducedMotion });
  return (
    <section className="dashboard-screen motion-dashboard">
      <div className="dashboard-metrics">
        <article className="metric-card" style={{ "--motion-index": 0 }}>
          <span>ยอดขายทั้งหมด</span>
          <strong>{money(animatedTotalSales)} บาท</strong>
          <small>{animatedOrderCount} ออร์เดอร์</small>
        </article>
        <article className="metric-card" style={{ "--motion-index": 1 }}>
          <span>บิลเฉลี่ย</span>
          <strong>{money(animatedAverageOrder)} บาท</strong>
          <small>เฉลี่ยต่อออร์เดอร์</small>
        </article>
        <article className="metric-card" style={{ "--motion-index": 2 }}>
          <span>เงินสด</span>
          <strong>{money(animatedCashSales)} บาท</strong>
          <small>{animatedCashOrders} ออร์เดอร์</small>
        </article>
        <article className="metric-card" style={{ "--motion-index": 3 }}>
          <span>เงินโอน</span>
          <strong>{money(animatedTransferSales)} บาท</strong>
          <small>{animatedTransferOrders} ออร์เดอร์</small>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="chart-card span-2" style={{ "--motion-index": 4 }}>
          <div className="panel-title">
            <BarChart3 size={22} />
            <div>
              <h3>ยอดขายรายวัน 7 วันล่าสุด</h3>
              <p>รวมยอดขายจากออร์เดอร์ที่บันทึกในเครื่องนี้</p>
            </div>
          </div>
          <div className="bar-chart">
            {data.dailySales.map((day, index) => (
              <div className="bar-row" key={day.key} style={{ "--bar-width": `${day.percent}%`, "--motion-index": index }}>
                <span>{day.label}</span>
                <div className="bar-track"><i /></div>
                <strong>{money(day.total)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="chart-card" style={{ "--motion-index": 5 }}>
          <div className="panel-title">
            <WalletCards size={22} />
            <div>
              <h3>ช่องทางชำระเงิน</h3>
              <p>เงินสดเทียบกับเงินโอน</p>
            </div>
          </div>
          <div className="payment-donut" style={{ "--cash": `${animatedCashPercent}%` }}>
            <span>{animatedCashPercent}%</span>
          </div>
          <div className="legend-list">
            <span><i className="legend-cash" /> เงินสด {money(animatedCashSales)} บาท</span>
            <span><i className="legend-transfer" /> เงินโอน {money(animatedTransferSales)} บาท</span>
          </div>
        </article>

        <article className="chart-card" style={{ "--motion-index": 6 }}>
          <div className="panel-title">
            <Utensils size={22} />
            <div>
              <h3>เมนูขายดี</h3>
              <p>เรียงจากจำนวนชิ้น</p>
            </div>
          </div>
          <div className="rank-list">
            {data.topProducts.length ? data.topProducts.map((item, index) => (
              <div key={item.name}>
                <b>{index + 1}</b>
                <span>{item.name}<small>{item.quantity} ชิ้น</small></span>
                <strong>{money(item.total)} บาท</strong>
              </div>
            )) : <div className="empty-compact">ยังไม่มีข้อมูลขาย</div>}
          </div>
        </article>

        <article className="chart-card" style={{ "--motion-index": 7 }}>
          <div className="panel-title">
            <ReceiptText size={22} />
            <div>
              <h3>รายจ่าย</h3>
              <p>ข้อมูลจากหน้าบันทึกรายจ่าย</p>
            </div>
          </div>
          <div className="summary-list">
            <span>รายจ่ายรวม <strong>{money(animatedExpenseTotal)} บาท</strong></span>
            <span>จำนวนรายการ <strong>{animatedExpenseCount}</strong></span>
            <span>ยอดสุทธิหลังรายจ่าย <strong>{money(animatedNetAfterExpenses)} บาท</strong></span>
          </div>
        </article>

        <article className="chart-card" style={{ "--motion-index": 8 }}>
          <div className="panel-title">
            <AlertTriangle size={22} />
            <div>
              <h3>วัตถุดิบใกล้หมด</h3>
              <p>ต่ำกว่าจุดแจ้งเตือน</p>
            </div>
          </div>
          <div className="rank-list compact">
            {data.lowStock.length ? data.lowStock.map((item) => (
              <div key={item.id}>
                <span>{item.name}<small>ขั้นต่ำ {money(item.minimumStock)} {item.unit}</small></span>
                <strong>{money(item.stock)} {item.unit}</strong>
              </div>
            )) : <div className="empty-compact">สต็อกยังปกติ</div>}
          </div>
        </article>
      </div>
    </section>
  );
}

function PosScreen({
  activeCategory,
  cart,
  cartLeavingKeys,
  closeShiftToken,
  catalog,
  changeQuantity,
  ingredients,
  menuCategories,
  onCategory,
  onCheckout,
  onCloseShift,
  onOpenShift,
  onProduct,
  onReprintOrder,
  orders,
  openShift,
  printOptions,
  products,
  posView,
  salesChannel,
  setPosView,
  shifts,
  total,
}) {
  const [shiftPanelOpen, setShiftPanelOpen] = useState(false);
  const [closedShiftSummary, setClosedShiftSummary] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const productCategories = Array.from(new Set([...(menuCategories || categories), ...products.map((product) => product.category)]));
  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase("th-TH");
  const visibleProducts = products.filter((product) => {
    const matchesCategory = product.category === activeCategory;
    if (!normalizedProductSearch) return matchesCategory;
    return matchesCategory && product.name.toLocaleLowerCase("th-TH").includes(normalizedProductSearch);
  });
  const currentSummary = openShift ? calculateShiftSummary(openShift, orders) : null;
  useEffect(() => {
    if (closeShiftToken && openShift && posView === "sale") setShiftPanelOpen(true);
  }, [closeShiftToken, openShift, posView]);
  function submitCloseShift(closingCash) {
    const closed = onCloseShift(closingCash);
    if (closed) {
      setShiftPanelOpen(false);
      setClosedShiftSummary(closed.summary);
    }
  }
  return (
    <section className={`pos-screen ${!openShift && posView === "sale" ? "is-shift-locked" : ""}`}>
      <div className="subnav-row">
        <button className={posView === "sale" ? "is-active" : ""} onClick={() => setPosView("sale")} type="button">ขายสินค้า</button>
        <button className={posView === "history" ? "is-active" : ""} onClick={() => setPosView("history")} type="button">ประวัติการขาย</button>
        {openShift && posView === "sale" ? (
          <button className="close-shift-button" onClick={() => setShiftPanelOpen(true)} type="button">ปิดกะ</button>
        ) : null}
      </div>

      {posView === "history" ? (
      <div className="pos-action-row">
          <button className="ghost-button compact-control" onClick={() => setPosView("sale")} type="button">กลับหน้าขาย</button>
      </div>
      ) : null}

      {posView === "history" ? (
        <SalesHistoryPanel onReprintOrder={onReprintOrder} orders={orders} shifts={shifts} />
      ) : (
        <div className="pos-layout">
          <section className="menu-area">
            <div className="category-row">
              {productCategories.map((category) => (
                <button
                  className={`category-button ${activeCategory === category ? "is-active" : ""}`}
                  disabled={!openShift}
                  key={category}
                  onClick={() => onCategory(category)}
                  type="button"
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="product-grid">
              {visibleProducts.map((product) => {
                const available = openShift && canSellProduct(product.id, ingredients, [], catalog);
                return (
                  <button
                    className={`product-tile ${product.imageDataUrl ? "has-image" : ""} ${product.color || "bg-white"} ${available ? "" : "is-disabled"}`}
                    disabled={!available}
                    key={product.id}
                    onClick={() => onProduct(product)}
                    type="button"
                  >
                    {product.imageDataUrl ? <img alt={product.name} className="product-tile-image" src={product.imageDataUrl} /> : null}
                    <span>{product.name}</span>
                    <strong>{money(getChannelPrice(product, salesChannel))} บาท</strong>
                    {!openShift ? <em>ต้องเปิดกะก่อนขาย</em> : !available ? <em>วัตถุดิบไม่พอ</em> : null}
                  </button>
                );
              })}
              {!visibleProducts.length ? <div className="empty-state product-empty">ไม่พบเมนูที่ค้นหา</div> : null}
            </div>
          </section>
          <CartPanel
            cart={cart}
            cartLeavingKeys={cartLeavingKeys}
            changeQuantity={changeQuantity}
            disabled={!openShift}
            onCheckout={onCheckout}
            printOptions={printOptions}
            total={total}
          />
        </div>
      )}

      {!openShift && posView === "sale" ? (
        <div className="shift-gate-overlay">
          <OpenShiftCard onOpenShift={onOpenShift} />
        </div>
      ) : null}

      {openShift && shiftPanelOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card shift-modal-card">
            <ShiftStatusCard
              onCloseShift={submitCloseShift}
              onDismiss={() => setShiftPanelOpen(false)}
              shift={openShift}
              summary={currentSummary}
            />
          </div>
        </div>
      ) : null}

      {closedShiftSummary ? (
        <div className="modal-backdrop">
          <div className="modal-card shift-modal-card">
            <ShiftClosedSummary summary={closedShiftSummary} onClose={() => setClosedShiftSummary(null)} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CartPanel({
  cart,
  cartLeavingKeys,
  changeQuantity,
  disabled,
  onCheckout,
  printOptions,
  total,
}) {
  return (
    <aside className="cart-panel">
      <div className="panel-title">
        <ShoppingCart size={22} />
        <div>
          <h3>ตะกร้าออเดอร์</h3>
          <p>{cart.length} รายการ</p>
        </div>
      </div>
      <div className="cart-list">
        {cart.length ? cart.map((item) => (
          <div className={`cart-row cart-row-full ${cartLeavingKeys.includes(item.key) ? "is-hidden" : ""}`} key={item.key}>
            <div className="cart-row-head">
              <div>
                <div className="cart-item-title">
                  <strong>{item.product.name}</strong>
                  <span>{money(item.unitPrice)} บาท</span>
                </div>
                {item.modifiers.length ? <p>{item.modifiers.map((modifier) => modifier.label).join(", ")}</p> : null}
                {item.note ? <p className="cart-item-note">หมายเหตุ: {item.note}</p> : null}
              </div>
              <div className="qty-control">
                <button onClick={() => changeQuantity(item.key, -1)} type="button"><Minus size={16} /></button>
                <b>{item.quantity}</b>
                <button onClick={() => changeQuantity(item.key, 1)} type="button"><Plus size={16} /></button>
              </div>
            </div>
          </div>
        )) : <div className="empty-state">แตะเมนูเพื่อเริ่มออเดอร์</div>}
      </div>
      <div className="print-default-note">
        พิมพ์ตามค่าเริ่มต้น: {printOptions.kitchen ? "ใบครัว" : ""}{printOptions.kitchen && printOptions.receipt ? " + " : ""}{printOptions.receipt ? "ใบเสร็จ" : ""}{!printOptions.kitchen && !printOptions.receipt ? "ปิดทั้งหมด" : ""}
      </div>
      <div className="cart-total">
        <span>รวมสุทธิ</span>
        <strong>{money(total)} บาท</strong>
      </div>
      <button className="checkout-button" disabled={disabled || !cart.length} onClick={onCheckout} type="button">
        {disabled ? "เปิดกะก่อนขาย" : "ชำระเงิน"}
      </button>
    </aside>
  );
}

function OpenShiftCard({ onOpenShift }) {
  const [openingCash, setOpeningCash] = useState("");
  return (
    <section className="shift-card needs-open">
      <div>
        <h3>เปิดกะก่อนเริ่มขาย</h3>
        <p>ใส่เงินสดเริ่มต้นในลิ้นชัก เพื่อใช้ตรวจเงินสดตอนปิดกะ</p>
      </div>
      <div className="shift-open-form">
        <label>
          เงินสดเริ่มต้น
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) => setOpeningCash(event.target.value)}
            placeholder="0"
            type="number"
            value={openingCash}
          />
        </label>
        <button className="primary-button" onClick={() => onOpenShift(openingCash)} type="button">
          เปิดกะ
        </button>
      </div>
    </section>
  );
}

function ShiftStatusCard({ onCloseShift, onDismiss, shift, summary }) {
  const [closingCash, setClosingCash] = useState("");
  return (
    <section className="shift-card">
      <div>
        <h3>กะกำลังเปิด</h3>
        <p>เปิดเมื่อ {new Date(shift.openedAt).toLocaleString("th-TH")}</p>
      </div>
      <div className="shift-metrics">
        <span>เงินสดเริ่มต้น <strong>{money(shift.openingCash)} บาท</strong></span>
        <span>เงินสดขาย <strong>{money(summary.cashSales)} บาท</strong></span>
        <span>เงินโอน <strong>{money(summary.transferSales)} บาท</strong></span>
        <span>ออเดอร์ <strong>{summary.orderCount}</strong></span>
      </div>
      <div className="shift-close-form">
        <label>
          เงินสดตอนปิดกะ
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) => setClosingCash(event.target.value)}
            placeholder={money(summary.expectedCash)}
            type="number"
            value={closingCash}
          />
        </label>
        {onDismiss ? <button className="ghost-button" onClick={onDismiss} type="button">ยกเลิก</button> : null}
        <button className="primary-button" onClick={() => onCloseShift(closingCash)} type="button">
          ปิดกะ
        </button>
      </div>
    </section>
  );
}

function ShiftClosedSummary({ onClose, summary }) {
  return (
    <section className="shift-closed-summary">
      <div>
        <h3>สรุปปิดกะ</h3>
        <p>ปิดกะแล้ว ตรวจยอดก่อนออกจากหน้าต่างนี้</p>
      </div>
      <div className="shift-metrics">
        <span>เงินสดเริ่มต้น <strong>{money(summary.openingCash)} บาท</strong></span>
        <span>เงินสดขาย <strong>{money(summary.cashSales)} บาท</strong></span>
        <span>เงินโอน <strong>{money(summary.transferSales)} บาท</strong></span>
        <span>ออเดอร์ <strong>{summary.orderCount}</strong></span>
        <span>เงินสดที่ควรมี <strong>{money(summary.expectedCash)} บาท</strong></span>
        <span>เงินสดที่นับได้ <strong>{money(summary.closingCash)} บาท</strong></span>
        <span className="span-2">ส่วนต่างเงินสด <strong className={summary.cashDifference < 0 ? "text-danger" : ""}>{money(summary.cashDifference)} บาท</strong></span>
      </div>
      <div className="modal-actions">
        <button className="primary-button" onClick={onClose} type="button">ออกจากสรุป</button>
      </div>
    </section>
  );
}

function SalesHistoryPanel({ onReprintOrder, orders, shifts }) {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [printNotice, setPrintNotice] = useState("");
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  useEffect(() => {
    if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) setSelectedOrderId("");
  }, [orders, selectedOrderId]);

  async function reprint(order, type) {
    if (!order) return;
    await onReprintOrder(order, type);
    setPrintNotice(type === "RECEIPT" ? "เพิ่มคิวพิมพ์ใบเสร็จย้อนหลังแล้ว" : "เพิ่มคิวพิมพ์ใบออร์เดอร์ย้อนหลังแล้ว");
    window.setTimeout(() => setPrintNotice(""), 1800);
  }

  return (
    <section className="history-layout sales-history-list-layout">
      <div className="work-panel">
        <div className="panel-title"><ReceiptText size={22} /><h3>ประวัติการขาย</h3></div>
        <div className="table-list">
          {orders.length ? orders.map((order) => (
            <button
              className={`table-row history-row history-order-button ${selectedOrder?.id === order.id ? "is-active" : ""}`}
              key={order.id}
              onClick={() => {
                setSelectedOrderId(order.id);
                setPrintNotice("");
              }}
              type="button"
            >
              <span>
                {getOrderDisplayNo(order)}
                <small>{new Date(order.createdAt).toLocaleString("th-TH")} · {order.paymentMethod === "CASH" ? "เงินสด" : "เงินโอน"}</small>
              </span>
              <strong>{money(order.totalAmount)} บาท</strong>
            </button>
          )) : <div className="empty-state">ยังไม่มีประวัติการขาย</div>}
        </div>
      </div>
      {selectedOrder ? (
        <div className="modal-backdrop">
          <div className="modal-card history-order-modal">
            <OrderDetailPanel
              onClose={() => {
                setSelectedOrderId("");
                setPrintNotice("");
              }}
              order={selectedOrder}
              onReprint={reprint}
              printNotice={printNotice}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OrderDetailPanel({ onClose, onReprint, order, printNotice }) {
  return (
    <div className="order-detail-panel">
      <div className="panel-title">
        <ClipboardList size={22} />
        <div>
          <h3>{getOrderDisplayNo(order)}</h3>
          <p>{new Date(order.createdAt).toLocaleString("th-TH")} · {order.paymentMethod === "CASH" ? "เงินสด" : "เงินโอน"}</p>
        </div>
        {onClose ? <button className="icon-close-button" onClick={onClose} type="button">ปิด</button> : null}
      </div>
      <div className="order-detail-list">
        {order.items?.length ? order.items.map((item, index) => (
          <div className="order-detail-item" key={`${item.productId}-${index}`}>
            <span>
              <strong>{item.quantity}x {item.name}</strong>
              {item.modifiers?.length ? <small>{item.modifiers.map((modifier) => `- ${modifier}`).join(" · ")}</small> : null}
              {item.note ? <small>หมายเหตุ: {item.note}</small> : null}
            </span>
            <b>{money(Number(item.unitPrice || 0) * Number(item.quantity || 0))} บาท</b>
          </div>
        )) : <div className="empty-compact">ไม่มีรายการสินค้าในออร์เดอร์นี้</div>}
      </div>
      {order.note ? <div className="order-detail-note">หมายเหตุทั้งออร์เดอร์: {order.note}</div> : null}
      <div className="order-detail-total">
        <span>รวมสุทธิ</span>
        <strong>{money(order.totalAmount)} บาท</strong>
      </div>
      {order.paymentMethod === "CASH" ? (
        <div className="order-detail-payment">
          <span>รับเงินสด {money(order.cashReceived)} บาท</span>
          <span>เงินทอน {money(order.changeDue)} บาท</span>
        </div>
      ) : null}
      {printNotice ? <div className="inline-warning">{printNotice}</div> : null}
      <div className="modal-actions">
        <button className="primary-button" onClick={() => onReprint(order, "RECEIPT")} type="button"><Printer size={18} /> พิมพ์ใบเสร็จ</button>
        <button className="ghost-button" onClick={() => onReprint(order, "KITCHEN")} type="button"><ReceiptText size={18} /> พิมพ์ใบออร์เดอร์</button>
      </div>
    </div>
  );
}

function SalesHistory({ orders, shifts }) {
  const latestShifts = shifts.slice(0, 8);
  return (
    <section className="history-layout">
      <div className="work-panel">
        <div className="panel-title"><ReceiptText size={22} /><h3>ประวัติการขาย</h3></div>
        <div className="table-list">
          {orders.length ? orders.map((order) => (
            <div className="table-row history-row" key={order.id}>
              <span>
                {getOrderDisplayNo(order)}
                <small>{new Date(order.createdAt).toLocaleString("th-TH")} · {order.paymentMethod === "CASH" ? "เงินสด" : "เงินโอน"}</small>
              </span>
              <strong>{money(order.totalAmount)} บาท</strong>
            </div>
          )) : <div className="empty-state">ยังไม่มีประวัติการขาย</div>}
        </div>
      </div>
      <div className="work-panel">
        <div className="panel-title"><ClipboardList size={22} /><h3>สรุปกะล่าสุด</h3></div>
        <div className="table-list">
          {latestShifts.length ? latestShifts.map((shift) => {
            const summary = shift.summary || calculateShiftSummary(shift, orders, shift.closingCash ?? null);
            return (
              <div className="shift-summary-card" key={shift.id}>
                <strong>{shift.closedAt ? "ปิดกะแล้ว" : "กำลังเปิดกะ"}</strong>
                <span>เปิด {new Date(shift.openedAt).toLocaleString("th-TH")}</span>
                {shift.closedAt ? <span>ปิด {new Date(shift.closedAt).toLocaleString("th-TH")}</span> : null}
                <div className="shift-metrics compact">
                  <span>เงินสด <strong>{money(summary.cashSales)} บาท</strong></span>
                  <span>เงินโอน <strong>{money(summary.transferSales)} บาท</strong></span>
                  <span>ส่วนต่าง <strong className={summary.cashDifference < 0 ? "text-danger" : ""}>{money(summary.cashDifference)} บาท</strong></span>
                  <span>ออเดอร์ <strong>{summary.orderCount}</strong></span>
                </div>
              </div>
            );
          }) : <div className="empty-state">ยังไม่มีข้อมูลกะ</div>}
        </div>
      </div>
    </section>
  );
}

function ModifierModal({ ingredients, modifierIds, modifierRecipes, modifiers, note, onClose, onConfirm, onNoteChange, onToggle, product }) {
  const { backdropRef } = useAnimeModal(onClose, modifierModalChildren);
  const productModifiers = modifiers.filter((modifier) => modifier.productIds.includes(product.id));
  const selectedRecipeLines = modifierRecipes
    .filter((recipe) => modifierIds.includes(recipe.modifierId))
    .map((recipe) => ({ ingredientId: recipe.ingredientId, quantity: Math.max(0, recipe.quantity) }));
  const missing = getMissingIngredients(selectedRecipeLines, ingredients);
  return (
    <div className="modal-backdrop anime-modal" ref={backdropRef}>
      <div className="modal-card modifier-modal-card">
        <h3>{product.name}</h3>
        <p>เลือกคำสั่งพิเศษก่อนเพิ่มลงตะกร้า</p>
        <div className="modifier-list">
          {productModifiers.map((modifier) => (
            <button
              className={`modifier-row ${modifierIds.includes(modifier.id) ? "is-active" : ""}`}
              key={modifier.id}
              onClick={() => onToggle(modifier.id)}
              type="button"
            >
              <span>{modifier.label}</span>
              <strong>{modifier.price ? `+${money(modifier.price)} บาท` : "ไม่คิดเงิน"}</strong>
            </button>
          ))}
        </div>
        <label className="modifier-note-field">
          หมายเหตุรายการ
          <textarea
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="เช่น ไม่เผ็ด ขอเกรียมๆ"
            value={note}
          />
        </label>
        {missing.length ? <div className="warning-box">วัตถุดิบไม่พอ: {missing.map((item) => item.name).join(", ")}</div> : null}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">ยกเลิก</button>
          <button className="primary-button" disabled={missing.length > 0} onClick={onConfirm} type="button">เพิ่มลงตะกร้า</button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ cart, onClose, onSubmit, total }) {
  const { backdropRef, closeWithAnimation } = useAnimeModal(onClose, paymentModalChildren);
  const [method, setMethod] = useState("CASH");
  const [cash, setCash] = useState(() => Number(total || 0));
  const [quickCashTouched, setQuickCashTouched] = useState(false);
  const change = Math.max(0, cash - total);
  function addCash(amount) {
    setCash((current) => (quickCashTouched ? Number(current || 0) + amount : amount));
    setQuickCashTouched(true);
  }
  function updateCash(value) {
    setCash(Number(value || 0));
    setQuickCashTouched(true);
  }
  return (
    <div className="modal-backdrop anime-modal" ref={backdropRef}>
      <div className="modal-card payment-card">
        <h3>ชำระเงิน</h3>
        <div className="payment-tabs">
          <button className={method === "TRANSFER" ? "is-active" : ""} onClick={() => setMethod("TRANSFER")} type="button">
            <CreditCard size={18} /> เงินโอน
          </button>
          <button className={method === "CASH" ? "is-active" : ""} onClick={() => setMethod("CASH")} type="button">
            <Banknote size={18} /> เงินสด
          </button>
        </div>
        <div className="receipt-preview">
          {cart.map((item) => (
            <span key={item.key}>
              <b>{item.quantity}x {item.product.name}</b>
              {item.modifiers.length ? <small>{item.modifiers.map((modifier) => modifier.label).join(", ")}</small> : null}
              {item.note ? <small>{item.note}</small> : null}
            </span>
          ))}
        </div>
        <div className="pay-total"><span>ยอดที่ต้องชำระ</span><strong>{money(total)} บาท</strong></div>
        {method === "CASH" ? (
          <>
            <div className="cash-display">{money(cash)} บาท</div>
            <label className="cash-input-wrap">
              <span>จำนวนเงินที่ได้รับ</span>
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) => updateCash(event.target.value)}
                type="number"
                value={cash}
              />
            </label>
            <div className="cash-buttons">
              {[20, 50, 100, 500, 1000].map((amount) => (
                <button key={amount} onClick={() => addCash(amount)} type="button">+{amount}</button>
              ))}
              <button onClick={() => { setCash(0); setQuickCashTouched(true); }} type="button">ล้าง</button>
            </div>
            <div className="change-line">เงินทอน {money(change)} บาท</div>
          </>
        ) : <div className="transfer-ready"><Check size={20} /> เงินโอนสำเร็จได้ทันทีเมื่อกดยืนยัน</div>}
        <div className="modal-actions">
          <button className="ghost-button" onClick={closeWithAnimation} type="button">ยกเลิก</button>
          <button
            className="primary-button"
            disabled={method === "CASH" && cash < total}
            onClick={() => onSubmit({ paymentMethod: method, cashReceived: method === "CASH" ? cash : total })}
            type="button"
          >
            ยืนยันออเดอร์
          </button>
        </div>
      </div>
    </div>
  );
}

function InventoryScreen({ adjustStock, deleteIngredient, ingredients, onAddPurchaseUnit, purchaseUnits, saveIngredient }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const selected = selectedId ? ingredients.find((item) => item.id === selectedId) : null;
  const [form, setForm] = useState(emptyIngredient());
  const [adjustment, setAdjustment] = useState({ quantityDelta: "", reason: "" });
  const [unitForm, setUnitForm] = useState({ label: "แพ็ค", ratio: 1 });
  const [editingUnitId, setEditingUnitId] = useState("");
  const [unitEditorOpen, setUnitEditorOpen] = useState(false);
  const [editorNotice, setEditorNotice] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    if (selected) setForm(selected);
  }, [selectedId, selected?.stock]);

  const savedForm = selected || emptyIngredient();
  const hasUnsavedChanges = editorOpen && JSON.stringify(normalizeIngredientForm(form)) !== JSON.stringify(normalizeIngredientForm(savedForm));

  function warnUnsaved() {
    setEditorNotice("มีข้อมูลที่แก้ไขแล้วยังไม่ได้บันทึก");
    window.setTimeout(() => setEditorNotice(""), 1800);
  }

  function openEditorFor(item) {
    if (hasUnsavedChanges) {
      warnUnsaved();
      return;
    }
    setSelectedId(item.id);
    setForm(item);
    setEditingUnitId("");
    setUnitEditorOpen(false);
    setUnitForm({ label: "แพ็ค", ratio: 1 });
    setEditorOpen(true);
    setDeleteArmed(false);
    setEditorNotice("");
  }

  function startNewIngredient() {
    if (hasUnsavedChanges) {
      warnUnsaved();
      return;
    }
    setSelectedId("");
    setForm(emptyIngredient());
    setEditingUnitId("");
    setUnitEditorOpen(false);
    setUnitForm({ label: "แพ็ค", ratio: 1 });
    setEditorOpen(true);
    setDeleteArmed(false);
    setEditorNotice("");
  }

  function closeEditor() {
    if (hasUnsavedChanges) {
      warnUnsaved();
      return;
    }
    setSelectedId(null);
    setEditorOpen(false);
    setEditingUnitId("");
    setUnitEditorOpen(false);
    setDeleteArmed(false);
    setEditorNotice("");
  }

  const rows = ingredients.filter((item) => {
    const low = Number(item.stock) <= Number(item.minimumStock);
    if (filter === "low" && !low) return false;
    if (filter === "out" && Number(item.stock) > 0) return false;
    return item.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  function saveForm(event) {
    event.preventDefault();
    const next = {
      ...form,
      id: form.id || `ing_${Date.now()}`,
      stock: Number(form.stock || 0),
      minimumStock: Number(form.minimumStock || 0),
    };
    saveIngredient(next);
    setSelectedId(null);
    setEditorOpen(false);
    setEditingUnitId("");
    setUnitEditorOpen(false);
    setDeleteArmed(false);
    setEditorNotice("");
  }

  function removeSelectedIngredient() {
    if (!selected) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setEditorNotice("กดลบอีกครั้งเพื่อยืนยัน");
      return;
    }
    deleteIngredient(selected.id);
    setSelectedId(null);
    setForm(emptyIngredient());
    setEditorOpen(false);
    setEditingUnitId("");
    setUnitEditorOpen(false);
    setDeleteArmed(false);
    setEditorNotice("");
  }

  function addUnit(event) {
    event.preventDefault();
    if (!selected) return;
    const nextUnit = {
      id: editingUnitId || `unit_${Date.now()}`,
      ingredientId: selected.id,
      label: unitForm.label.trim() || selected.unit,
      ratio: Number(unitForm.ratio || 1),
      baseUnit: selected.unit,
    };
    onAddPurchaseUnit((current) => {
      if (editingUnitId) {
        return current.map((unit) => (unit.id === editingUnitId ? nextUnit : unit));
      }
      return [...current, nextUnit];
    });
    setEditingUnitId("");
    setUnitEditorOpen(false);
    setUnitForm({ label: "แพ็ค", ratio: 1 });
  }

  function editUnit(unit) {
    setEditingUnitId(unit.id);
    setUnitEditorOpen(true);
    setUnitForm({ label: unit.label, ratio: unit.ratio });
  }

  function startAddUnit() {
    const firstUnit = purchaseUnits.find((unit) => unit.ingredientId === selected?.id);
    setEditingUnitId("");
    setUnitEditorOpen(true);
    setUnitForm({
      label: firstUnit?.label || "แพ็ค",
      ratio: firstUnit?.ratio || 1,
    });
  }

  function cancelUnitEdit() {
    setEditingUnitId("");
    setUnitEditorOpen(false);
    setUnitForm({ label: "แพ็ค", ratio: 1 });
  }

  function removeUnit(unitId) {
    onAddPurchaseUnit((current) => current.filter((unit) => unit.id !== unitId));
    if (editingUnitId === unitId) {
      setEditingUnitId("");
      setUnitEditorOpen(false);
      setUnitForm({ label: "แพ็ค", ratio: 1 });
    }
  }

  function submitAdjustment(event) {
    event.preventDefault();
    adjustStock({ ingredientId: selected.id, ...adjustment });
    setAdjustment({ quantityDelta: "", reason: "" });
  }

  return (
    <section className={`management-layout ${editorOpen ? "" : "is-single"}`}>
      <div className="work-panel">
        <div className="toolbar">
          <div className="search-box"><Search size={18} /><input placeholder="ค้นหาวัตถุดิบ" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")} type="button">ทั้งหมด</button>
          <button className={filter === "low" ? "is-active" : ""} onClick={() => setFilter("low")} type="button">ใกล้หมด</button>
          <button className={filter === "out" ? "is-active" : ""} onClick={() => setFilter("out")} type="button">หมดแล้ว</button>
          <button
            className="new-record-button toolbar-add-button"
            onClick={startNewIngredient}
            type="button"
          >
            <Plus size={20} />
            เพิ่มรายการวัตถุดิบใหม่
          </button>
        </div>
        <div className="inventory-grid">
          {rows.map((item) => {
            const low = Number(item.stock) <= Number(item.minimumStock);
            return (
              <button
                className={`inventory-card ${low ? "is-low" : ""} ${selectedId === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => {
                  if (editorOpen && selectedId === item.id) closeEditor();
                  else openEditorFor(item);
                }}
                type="button"
              >
                <div>
                  <h3>{item.name}</h3>
                  <p>ขั้นต่ำ {money(item.minimumStock)} {item.unit}</p>
                </div>
                <strong>{money(item.stock)} <small>{item.unit}</small></strong>
                <span>{low ? "ใกล้หมด" : "พร้อมขาย"}</span>
              </button>
            );
          })}
        </div>
      </div>
      {editorOpen ? (
      <aside className={`side-editor ${editorNotice ? "is-unsaved" : ""}`}>
        <form onSubmit={saveForm}>
          <div className="panel-title">
            <Edit3 size={20} />
            <h3>จัดการวัตถุดิบ</h3>
            <button className="icon-close-button" onClick={closeEditor} type="button">ปิด</button>
          </div>
          {editorNotice ? <div className="inline-warning">{editorNotice}</div> : null}
          <label className={hasUnsavedChanges && normalizeIngredientForm(form).name !== normalizeIngredientForm(savedForm).name ? "is-dirty" : ""}>ชื่อ<input value={form.name || ""} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, name: event.target.value })); }} /></label>
          <label className={hasUnsavedChanges && normalizeIngredientForm(form).unit !== normalizeIngredientForm(savedForm).unit ? "is-dirty" : ""}>หน่วยหลัก<input value={form.unit || ""} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, unit: event.target.value })); }} /></label>
          <label className={hasUnsavedChanges && normalizeIngredientForm(form).stock !== normalizeIngredientForm(savedForm).stock ? "is-dirty" : ""}>คงเหลือ<input inputMode="decimal" type="number" value={form.stock ?? 0} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, stock: event.target.value })); }} /></label>
          <label className={hasUnsavedChanges && normalizeIngredientForm(form).minimumStock !== normalizeIngredientForm(savedForm).minimumStock ? "is-dirty" : ""}>แจ้งเตือนเมื่อเหลือ<input inputMode="decimal" type="number" value={form.minimumStock ?? 0} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, minimumStock: event.target.value })); }} /></label>
          <div className="modal-actions">
            <button className="primary-button" type="submit"><Save size={18} /> บันทึก</button>
            {selected ? <button className={`danger-button ${deleteArmed ? "is-armed" : ""}`} onClick={removeSelectedIngredient} type="button">{deleteArmed ? "ยืนยันลบ" : "ลบวัตถุดิบ"}</button> : null}
          </div>
        </form>
        {selected ? (
          <>
            <form onSubmit={addUnit}>
              <h3>หน่วยซื้อ</h3>
              <div className="small-list">
                {purchaseUnits.filter((unit) => unit.ingredientId === selected.id).map((unit) => (
                  <div className="purchase-unit-row" key={unit.id}>
                    <span>1 {unit.label} = {money(unit.ratio)} {unit.baseUnit}</span>
                    <button onClick={() => editUnit(unit)} type="button">แก้ไข</button>
                    <button className="danger-mini-button" onClick={() => removeUnit(unit.id)} type="button">ลบ</button>
                  </div>
                ))}
              </div>
              {unitEditorOpen ? (
                <div className="purchase-unit-form">
                  <label>ชื่อหน่วยซื้อ<input value={unitForm.label} onChange={(event) => setUnitForm((current) => ({ ...current, label: event.target.value }))} /></label>
                  <label>ตัวคูณ<input inputMode="decimal" type="number" value={unitForm.ratio} onChange={(event) => setUnitForm((current) => ({ ...current, ratio: event.target.value }))} /></label>
                  <div className="modal-actions compact-actions">
                    <button className="ghost-button" type="submit">{editingUnitId ? "บันทึกหน่วยซื้อ" : "บันทึกหน่วยซื้อใหม่"}</button>
                    <button className="ghost-button" onClick={cancelUnitEdit} type="button">ยกเลิก</button>
                  </div>
                </div>
              ) : (
                <button className="ghost-button" onClick={startAddUnit} type="button">เพิ่มหน่วยซื้อ</button>
              )}
            </form>
            <form onSubmit={submitAdjustment}>
              <h3>ปรับ stock manual</h3>
              <label>จำนวน + / -<input inputMode="decimal" type="number" value={adjustment.quantityDelta} onChange={(event) => setAdjustment((current) => ({ ...current, quantityDelta: event.target.value }))} /></label>
              <label>เหตุผล<input value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} placeholder="เช่น นับจริง, เสียหาย" /></label>
              <button className="ghost-button" type="submit">บันทึกการปรับ</button>
            </form>
          </>
        ) : null}
      </aside>
      ) : null}
    </section>
  );
}

function MenuRecipeScreen({ deleteProduct, ingredients, menuCategories, products, recipes, setProducts, setRecipes }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productActionNotice, setProductActionNotice] = useState("");
  const selected = selectedId ? products.find((product) => product.id === selectedId) : null;
  const [productForm, setProductForm] = useState(emptyProduct());
  const [recipeDraft, setRecipeDraft] = useState({});
  const [hasRecipe, setHasRecipe] = useState(false);
  const [imageUpload, setImageUpload] = useState({ progress: 0, uploading: false });
  const [editorNotice, setEditorNotice] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const productCategories = Array.from(new Set([...(menuCategories || []), ...products.map((product) => product.category).filter(Boolean)]));
  const visibleProducts = categoryFilter === "all" ? products : products.filter((product) => product.category === categoryFilter);
  const savedProductForm = selected || emptyProduct();
  const savedRecipeDraft = selected
    ? Object.fromEntries(recipes.filter((recipe) => recipe.productId === selected.id).map((recipe) => [recipe.ingredientId, recipe.quantity]))
    : {};
  const savedHasRecipe = Object.keys(savedRecipeDraft).length > 0;
  const recipeEntries = Object.entries(recipeDraft).filter(([, quantity]) => Number(quantity) > 0);
  const hasUnsavedChanges = editorOpen && (
    JSON.stringify(normalizeProductForm(productForm)) !== JSON.stringify(normalizeProductForm(savedProductForm)) ||
    hasRecipe !== savedHasRecipe ||
    JSON.stringify(normalizeRecipeDraft(recipeDraft)) !== JSON.stringify(normalizeRecipeDraft(savedRecipeDraft))
  );

  useEffect(() => {
    if (!selected) return;
    const nextDraft = Object.fromEntries(recipes.filter((recipe) => recipe.productId === selected.id).map((recipe) => [recipe.ingredientId, recipe.quantity]));
    setProductForm(selected);
    setRecipeDraft(nextDraft);
    setHasRecipe(Object.keys(nextDraft).length > 0);
    setImageUpload({ progress: selected.imageDataUrl ? 100 : 0, uploading: false });
  }, [selectedId, selected?.price, recipes.length]);

  function warnUnsaved() {
    setEditorNotice("มีข้อมูลที่แก้ไขแล้วยังไม่ได้บันทึก");
    window.setTimeout(() => setEditorNotice(""), 1800);
  }

  function openEditorFor(product) {
    if (hasUnsavedChanges) {
      warnUnsaved();
      return;
    }
    setSelectedId(product.id);
    setProductForm(product);
    setEditorOpen(true);
    setDeleteArmed(false);
    setEditorNotice("");
    setProductActionNotice("");
  }

  function startNewProduct() {
    if (hasUnsavedChanges) {
      warnUnsaved();
      return;
    }
    setSelectedId("");
    setProductForm(emptyProduct(productCategories[0] || categories[0]));
    setRecipeDraft({});
    setHasRecipe(false);
    setImageUpload({ progress: 0, uploading: false });
    setEditorOpen(true);
    setDeleteArmed(false);
    setEditorNotice("");
    setProductActionNotice("");
  }

  function closeEditor() {
    if (hasUnsavedChanges) {
      warnUnsaved();
      return;
    }
    setSelectedId(null);
    setEditorOpen(false);
    setDeleteArmed(false);
    setEditorNotice("");
    setProductActionNotice("");
  }

  function saveProduct(event) {
    event.preventDefault();
    const next = {
      ...productForm,
      id: productForm.id || `prod_${Date.now()}`,
      channelPrices: normalizeChannelPrices(productForm),
      price: getChannelPrice(productForm, "store"),
      channelAvailability: normalizeChannelAvailability(productForm),
      active: Object.values(normalizeChannelAvailability(productForm)).some(Boolean),
    };
    setProducts((current) => {
      const exists = current.some((product) => product.id === next.id);
      return exists ? current.map((product) => (product.id === next.id ? next : product)) : [...current, next];
    });
    const nextRecipes = hasRecipe
      ? recipeEntries.map(([ingredientId, quantity]) => ({ productId: next.id, ingredientId, quantity: Number(quantity) }))
      : [];
    setRecipes((current) => [...current.filter((recipe) => recipe.productId !== next.id), ...nextRecipes]);
    setSelectedId(null);
    setEditorOpen(false);
    setDeleteArmed(false);
    setEditorNotice("");
  }

  function updateProductImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setEditorNotice("กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น");
      window.setTimeout(() => setEditorNotice(""), 1800);
      return;
    }
    setImageUpload({ progress: 12, uploading: true });
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return;
      setImageUpload({ progress: Math.max(12, Math.round((event.loaded / event.total) * 86)), uploading: true });
    };
    reader.onload = () => {
      setDeleteArmed(false);
      setProductForm((current) => ({
        ...current,
        imageDataUrl: String(reader.result || ""),
        imageName: file.name,
        imageSize: file.size,
      }));
      setImageUpload({ progress: 100, uploading: false });
    };
    reader.onerror = () => setImageUpload({ progress: 0, uploading: false });
    reader.readAsDataURL(file);
  }

  function removeProductImage() {
    setDeleteArmed(false);
    setImageUpload({ progress: 0, uploading: false });
    setProductForm((current) => ({ ...current, imageDataUrl: "", imageName: "", imageSize: 0 }));
  }

  function addRecipeLine() {
    const nextIngredient = ingredients.find((ingredient) => !recipeDraft[ingredient.id]);
    if (!nextIngredient) return;
    setHasRecipe(true);
    setRecipeDraft((current) => ({ ...current, [nextIngredient.id]: 1 }));
  }

  function updateRecipeIngredient(fromIngredientId, toIngredientId) {
    if (!toIngredientId || fromIngredientId === toIngredientId) return;
    setRecipeDraft((current) => {
      const next = { ...current };
      const quantity = next[fromIngredientId] || 1;
      delete next[fromIngredientId];
      next[toIngredientId] = quantity;
      return next;
    });
  }

  function removeProduct() {
    if (!selected) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setProductActionNotice("กด “ยืนยันลบ” อีกครั้งเพื่อลบสินค้า");
      return;
    }
    deleteProduct(selected.id);
    setSelectedId(null);
    setProductForm(emptyProduct());
    setRecipeDraft({});
    setHasRecipe(false);
    setEditorOpen(false);
    setDeleteArmed(false);
    setEditorNotice("");
    setProductActionNotice("");
  }

  function moveProduct(productId, direction) {
    setDeleteArmed(false);
    const orderedVisible = categoryFilter === "all" ? products : products.filter((product) => product.category === categoryFilter);
    const currentVisibleIndex = orderedVisible.findIndex((product) => product.id === productId);
    const targetVisible = orderedVisible[currentVisibleIndex + direction];
    if (!targetVisible) return;
    setProducts((current) => {
      const next = [...current];
      const fromIndex = next.findIndex((product) => product.id === productId);
      const toIndex = next.findIndex((product) => product.id === targetVisible.id);
      if (fromIndex < 0 || toIndex < 0) return current;
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  }

  return (
    <section className={`management-layout ${editorOpen ? "" : "is-single"}`}>
      <div className="work-panel">
        <div className="toolbar management-toolbar">
          <button className={categoryFilter === "all" ? "is-active" : ""} onClick={() => setCategoryFilter("all")} type="button">ทั้งหมด</button>
          {productCategories.map((category) => (
            <button
              className={categoryFilter === category ? "is-active" : ""}
              key={category}
              onClick={() => setCategoryFilter(category)}
              type="button"
            >
              {category}
            </button>
          ))}
          <button className="new-record-button toolbar-add-button" onClick={startNewProduct} type="button">
            <Plus size={20} />
            เพิ่มสินค้าใหม่
          </button>
        </div>
        {productActionNotice ? <div className="inline-confirm">{productActionNotice}</div> : null}
        <div className="product-admin-grid">
          {visibleProducts.map((product, index) => (
            <article
              className={`admin-product ${selectedId === product.id ? "is-active" : ""}`}
              key={product.id}
              onClick={() => {
                if (editorOpen && selectedId === product.id) closeEditor();
                else openEditorFor(product);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (editorOpen && selectedId === product.id) closeEditor();
                  else openEditorFor(product);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="admin-product-order" aria-label="จัดลำดับสินค้า">
                <button
                  aria-label={`เลื่อน ${product.name} ขึ้น`}
                  disabled={index === 0}
                  className={`order-icon-button ${index === 0 ? "is-disabled" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    moveProduct(product.id, -1);
                  }}
                  type="button"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  aria-label={`เลื่อน ${product.name} ลง`}
                  disabled={index === visibleProducts.length - 1}
                  className={`order-icon-button ${index === visibleProducts.length - 1 ? "is-disabled" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    moveProduct(product.id, 1);
                  }}
                  type="button"
                >
                  <ChevronDown size={16} />
                </button>
              </span>
              {product.imageDataUrl ? <img alt={product.name} className="admin-product-image" src={product.imageDataUrl} /> : null}
              <strong>{product.name}</strong>
              <span>{product.category} · หน้าร้าน {money(getChannelPrice(product, "store"))} บาท</span>
              <em>{product.active === false ? "ปิดขาย" : "เปิดขาย"}</em>
            </article>
          ))}
        </div>
      </div>
      {editorOpen ? (
      <form className={`side-editor ${editorNotice ? "is-unsaved" : ""}`} onSubmit={saveProduct}>
        <div className="panel-title">
          <Utensils size={20} />
          <h3>รายการสินค้าและสูตร BOM</h3>
          <button className="icon-close-button" onClick={closeEditor} type="button">ปิด</button>
        </div>
        {editorNotice ? <div className="inline-warning">{editorNotice}</div> : null}
        {productActionNotice ? <div className="inline-confirm">{productActionNotice}</div> : null}
        <label className={hasUnsavedChanges && normalizeProductForm(productForm).name !== normalizeProductForm(savedProductForm).name ? "is-dirty" : ""}>ชื่อเมนู<input value={productForm.name || ""} onChange={(event) => { setDeleteArmed(false); setProductForm((current) => ({ ...current, name: event.target.value })); }} /></label>
        <MenuImageUploader
          className={hasUnsavedChanges && normalizeProductForm(productForm).imageDataUrl !== normalizeProductForm(savedProductForm).imageDataUrl ? "is-dirty" : ""}
          imageDataUrl={productForm.imageDataUrl}
          imageName={productForm.imageName}
          imageSize={productForm.imageSize}
          onFile={updateProductImageFile}
          onRemove={removeProductImage}
          progress={imageUpload.progress}
          uploading={imageUpload.uploading}
        />
        <label className={hasUnsavedChanges && normalizeProductForm(productForm).category !== normalizeProductForm(savedProductForm).category ? "is-dirty" : ""}>หมวด<select value={productForm.category || productCategories[0] || ""} onChange={(event) => { setDeleteArmed(false); setProductForm((current) => ({ ...current, category: event.target.value })); }}>
          {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select></label>
        <div className={`channel-price-grid ${hasUnsavedChanges && JSON.stringify(normalizeProductForm(productForm).channelPrices) !== JSON.stringify(normalizeProductForm(savedProductForm).channelPrices) ? "is-dirty" : ""}`}>
          <strong>ราคาตามช่องทางการขาย</strong>
          {salesChannels.map((channel) => (
            <label className="channel-price-row" key={channel.id}>
              <span>{channel.label}</span>
              <input inputMode="decimal" type="number" value={getChannelPrice(productForm, channel.id)} onChange={(event) => { setDeleteArmed(false); setProductForm((current) => ({ ...current, channelPrices: { ...normalizeChannelPrices(current), [channel.id]: event.target.value }, price: channel.id === "store" ? event.target.value : current.price })); }} />
              <span className="channel-active-toggle"><input checked={normalizeChannelAvailability(productForm)[channel.id] !== false} onChange={(event) => { setDeleteArmed(false); setProductForm((current) => ({ ...current, channelAvailability: { ...normalizeChannelAvailability(current), [channel.id]: event.target.checked }, active: true })); }} type="checkbox" /> เปิดขาย</span>
            </label>
          ))}
        </div>
        <div className={`recipe-toggle-box ${hasUnsavedChanges && (hasRecipe !== savedHasRecipe || JSON.stringify(normalizeRecipeDraft(recipeDraft)) !== JSON.stringify(normalizeRecipeDraft(savedRecipeDraft))) ? "is-dirty" : ""}`}>
          <label className="check-line"><input checked={hasRecipe} onChange={(event) => { setDeleteArmed(false); setHasRecipe(event.target.checked); }} type="checkbox" /> มีวัตถุดิบในสูตร</label>
          {hasRecipe ? (
            <div className="recipe-line-list">
              {recipeEntries.map(([ingredientId, quantity]) => {
                const ingredient = ingredients.find((item) => item.id === ingredientId);
                return (
                  <div className="recipe-line-row" key={ingredientId}>
                    <select value={ingredientId} onChange={(event) => updateRecipeIngredient(ingredientId, event.target.value)}>
                      {ingredients.map((item) => <option disabled={Boolean(recipeDraft[item.id]) && item.id !== ingredientId} key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input
                      inputMode="decimal"
                      min="0"
                      type="number"
                      value={quantity}
                      onChange={(event) => setRecipeDraft((current) => ({ ...current, [ingredientId]: event.target.value }))}
                      placeholder="จำนวน"
                    />
                    <span>{ingredient?.unit || ""}</span>
                    <button onClick={() => setRecipeDraft((current) => {
                      const next = { ...current };
                      delete next[ingredientId];
                      return next;
                    })} type="button"><Trash2 size={16} /></button>
                  </div>
                );
              })}
              <button className="ghost-button" onClick={addRecipeLine} type="button">เพิ่มวัตถุดิบในสูตร</button>
            </div>
          ) : <div className="empty-compact">เมนูนี้ไม่ตัดสต็อกวัตถุดิบ</div>}
        </div>
        <div className="modal-actions">
          <button className="primary-button" type="submit">บันทึกรายการสินค้า</button>
          {selected ? <button className={`danger-button ${deleteArmed ? "is-armed" : ""}`} onClick={removeProduct} type="button">{deleteArmed ? "ยืนยันลบสินค้า" : "ลบสินค้า"}</button> : null}
        </div>
      </form>
      ) : null}
    </section>
  );
}

function CategoryManagementScreen({ menuCategories, products, setMenuCategories, setProducts }) {
  const productCategories = Array.from(new Set([...(menuCategories || []), ...products.map((product) => product.category).filter(Boolean)]));
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [notice, setNotice] = useState("");

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function addCategory(event) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    if (productCategories.includes(name)) {
      flash("มีหมวดนี้อยู่แล้ว");
      return;
    }
    setMenuCategories((current) => [...current, name]);
    setNewCategoryName("");
    setDeleteTarget("");
  }

  function startEdit(category) {
    setEditingCategory(category);
    setEditingName(category);
    setDeleteTarget("");
  }

  function saveEdit(category) {
    const name = editingName.trim();
    if (!name) return;
    if (name !== category && productCategories.includes(name)) {
      flash("มีหมวดนี้อยู่แล้ว");
      return;
    }
    setMenuCategories((current) => current.map((item) => (item === category ? name : item)));
    setProducts((current) => current.map((product) => (product.category === category ? { ...product, category: name } : product)));
    setEditingCategory("");
    setEditingName("");
    setDeleteTarget("");
  }

  function moveCategory(category, direction) {
    const index = productCategories.indexOf(category);
    const target = productCategories[index + direction];
    if (!target) return;
    setMenuCategories((current) => {
      const next = Array.from(new Set([...current, ...productCategories]));
      const fromIndex = next.indexOf(category);
      const toIndex = next.indexOf(target);
      if (fromIndex < 0 || toIndex < 0) return current;
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
    setDeleteTarget("");
  }

  function removeCategory(category) {
    if (deleteTarget !== category) {
      const usedCount = products.filter((product) => product.category === category).length;
      setDeleteTarget(category);
      flash(usedCount ? `กด “ยืนยันลบ” เพื่อลบหมวดนี้ สินค้า ${usedCount} รายการจะถูกย้ายไปหมวดอื่น` : "กด “ยืนยันลบ” เพื่อลบหมวดนี้");
      return;
    }
    const fallback = productCategories.find((item) => item !== category) || categories[0] || "";
    if (!fallback) {
      flash("ต้องมีอย่างน้อย 1 หมวด");
      return;
    }
    setMenuCategories((current) => current.filter((item) => item !== category));
    setProducts((current) => current.map((product) => (product.category === category ? { ...product, category: fallback } : product)));
    setDeleteTarget("");
  }

  return (
    <section className="work-panel category-admin-panel">
      <div className="panel-title">
        <Utensils size={22} />
        <div>
          <h3>หมวดหมู่สินค้า</h3>
          <p>จัดลำดับหมวด แก้ชื่อ และควบคุมการลบแบบมีการยืนยัน</p>
        </div>
      </div>
      {notice ? <div className="inline-confirm">{notice}</div> : null}
      <form className="category-add-row" onSubmit={addCategory}>
        <input
          aria-label="เพิ่มหมวดหมู่สินค้า"
          onChange={(event) => setNewCategoryName(event.target.value)}
          placeholder="เพิ่มหมวด เช่น เบอร์เกอร์, เครื่องดื่ม"
          value={newCategoryName}
        />
        <button className="primary-button" type="submit"><Plus size={18} /> เพิ่มหมวด</button>
      </form>
      <div className="category-admin-list">
        {productCategories.map((category, index) => {
          const isEditing = editingCategory === category;
          const usedCount = products.filter((product) => product.category === category).length;
          return (
            <div className="category-admin-row" key={category}>
              <div className="category-order-controls">
                <button disabled={index === 0} onClick={() => moveCategory(category, -1)} type="button" aria-label={`เลื่อน ${category} ขึ้น`}><ChevronUp size={16} /></button>
                <button disabled={index === productCategories.length - 1} onClick={() => moveCategory(category, 1)} type="button" aria-label={`เลื่อน ${category} ลง`}><ChevronDown size={16} /></button>
              </div>
              <div className="category-name-cell">
                {isEditing ? (
                  <input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
                ) : (
                  <strong>{category}</strong>
                )}
                <small>{usedCount} รายการสินค้า</small>
              </div>
              <div className="category-row-actions">
                {isEditing ? (
                  <>
                    <button className="ghost-button" onClick={() => saveEdit(category)} type="button">บันทึก</button>
                    <button className="ghost-button" onClick={() => setEditingCategory("")} type="button">ยกเลิก</button>
                  </>
                ) : (
                  <button className="ghost-button" onClick={() => startEdit(category)} type="button"><Edit3 size={16} /> แก้ไข</button>
                )}
                <button className={`danger-button ${deleteTarget === category ? "is-armed" : ""}`} onClick={() => removeCategory(category)} type="button">
                  {deleteTarget === category ? "ยืนยันลบ" : "ลบ"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MenuImageUploader({ className = "", imageDataUrl, imageName, imageSize, onFile, onRemove, progress, uploading }) {
  const inputRef = useRef(null);
  const hasImage = Boolean(imageDataUrl);
  const displayProgress = hasImage ? Math.max(progress || 0, 100) : progress || 0;

  function pickFile(event) {
    onFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function dropFile(event) {
    event.preventDefault();
    onFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className={`menu-image-control ${className}`}>
      <strong>รูปเมนู</strong>
      <div
        className={`image-drop-zone ${hasImage ? "has-file" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropFile}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
      >
        {hasImage ? <img alt={imageName || "รูปเมนู"} src={imageDataUrl} /> : <UploadCloud size={34} />}
        <div>
          <span>{hasImage ? "ลากรูปใหม่มาวาง หรือเลือกไฟล์เพื่อเปลี่ยนรูป" : "ลากรูปมาวาง หรือเลือกไฟล์เพื่ออัปโหลด"}</span>
          <small>รองรับ JPG, PNG, WebP · แนะนำรูปแนวนอน</small>
        </div>
        <input accept="image/*" onChange={pickFile} ref={inputRef} type="file" />
      </div>
      {hasImage || uploading ? (
        <div className="upload-file-card">
          <button aria-label="ลบรูปเมนู" onClick={onRemove} type="button"><X size={17} /></button>
          <span className="upload-file-icon"><FileImage size={20} /></span>
          <div className="upload-file-info">
            <strong>{imageName || "รูปเมนู"}</strong>
            <small>{formatFileSize(imageSize || 0)}</small>
          </div>
          <div className="upload-progress-row">
            <div className="upload-progress-track"><i style={{ width: `${displayProgress}%` }} /></div>
            <small>{displayProgress}%</small>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModifierManagementScreen({ ingredients, modifierRecipes, modifiers, products, setModifierRecipes, setModifiers }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyModifier(products));
  const [recipeDraft, setRecipeDraft] = useState({});
  const [deleteArmed, setDeleteArmed] = useState(false);
  const selected = selectedId ? modifiers.find((modifier) => modifier.id === selectedId) : null;
  const recipeEntries = Object.entries(recipeDraft).filter(([, quantity]) => Number(quantity) !== 0);

  useEffect(() => {
    if (!selected) return;
    setForm(selected);
    setRecipeDraft(Object.fromEntries(modifierRecipes.filter((recipe) => recipe.modifierId === selected.id).map((recipe) => [recipe.ingredientId, recipe.quantity])));
  }, [selectedId, selected?.price, modifierRecipes.length]);

  function openEditorFor(modifier) {
    setSelectedId(modifier.id);
    setForm(modifier);
    setRecipeDraft(Object.fromEntries(modifierRecipes.filter((recipe) => recipe.modifierId === modifier.id).map((recipe) => [recipe.ingredientId, recipe.quantity])));
    setEditorOpen(true);
    setDeleteArmed(false);
  }

  function startNewModifier() {
    setSelectedId("");
    setForm(emptyModifier(products));
    setRecipeDraft({});
    setEditorOpen(true);
    setDeleteArmed(false);
  }

  function closeEditor() {
    setSelectedId(null);
    setEditorOpen(false);
    setDeleteArmed(false);
  }

  function toggleProduct(productId) {
    setDeleteArmed(false);
    setForm((current) => {
      const currentIds = current.productIds || [];
      return {
        ...current,
        productIds: currentIds.includes(productId)
          ? currentIds.filter((id) => id !== productId)
          : [...currentIds, productId],
      };
    });
  }

  function addModifierRecipeLine() {
    const nextIngredient = ingredients.find((ingredient) => !recipeDraft[ingredient.id]);
    if (!nextIngredient) return;
    setRecipeDraft((current) => ({ ...current, [nextIngredient.id]: 1 }));
  }

  function updateModifierRecipeIngredient(fromIngredientId, toIngredientId) {
    if (!toIngredientId || fromIngredientId === toIngredientId) return;
    setRecipeDraft((current) => {
      const next = { ...current };
      const quantity = next[fromIngredientId] || 1;
      delete next[fromIngredientId];
      next[toIngredientId] = quantity;
      return next;
    });
  }

  function saveModifier(event) {
    event.preventDefault();
    const next = {
      ...form,
      id: form.id || `mod_${Date.now()}`,
      label: form.label.trim(),
      price: Number(form.price || 0),
      productIds: form.productIds?.length ? form.productIds : products.map((product) => product.id),
    };
    if (!next.label) return;
    setModifiers((current) => {
      const exists = current.some((modifier) => modifier.id === next.id);
      return exists ? current.map((modifier) => (modifier.id === next.id ? next : modifier)) : [...current, next];
    });
    setModifierRecipes((current) => [
      ...current.filter((recipe) => recipe.modifierId !== next.id),
      ...recipeEntries.map(([ingredientId, quantity]) => ({ modifierId: next.id, ingredientId, quantity: Number(quantity) })),
    ]);
    closeEditor();
  }

  function removeModifier() {
    if (!selected) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setModifiers((current) => current.filter((modifier) => modifier.id !== selected.id));
    setModifierRecipes((current) => current.filter((recipe) => recipe.modifierId !== selected.id));
    closeEditor();
  }

  return (
    <section className={`management-layout ${editorOpen ? "" : "is-single"}`}>
      <div className="work-panel">
        <div className="toolbar management-toolbar">
          <button className="new-record-button toolbar-add-button" onClick={startNewModifier} type="button">
            <Plus size={20} />
            เพิ่มตัวเลือกเสริม
          </button>
        </div>
        <div className="modifier-admin-grid">
          {modifiers.map((modifier) => (
            <button
              className={`modifier-admin-card ${selectedId === modifier.id ? "is-active" : ""}`}
              key={modifier.id}
              onClick={() => {
                if (editorOpen && selectedId === modifier.id) closeEditor();
                else openEditorFor(modifier);
              }}
              type="button"
            >
              <strong>{modifier.label}</strong>
              <span>{modifier.price ? `+${money(modifier.price)} บาท` : "ไม่คิดเงิน"}</span>
              <small>ใช้กับ {modifier.productIds?.length || 0} เมนู</small>
            </button>
          ))}
        </div>
      </div>
      {editorOpen ? (
        <form className="side-editor" onSubmit={saveModifier}>
          <div className="panel-title">
            <SlidersHorizontal size={20} />
            <h3>ตั้งค่าตัวเลือกเสริม</h3>
            <button className="icon-close-button" onClick={closeEditor} type="button">ปิด</button>
          </div>
          <label>ชื่อตัวเลือก<input value={form.label || ""} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, label: event.target.value })); }} /></label>
          <label>ราคาเพิ่ม<input inputMode="decimal" type="number" value={form.price ?? 0} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, price: event.target.value })); }} /></label>
          <div className="modifier-product-picker">
            <div>
              <strong>ใช้กับเมนู</strong>
              <div>
                <button onClick={() => setForm((current) => ({ ...current, productIds: products.map((product) => product.id) }))} type="button">เลือกทั้งหมด</button>
                <button onClick={() => setForm((current) => ({ ...current, productIds: [] }))} type="button">ล้างทั้งหมด</button>
              </div>
            </div>
            {products.map((product) => (
              <label className="check-line" key={product.id}>
                <input checked={(form.productIds || []).includes(product.id)} onChange={() => toggleProduct(product.id)} type="checkbox" />
                {product.name}
              </label>
            ))}
          </div>
          <div className="recipe-toggle-box">
            <strong>ผลต่อสต็อกวัตถุดิบ</strong>
            <div className="recipe-line-list">
              {recipeEntries.map(([ingredientId, quantity]) => {
                const ingredient = ingredients.find((item) => item.id === ingredientId);
                return (
                  <div className="recipe-line-row" key={ingredientId}>
                    <select value={ingredientId} onChange={(event) => updateModifierRecipeIngredient(ingredientId, event.target.value)}>
                      {ingredients.map((item) => <option disabled={Boolean(recipeDraft[item.id]) && item.id !== ingredientId} key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input
                      inputMode="decimal"
                      type="number"
                      value={quantity}
                      onChange={(event) => setRecipeDraft((current) => ({ ...current, [ingredientId]: event.target.value }))}
                      placeholder="+ / -"
                    />
                    <span>{ingredient?.unit || ""}</span>
                    <button onClick={() => setRecipeDraft((current) => {
                      const next = { ...current };
                      delete next[ingredientId];
                      return next;
                    })} type="button"><Trash2 size={16} /></button>
                  </div>
                );
              })}
              <button className="ghost-button" onClick={addModifierRecipeLine} type="button">เพิ่มผลต่อสต็อก</button>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-button" type="submit"><Save size={18} /> บันทึกตัวเลือก</button>
            {selected ? <button className={`danger-button ${deleteArmed ? "is-armed" : ""}`} onClick={removeModifier} type="button">{deleteArmed ? "ยืนยันลบ" : "ลบตัวเลือก"}</button> : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ExpenseScreen({ ingredients, onAddIngredient, onAddPurchaseUnit, onRecord, purchaseUnits, recentExpenses, setView, view }) {
  const firstIngredientId = ingredients[0]?.id || "";
  const firstIngredientName = ingredients[0]?.name || "";
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState(() => Array.from({ length: 1 }, () => blankExpenseRow(firstIngredientId, firstIngredientName)));
  const [leavingRowIds, setLeavingRowIds] = useState([]);
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const previewItems = rows.map((row) => buildExpenseItem(row, ingredients, purchaseUnits)).filter(Boolean);
  const totalAmount = previewItems.reduce((sum, item) => sum + item.lineTotal, 0);

  function updateRow(id, patch) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, blankExpenseRow(firstIngredientId, firstIngredientName)]);
  }

  function removeRow(id) {
    setRows((current) => current.filter((row) => row.id !== id));
    setLeavingRowIds((current) => current.filter((rowId) => rowId !== id));
  }

  async function submitExpenses() {
    if (!previewItems.length) {
      alert("กรุณากรอกรายการอย่างน้อย 1 รายการ");
      return;
    }
    const createdAt = new Date(`${expenseDate}T12:00:00`).toISOString();
    const expense = {
      id: `EXP-${Date.now()}`,
      expenseDate,
      createdAt,
      totalAmount,
      items: previewItems,
    };
    await onRecord(expense);
    setRows(Array.from({ length: 1 }, () => blankExpenseRow(firstIngredientId, firstIngredientName)));
  }

  function createIngredientFromExpense({ name, unit, purchaseLabel, ratio }) {
    const newIngredient = { id: `ing_${Date.now()}`, name, unit, stock: 0, minimumStock: 0 };
    onAddIngredient((current) => [...current, newIngredient]);
    if (Number.isFinite(ratio) && ratio > 0) {
      onAddPurchaseUnit((current) => [...current, { id: `unit_${Date.now()}`, ingredientId: newIngredient.id, label: purchaseLabel, ratio, baseUnit: unit }]);
    }
    setRows((current) => current.map((row, index) => (
      index === 0
        ? { ...row, mode: "ingredient", ingredientId: newIngredient.id, ingredientSearch: newIngredient.name, purchaseUnitId: "" }
        : row
    )));
    setIngredientModalOpen(false);
  }

  if (view === "history") {
    return <ExpenseHistoryPanel expenses={recentExpenses} onBack={() => setView("entry")} />;
  }

  return (
    <section className="expense-wide-layout">
      <div className="work-panel">
        <div className="expense-header">
          <div className="panel-title">
            <WalletCards size={22} />
            <div>
              <h3>บันทึกรายจ่าย</h3>
              <p>รายการซื้อวัตถุดิบและรายจ่ายทั่วไป</p>
            </div>
          </div>
          <label>
            วันที่
            <input aria-label="วันที่รายจ่าย" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
          </label>
        </div>

        <div className="expense-table">
          <div className="expense-table-head">
            <span>ประเภท</span>
            <span>รายการ</span>
            <span>หน่วยซื้อ</span>
            <span>จำนวน</span>
            <span>ราคา/หน่วย</span>
            <span>ผลต่อสต็อก</span>
            <span></span>
          </div>
          {rows.map((row, index) => (
            <ExpenseEntryRow
              ingredients={ingredients}
              isLeaving={leavingRowIds.includes(row.id)}
              key={row.id}
              onRemove={() => removeRow(row.id)}
              purchaseUnits={purchaseUnits}
              row={row}
              rowNumber={index + 1}
              updateRow={updateRow}
            />
          ))}
        </div>

        <div className="expense-actions">
          <button className="ghost-button" onClick={addRow} type="button">เพิ่มแถว</button>
          <button className="ghost-button" onClick={() => setIngredientModalOpen(true)} type="button">เพิ่มวัตถุดิบใหม่</button>
          <div className="expense-total">รวม {money(totalAmount)} บาท</div>
          <button className="primary-button expense-submit-button" onClick={submitExpenses} type="button">บันทึกทั้งหมด</button>
        </div>
      </div>
      <div className="work-panel">
        <RecentExpenses expenses={recentExpenses} />
        <div className="panel-title"><ClipboardList size={22} /><h3>รายการที่จะบันทึก</h3></div>
        <div className="table-list">
          {previewItems.length ? previewItems.map((item) => (
            <div className="table-row" key={item.id}>
              <span>{item.name}<small>{item.ingredientId ? `เพิ่ม ${money(item.stockQuantity)} ${item.baseUnit}` : "ไม่เพิ่มสต็อก"}</small></span>
              <strong>{money(item.lineTotal)} บาท</strong>
            </div>
          )) : <div className="empty-state">กรอกรายการด้านซ้ายเพื่อดูสรุป</div>}
        </div>
      </div>
      {ingredientModalOpen ? (
        <NewIngredientModal
          onClose={() => setIngredientModalOpen(false)}
          onSubmit={createIngredientFromExpense}
        />
      ) : null}
    </section>
  );
}

function ExpenseEntryRow({ ingredients, isLeaving, onRemove, purchaseUnits, row, rowNumber, updateRow }) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const selectedIngredient = ingredients.find((item) => item.id === row.ingredientId);
  const availableUnits = purchaseUnits.filter((unit) => unit.ingredientId === row.ingredientId);
  const selectedUnit = availableUnits.find((unit) => unit.id === row.purchaseUnitId) || availableUnits[0];
  const quantity = Number(row.quantity || 0);
  const stockQuantity = row.mode === "ingredient" ? quantity * Number(selectedUnit?.ratio || 1) : 0;
  const ingredientSearch = row.ingredientSearch ?? selectedIngredient?.name ?? "";
  const ingredientSuggestions = ingredients
    .filter((ingredient) => !ingredientSearch || ingredient.name.toLowerCase().includes(ingredientSearch.trim().toLowerCase()))
    .slice(0, 6);

  function selectMode(mode) {
    if (mode === "ingredient") {
      const fallback = selectedIngredient || ingredients[0];
      updateRow(row.id, {
        mode,
        ingredientId: row.ingredientId || fallback?.id || "",
        ingredientSearch: row.ingredientSearch || fallback?.name || "",
      });
      return;
    }
    updateRow(row.id, { mode: "custom" });
  }

  function updateIngredientSearch(value, forceFirstMatch = false) {
    const normalized = value.trim().toLowerCase();
    const exact = ingredients.find((ingredient) => ingredient.name.toLowerCase() === normalized);
    const firstMatch = ingredients.find((ingredient) => ingredient.name.toLowerCase().includes(normalized));
    const matched = exact || (forceFirstMatch ? firstMatch : null);
    updateRow(row.id, {
      ingredientSearch: value,
      ...(matched ? { ingredientId: matched.id, ingredientSearch: matched.name, purchaseUnitId: "" } : {}),
    });
  }

  function focusNextExpenseField(event) {
    if (event.key !== "Enter" || !event.target.matches("input, select")) return;
    event.preventDefault();
    const root = event.currentTarget.closest(".expense-table");
    const fields = Array.from(root?.querySelectorAll(".expense-entry-row input, .expense-entry-row select") || [])
      .filter((field) => !field.disabled && field.offsetParent !== null);
    const currentIndex = fields.indexOf(event.target);
    const nextField = fields[currentIndex + 1];
    if (nextField) {
      nextField.focus();
      if (nextField.select) nextField.select();
    }
  }

  return (
    <div className={`expense-entry-row ${row.mode === "custom" ? "is-custom" : ""} ${isLeaving ? "is-hidden" : ""}`} onKeyDown={focusNextExpenseField}>
      <div className="expense-mode-toggle" aria-label={`ประเภทรายจ่ายแถว ${rowNumber}`}>
        <button className={row.mode === "ingredient" ? "is-active" : ""} onClick={() => selectMode("ingredient")} type="button">วัตถุดิบ</button>
        <button className={row.mode === "custom" ? "is-active" : ""} onClick={() => selectMode("custom")} type="button">ทั่วไป</button>
      </div>
      {row.mode === "ingredient" ? (
        <label className="expense-field ingredient-combobox">
          <span className="expense-field-label">รายการ</span>
          <input
            aria-label={`วัตถุดิบแถว ${rowNumber}`}
            onBlur={(event) => {
              window.setTimeout(() => setSuggestionsOpen(false), 120);
              updateIngredientSearch(event.target.value, true);
            }}
            onChange={(event) => {
              setSuggestionsOpen(true);
              updateIngredientSearch(event.target.value);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            placeholder="พิมพ์ค้นหาวัตถุดิบ"
            value={ingredientSearch}
          />
          {suggestionsOpen && ingredientSuggestions.length ? (
            <div className="ingredient-suggestion-list">
              {ingredientSuggestions.map((ingredient) => (
                <button
                  key={ingredient.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    updateRow(row.id, { ingredientId: ingredient.id, ingredientSearch: ingredient.name, purchaseUnitId: "" });
                    setSuggestionsOpen(false);
                  }}
                  type="button"
                >
                  {ingredient.name}
                  <small>{money(ingredient.stock)} {ingredient.unit}</small>
                </button>
              ))}
            </div>
          ) : null}
        </label>
      ) : (
        <label className="expense-field ingredient-combobox">
          <span className="expense-field-label">รายการ</span>
          <input
            aria-label={`รายการทั่วไปแถว ${rowNumber}`}
            onChange={(event) => updateRow(row.id, { name: event.target.value })}
            placeholder="เช่น ถุงกระดาษ"
            value={row.name}
          />
        </label>
      )}
      {row.mode === "ingredient" ? (
        <label className="expense-field">
          <span className="expense-field-label">หน่วยซื้อ</span>
          <select
            aria-label={`หน่วยซื้อแถว ${rowNumber}`}
            disabled={!selectedIngredient}
            value={selectedUnit?.id || ""}
            onChange={(event) => updateRow(row.id, { purchaseUnitId: event.target.value })}
          >
            {availableUnits.length ? availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>1 {unit.label} = {money(unit.ratio)} {unit.baseUnit}</option>
            )) : <option value="">{selectedIngredient?.unit || "-"}</option>}
          </select>
        </label>
      ) : null}
      <label className="expense-field">
        <span className="expense-field-label">จำนวน</span>
        <input
          aria-label={`จำนวนรายจ่ายแถว ${rowNumber}`}
          inputMode="decimal"
          min="0"
          onChange={(event) => updateRow(row.id, { quantity: event.target.value })}
          placeholder="จำนวน"
          step="0.01"
          type="number"
          value={row.quantity}
        />
      </label>
      <label className="expense-field">
        <span className="expense-field-label">ราคา/หน่วย</span>
        <input
          aria-label={`ราคาต่อหน่วยแถว ${rowNumber}`}
          inputMode="decimal"
          min="0"
          onChange={(event) => updateRow(row.id, { unitPrice: event.target.value })}
          placeholder="ราคา/หน่วย"
          step="0.01"
          type="number"
          value={row.unitPrice}
        />
      </label>
      {row.mode === "ingredient" ? (
        <span className="stock-preview">
          {selectedIngredient ? `+${money(stockQuantity)} ${selectedIngredient.unit}` : "เลือกวัตถุดิบ"}
        </span>
      ) : (
        <label className="expense-field">
          <span className="expense-field-label">หมายเหตุ</span>
          <input
            aria-label={`หมายเหตุรายจ่ายแถว ${rowNumber}`}
            onChange={(event) => updateRow(row.id, { note: event.target.value })}
            placeholder="หมายเหตุ"
            value={row.note || ""}
          />
        </label>
      )}
      <button aria-label={`ลบแถว ${rowNumber}`} onClick={onRemove} type="button"><Trash2 size={16} /></button>
    </div>
  );
}

function NewIngredientModal({ onClose, onSubmit }) {
  const { backdropRef, closeWithAnimation } = useAnimeModal(onClose, modifierModalChildren);
  const [form, setForm] = useState({ name: "", unit: "ชิ้น", purchaseLabel: "แพ็ค", ratio: "1" });

  function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({
      name: form.name.trim(),
      unit: form.unit.trim() || "ชิ้น",
      purchaseLabel: form.purchaseLabel.trim() || form.unit.trim() || "ชิ้น",
      ratio: Number(form.ratio || 1),
    });
  }

  return (
    <div className="modal-backdrop anime-modal" ref={backdropRef}>
      <form className="modal-card ingredient-modal-card" onSubmit={submit}>
        <h3>เพิ่มวัตถุดิบใหม่</h3>
        <div className="modal-form-grid">
          <label>ชื่อวัตถุดิบ<input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>หน่วยหลัก<input value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} /></label>
          <label>หน่วยซื้อเริ่มต้น<input value={form.purchaseLabel} onChange={(event) => setForm((current) => ({ ...current, purchaseLabel: event.target.value }))} /></label>
          <label>1 หน่วยซื้อ เท่ากับ<input inputMode="decimal" min="0" type="number" value={form.ratio} onChange={(event) => setForm((current) => ({ ...current, ratio: event.target.value }))} /></label>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={closeWithAnimation} type="button">ยกเลิก</button>
          <button className="primary-button" type="submit">เพิ่มวัตถุดิบ</button>
        </div>
      </form>
    </div>
  );
}

function SettingsScreen({ flushPrintQueue, orders, queueLists, refreshQueues, setSettings, settings }) {
  const [activeSection, setActiveSection] = useState("printer");
  const [printerNotice, setPrinterNotice] = useState("");
  const [printerBusy, setPrinterBusy] = useState(false);
  const receiptTemplateValue = settings.receiptTemplate?.includes("[TOTAL (price*quantity)]") ? settings.receiptTemplate : defaultSettings.receiptTemplate;
  const sections = [
    { id: "printer", label: "เครื่องพิมพ์", icon: Printer },
    { id: "sync", label: "Google Sheet", icon: Database },
    { id: "orders", label: "ประวัติออร์เดอร์", icon: ReceiptText },
  ];

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateDefaultPrintOption(key, checked) {
    setSettings((current) => ({
      ...current,
      defaultPrintOptions: {
        ...(defaultSettings.defaultPrintOptions || {}),
        ...(current.defaultPrintOptions || {}),
        [key]: checked,
      },
    }));
  }

  function applyPos8390Preset() {
    setSettings((current) => ({
      ...current,
      printerModel: "POS-8390",
      printerConnection: current.printerConnection || "WIFI_LAN",
      paperSize: "80mm",
      printerPort: "9100",
      bridgeMethod: current.bridgeMethod || "POST",
      bridgeUrl: current.bridgeUrl || defaultSettings.bridgeUrl,
    }));
    setPrinterNotice("ใช้ preset POS-8390: ESC/POS, กระดาษ 80mm, port 9100");
  }

  function updateReceiptLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSettings((current) => ({
        ...current,
        receiptLogoDataUrl: String(reader.result || ""),
        receiptLogoName: file.name,
      }));
    };
    reader.readAsDataURL(file);
  }

  async function markFirstJobDone(storeName, job) {
    await updateLocalJob(storeName, { ...job, status: storeName === "printJobs" ? "PRINTED" : "SYNCED" });
    await refreshQueues();
  }

  async function runPrinterTest() {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      await sendPrintJob(makePrinterTestJob(), settings);
      setPrinterNotice("ส่งงานทดสอบไปที่เครื่องพิมพ์แล้ว");
    } catch (error) {
      setPrinterNotice(`ส่งทดสอบไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function sendPendingPrintQueue() {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      await flushPrintQueue();
      setPrinterNotice("ส่งคิวพิมพ์ค้างแล้ว ตรวจสถานะใน Print Queue");
    } catch (error) {
      setPrinterNotice(`ส่งคิวไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-section-tabs">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button className={activeSection === section.id ? "is-active" : ""} key={section.id} onClick={() => setActiveSection(section.id)} type="button">
              <Icon size={18} />
              {section.label}
            </button>
          );
        })}
      </div>
      <div className="settings-grid">
      {activeSection === "printer" ? (
      <article className="settings-card">
        <Printer size={24} />
        <h3>เครื่องพิมพ์ครัว</h3>
        <p>รองรับเครื่องพิมพ์ความร้อน 58/80mm แบบ ESC/POS ผ่าน RawBT หรือ local print bridge ในเครื่อง Android</p>
        <div className="printer-preset-card">
          <strong>POS-8390 Thermal Receipt Printer</strong>
          <span>USB + LAN + BT + WiFi · กระดาษ 80mm · ESC/POS · RAW TCP port 9100</span>
          <button className="ghost-button" onClick={applyPos8390Preset} type="button">ใช้ preset POS-8390</button>
        </div>
        <label>รุ่นเครื่องพิมพ์<input value={settings.printerModel || "POS-8390"} onChange={(event) => update("printerModel", event.target.value)} /></label>
        <label>รูปแบบการเชื่อมต่อ<select value={settings.printerConnection || "WIFI_LAN"} onChange={(event) => update("printerConnection", event.target.value)}>
          <option value="WIFI_LAN">WiFi / LAN ผ่าน IP</option>
          <option value="BLUETOOTH">Bluetooth ผ่าน RawBT</option>
          <option value="USB">USB ผ่านแอปตัวกลาง</option>
        </select></label>
        <label>RawBT / Local bridge URL<input value={settings.bridgeUrl} onChange={(event) => update("bridgeUrl", event.target.value)} /></label>
        <label>วิธีส่งข้อมูล<select value={settings.bridgeMethod || "POST"} onChange={(event) => update("bridgeMethod", event.target.value)}><option value="POST">POST text/plain</option><option value="GET">GET query data=</option></select></label>
        <label>IP เครื่องพิมพ์ Wi-Fi<input value={settings.printerIp} onChange={(event) => update("printerIp", event.target.value)} /></label>
        <label>Port เครื่องพิมพ์<input inputMode="numeric" value={settings.printerPort || "9100"} onChange={(event) => update("printerPort", event.target.value)} /></label>
        <label>ขนาดกระดาษ<select value={settings.paperSize} onChange={(event) => update("paperSize", event.target.value)}><option value="80mm">80mm</option><option value="58mm">58mm</option></select></label>
        <label className="check-line"><input checked={settings.buzzerEnabled} onChange={(event) => update("buzzerEnabled", event.target.checked)} type="checkbox" /> เปิด Kitchen Buzzer</label>
        <div className="printer-help-box">
          <strong>หมายเหตุสำหรับรุ่น POS-8390</strong>
          <p>เลข 8390-V3.2 ในคู่มือมีแนวโน้มเป็นเวอร์ชันคู่มือ/เฟิร์มแวร์/แพ็กเกจ ไม่ใช่เลข IP หรือ port ของเครื่องพิมพ์</p>
          <a href="http://www.barcoderead.net/printer/8390.zip" rel="noreferrer" target="_blank">ดาวน์โหลด driver / utility จากคู่มือ</a>
        </div>
        <div className="settings-printer-actions">
          <button className="primary-button" disabled={printerBusy} onClick={runPrinterTest} type="button"><Printer size={18} /> ทดสอบพิมพ์</button>
          <button className="ghost-button" disabled={printerBusy} onClick={sendPendingPrintQueue} type="button"><RefreshCw size={18} /> ส่งคิวค้าง</button>
        </div>
        {printerNotice ? <div className="inline-confirm">{printerNotice}</div> : null}
        <div className="settings-subsection">
          <strong>ค่าเริ่มต้นการพิมพ์ตอนปิดออเดอร์</strong>
          <p>เลือกไว้ตรงนี้แทนการโชว์ตัวเลือกในตะกร้า เพื่อให้หน้าขายโล่งและกดชำระเงินได้เร็วขึ้น</p>
          <label className="check-line"><input checked={settings.defaultPrintOptions?.kitchen !== false} onChange={(event) => updateDefaultPrintOption("kitchen", event.target.checked)} type="checkbox" /> พิมพ์ใบครัวอัตโนมัติ</label>
          <label className="check-line"><input checked={settings.defaultPrintOptions?.receipt === true} onChange={(event) => updateDefaultPrintOption("receipt", event.target.checked)} type="checkbox" /> พิมพ์ใบเสร็จอัตโนมัติ</label>
        </div>
      </article>
      ) : null}
      {activeSection === "sync" ? (
      <article className="settings-card">
        <Database size={24} />
        <h3>Google Sheet Sync</h3>
        <p>Sheet ใช้เป็นสำเนา/รายงาน ไม่ใช่ฐานหลักของ POS</p>
        <label>Sheet ID<input value={settings.sheetId} onChange={(event) => update("sheetId", event.target.value)} /></label>
        <div className="queue-line"><RefreshCw size={18} /> รอ sync {queueLists.sheet.filter((job) => job.status !== "SYNCED").length} รายการ</div>
        <QueueList jobs={queueLists.sheet} onDone={(job) => markFirstJobDone("sheetSyncJobs", job)} />
      </article>
      ) : null}
      {activeSection === "printer" ? (
      <>
      <article className="settings-card">
        <ClipboardList size={24} />
        <h3>Template ใบครัว</h3>
        <textarea value={settings.kitchenTemplate} onChange={(event) => update("kitchenTemplate", event.target.value)} />
        <h3>Template ใบเสร็จ</h3>
        <label className="receipt-logo-control">
          โลโก้ใบเสร็จ
          <input accept="image/*" onChange={updateReceiptLogo} type="file" />
        </label>
        {settings.receiptLogoDataUrl ? (
          <div className="receipt-logo-preview">
            <img alt="โลโก้ใบเสร็จ" src={settings.receiptLogoDataUrl} />
            <span>{settings.receiptLogoName || "โลโก้ใบเสร็จ"}</span>
            <button onClick={() => setSettings((current) => ({ ...current, receiptLogoDataUrl: "", receiptLogoName: "" }))} type="button">ลบโลโก้</button>
          </div>
        ) : null}
        <textarea value={receiptTemplateValue} onChange={(event) => update("receiptTemplate", event.target.value)} />
      </article>
      <article className="settings-card">
        <Printer size={24} />
        <h3>Print Queue</h3>
        <QueueList jobs={queueLists.print} onDone={(job) => markFirstJobDone("printJobs", job)} />
      </article>
      </>
      ) : null}
      {activeSection === "orders" ? (
      <article className="settings-card settings-card-wide">
        <ReceiptText size={24} />
        <h3>ประวัติออเดอร์ล่าสุด</h3>
        <div className="table-list">
          {orders.slice(0, 8).map((order) => (
            <div className="table-row" key={order.id}>
              <span>{getOrderDisplayNo(order)}<small>{new Date(order.createdAt).toLocaleString("th-TH")}</small></span>
              <strong>{money(order.totalAmount)} บาท</strong>
            </div>
          ))}
        </div>
      </article>
      ) : null}
      </div>
    </section>
  );
}

function QueueList({ jobs, onDone }) {
  if (!jobs.length) return <div className="empty-compact">ยังไม่มีงานค้าง</div>;
  return (
    <div className="queue-list">
      {jobs.slice(-5).reverse().map((job) => (
        <div className="queue-item" key={job.id}>
          <span>{job.type || job.job_type}<small>{job.status}</small></span>
          <button onClick={() => onDone(job)} type="button">mark done</button>
        </div>
      ))}
    </div>
  );
}

function RecentOrders({ orders }) {
  if (!orders.length) return null;
  return (
    <section className="recent-strip">
      <h3>ออเดอร์ล่าสุด</h3>
      <div>
        {orders.slice(0, 4).map((order) => (
          <span key={order.id}>{getOrderDisplayNo(order)} · {money(order.totalAmount)} บาท</span>
        ))}
      </div>
    </section>
  );
}

function RecentExpenses({ expenses }) {
  if (!expenses.length) return null;
  return (
    <section className="recent-strip">
      <h3>รายจ่ายล่าสุด</h3>
      <div>
        {expenses.slice(0, 4).map((expense) => (
          <span key={expense.id}>{expense.id} · {money(expense.totalAmount)} บาท</span>
        ))}
      </div>
    </section>
  );
}

function ExpenseHistoryPanel({ expenses, onBack }) {
  const [selectedExpenseId, setSelectedExpenseId] = useState(expenses[0]?.id || "");
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId) || expenses[0] || null;

  useEffect(() => {
    if (!expenses.length) {
      setSelectedExpenseId("");
      return;
    }
    if (!expenses.some((expense) => expense.id === selectedExpenseId)) {
      setSelectedExpenseId(expenses[0].id);
    }
  }, [expenses, selectedExpenseId]);

  if (!expenses.length) {
    return (
      <section className="work-panel">
        <div className="panel-title">
          <ReceiptText size={22} />
          <div>
            <h3>ประวัติรายจ่าย</h3>
            <p>ยังไม่มีรายการรายจ่าย</p>
          </div>
          <button className="ghost-button" onClick={onBack} type="button">กลับไปบันทึก</button>
        </div>
        <div className="empty-state">บันทึกรายจ่ายแล้วรายการจะแสดงที่นี่</div>
      </section>
    );
  }

  return (
    <section className="history-layout">
      <div className="work-panel">
        <div className="panel-title">
          <ReceiptText size={22} />
          <div>
            <h3>ประวัติรายจ่าย</h3>
            <p>{expenses.length} ครั้งล่าสุด</p>
          </div>
          <button className="ghost-button" onClick={onBack} type="button">บันทึกรายจ่าย</button>
        </div>
        <div className="table-list">
          {expenses.map((expense) => (
            <button
              className={`table-row history-row history-button-row ${selectedExpense?.id === expense.id ? "is-active" : ""}`}
              key={expense.id}
              onClick={() => setSelectedExpenseId(expense.id)}
              type="button"
            >
              <span>
                {expense.id}
                <small>{formatExpenseDate(expense)} · {expense.items?.length || 0} รายการ</small>
              </span>
              <strong>{money(expense.totalAmount)} บาท</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="work-panel order-detail-card">
        <div className="panel-title">
          <ClipboardList size={22} />
          <div>
            <h3>{selectedExpense?.id}</h3>
            <p>{selectedExpense ? formatExpenseDate(selectedExpense) : ""}</p>
          </div>
        </div>
        <div className="order-detail-items">
          {(selectedExpense?.items || []).map((item) => (
            <div className="order-detail-item" key={item.id}>
              <span>
                {item.name}
                <small>
                  {item.mode === "ingredient"
                    ? `${money(item.purchaseQuantity)} ${item.purchaseUnit} · เพิ่ม ${money(item.stockQuantity)} ${item.baseUnit}`
                    : `${money(item.purchaseQuantity)} รายการทั่วไป`}
                  {item.note ? ` · ${item.note}` : ""}
                </small>
              </span>
              <strong>{money(item.lineTotal)} บาท</strong>
            </div>
          ))}
        </div>
        <div className="order-detail-total">
          <span>รวมรายจ่าย</span>
          <strong>{money(selectedExpense?.totalAmount || 0)} บาท</strong>
        </div>
      </div>
    </section>
  );
}

function OrderSuccessDialog({ order, onClose }) {
  return (
    <div className="modal-backdrop order-success-backdrop">
      <div className="modal-card order-success-modal">
        <div className="success-icon"><Check size={28} /></div>
        <div>
          <h3>ทำรายการสำเร็จ</h3>
          <p>{getOrderDisplayNo(order)}</p>
        </div>
        <div className="success-summary">
          <span>ยอดรวม</span>
          <strong>{money(order.totalAmount)} บาท</strong>
        </div>
        {order.paymentMethod === "CASH" ? (
          <div className="success-summary is-change">
            <span>เงินทอน</span>
            <strong>{money(order.changeDue)} บาท</strong>
          </div>
        ) : null}
        <button className="primary-button" onClick={onClose} type="button">ตกลง</button>
      </div>
    </div>
  );
}

function OrderToast({ order, onClose }) {
  return (
    <div className="order-toast">
      <Check size={20} />
      <div>
        <strong>บันทึกออเดอร์สำเร็จ</strong>
        <p>{getOrderDisplayNo(order)} รวม {money(order.totalAmount)} บาท เงินทอน {money(order.changeDue)} บาท</p>
      </div>
      <button onClick={onClose} type="button">ปิด</button>
    </div>
  );
}

function makeSaleMovements(requirements, ingredients, orderId) {
  return requirements.map((line) => {
    const ingredient = ingredients.find((item) => item.id === line.ingredientId);
    return {
      id: `MOV-${Date.now()}-${line.ingredientId}`,
      ingredientId: line.ingredientId,
      ingredientName: ingredient?.name || line.ingredientId,
      type: "SALE",
      quantityDelta: -line.quantity,
      quantityAfter: Number(ingredient?.stock || 0) - line.quantity,
      sourceId: orderId,
      createdAt: new Date().toISOString(),
    };
  });
}

function calculateShiftSummary(shift, orders, closingCash = null) {
  const shiftOrders = orders.filter((order) => order.shiftId === shift.id);
  const cashSales = shiftOrders
    .filter((order) => order.paymentMethod === "CASH")
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const transferSales = shiftOrders
    .filter((order) => order.paymentMethod === "TRANSFER")
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const expectedCash = Number(shift.openingCash || 0) + cashSales;
  const countedCash = closingCash === null || closingCash === undefined ? expectedCash : Number(closingCash || 0);
  return {
    openingCash: Number(shift.openingCash || 0),
    cashSales,
    transferSales,
    expectedCash,
    closingCash: countedCash,
    cashDifference: countedCash - expectedCash,
    orderCount: shiftOrders.length,
    totalSales: cashSales + transferSales,
  };
}

function buildDashboardData(orders, expenses, ingredients, products, shifts) {
  const totalSales = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const cashOrders = orders.filter((order) => order.paymentMethod === "CASH");
  const transferOrders = orders.filter((order) => order.paymentMethod === "TRANSFER");
  const cashSales = cashOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const transferSales = transferOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.totalAmount || 0), 0);
  const productMap = new Map(products.map((product) => [product.id, product.name]));
  const topProductMap = new Map();

  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const name = item.name || productMap.get(item.productId) || item.productId;
      const previous = topProductMap.get(name) || { name, quantity: 0, total: 0 };
      previous.quantity += Number(item.quantity || 0);
      previous.total += Number(item.quantity || 0) * Number(item.unitPrice || 0);
      topProductMap.set(name, previous);
    });
  });

  const dailyRaw = new Map();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    dailyRaw.set(key, { key, label: date.toLocaleDateString("th-TH", { day: "2-digit", month: "short" }), total: 0 });
  }
  orders.forEach((order) => {
    const key = new Date(order.createdAt).toISOString().slice(0, 10);
    if (dailyRaw.has(key)) {
      dailyRaw.get(key).total += Number(order.totalAmount || 0);
    }
  });
  const maxDaily = Math.max(1, ...Array.from(dailyRaw.values()).map((day) => day.total));
  const dailySales = Array.from(dailyRaw.values()).map((day) => ({ ...day, percent: Math.max(4, Math.round((day.total / maxDaily) * 100)) }));

  return {
    totalSales,
    orderCount: orders.length,
    averageOrder: orders.length ? totalSales / orders.length : 0,
    cashSales,
    cashOrders: cashOrders.length,
    transferSales,
    transferOrders: transferOrders.length,
    cashPercent: totalSales ? Math.round((cashSales / totalSales) * 100) : 0,
    dailySales,
    topProducts: Array.from(topProductMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    expenseTotal,
    expenseCount: expenses.reduce((sum, expense) => sum + Number(expense.items?.length || 0), 0),
    netAfterExpenses: totalSales - expenseTotal,
    lowStock: ingredients.filter((item) => Number(item.stock || 0) <= Number(item.minimumStock || 0)).slice(0, 6),
    shiftCount: shifts.length,
  };
}

function blankExpenseRow(ingredientId = "", ingredientSearch = "") {
  return {
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    mode: "ingredient",
    ingredientId,
    ingredientSearch,
    purchaseUnitId: "",
    name: "",
    note: "",
    quantity: "",
    unitPrice: "",
  };
}

function buildExpenseItem(row, ingredients, purchaseUnits) {
  const quantity = Number(row.quantity || 0);
  const unitPrice = Number(row.unitPrice || 0);
  if (!quantity && !unitPrice && !row.name.trim()) return null;
  if (row.mode === "custom") {
    if (!row.name.trim()) return null;
    return {
      id: row.id,
      mode: "custom",
      name: row.name.trim(),
      ingredientId: null,
      purchaseUnit: "",
      purchaseQuantity: quantity,
      stockQuantity: 0,
      baseUnit: "",
      unitPrice,
      note: row.note?.trim() || "",
      lineTotal: quantity * unitPrice,
    };
  }

  const ingredient = ingredients.find((item) => item.id === row.ingredientId);
  if (!ingredient) return null;
  const availableUnits = purchaseUnits.filter((unit) => unit.ingredientId === row.ingredientId);
  const selectedUnit = availableUnits.find((unit) => unit.id === row.purchaseUnitId) || availableUnits[0];
  const stockQuantity = quantity * Number(selectedUnit?.ratio || 1);
  return {
    id: row.id,
    mode: "ingredient",
    name: ingredient.name,
    ingredientId: ingredient.id,
    purchaseUnit: selectedUnit?.label || ingredient.unit,
    purchaseQuantity: quantity,
    stockQuantity,
    baseUnit: ingredient.unit,
    unitPrice,
    lineTotal: quantity * unitPrice,
  };
}

function emptyIngredient() {
  return { id: "", name: "", stock: 0, unit: "ชิ้น", minimumStock: 0 };
}

function normalizeIngredientForm(item) {
  return {
    id: item?.id || "",
    name: (item?.name || "").trim(),
    stock: Number(item?.stock || 0),
    unit: (item?.unit || "").trim(),
    minimumStock: Number(item?.minimumStock || 0),
  };
}

function emptyProduct(category = categories[0]) {
  return {
    id: "",
    name: "",
    category,
    price: 0,
    channelPrices: Object.fromEntries(salesChannels.map((channel) => [channel.id, 0])),
    channelAvailability: Object.fromEntries(salesChannels.map((channel) => [channel.id, true])),
    active: true,
    color: "bg-white",
    imageDataUrl: "",
    imageName: "",
    imageSize: 0,
  };
}

function normalizeProductForm(product) {
  return {
    id: product?.id || "",
    name: (product?.name || "").trim(),
    category: (product?.category || "").trim(),
    price: getChannelPrice(product, "store"),
    channelPrices: normalizeChannelPrices(product),
    channelAvailability: normalizeChannelAvailability(product),
    active: product?.active !== false,
    color: product?.color || "bg-white",
    imageDataUrl: product?.imageDataUrl || "",
    imageName: product?.imageName || "",
    imageSize: Number(product?.imageSize || 0),
  };
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "0 KB";
  const units = ["Bytes", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatExpenseDate(expense) {
  const dateValue = expense?.createdAt || (expense?.expenseDate ? `${expense.expenseDate}T12:00:00` : "");
  if (!dateValue) return "";
  return new Date(dateValue).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function emptyModifier(products = []) {
  return {
    id: "",
    label: "",
    price: 0,
    productIds: products.map((product) => product.id),
  };
}

function normalizeChannelPrices(product) {
  return Object.fromEntries(salesChannels.map((channel) => [channel.id, getChannelPrice(product, channel.id)]));
}

function normalizeChannelAvailability(product) {
  return Object.fromEntries(salesChannels.map((channel) => {
    const saved = product?.channelAvailability?.[channel.id];
    return [channel.id, saved === undefined ? product?.active !== false : saved !== false];
  }));
}

function isProductActiveForChannel(product, channelId) {
  return normalizeChannelAvailability(product)[channelId] !== false;
}

function normalizeModifierKey(ids = []) {
  return [...ids].sort().join("|");
}

function getSalesChannelLabel(channelId) {
  if (channelId === "store") return "ขายหน้าร้าน";
  return salesChannels.find((channel) => channel.id === channelId)?.label || "ขายหน้าร้าน";
}

function getChannelPrice(product, channelId) {
  const raw = product?.channelPrices?.[channelId];
  if (raw !== undefined && raw !== null && raw !== "") return Number(raw || 0);
  return Number(product?.price || 0);
}

function normalizeRecipeDraft(draft) {
  return Object.fromEntries(
    Object.entries(draft || {})
      .filter(([, quantity]) => Number(quantity) > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([ingredientId, quantity]) => [ingredientId, Number(quantity)]),
  );
}
