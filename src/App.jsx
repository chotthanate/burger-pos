import {
  AlertTriangle,
  Banknote,
  Bell,
  Check,
  ClipboardList,
  CreditCard,
  Database,
  Edit3,
  Minus,
  Package,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Trash2,
  Utensils,
  WalletCards,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  applyStockMovement,
  calculateCartTotal,
  canSellProduct,
  getCartRequirements,
  getMissingIngredients,
  makeOrderPayload,
  money,
} from "./lib/posLogic.js";
import { usePersistentState } from "./lib/storage.js";

const navItems = [
  { id: "pos", label: "ขาย", icon: Store },
  { id: "inventory", label: "วัตถุดิบ", icon: Package },
  { id: "menu", label: "เมนู/สูตร", icon: Utensils },
  { id: "expense", label: "รายจ่าย", icon: ReceiptText },
  { id: "settings", label: "ตั้งค่า", icon: Settings },
];

const defaultSettings = {
  bridgeUrl: "http://127.0.0.1:8080/print",
  printerIp: "192.168.1.150",
  paperSize: "80mm",
  buzzerEnabled: true,
  sheetId: "1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI",
  kitchenTemplate: "[ORDER_NO]\nรายการอาหาร: ตัวหนา\n  - ตัวเลือกเสริม: ตัวบางและเยื้อง\nหมายเหตุ\nเวลาสั่ง",
  receiptTemplate: "[ORDER_NO]\nยอดรวม\nช่องทางชำระเงิน\nเงินทอน",
};

export default function App() {
  const [activeTab, setActiveTab] = useState("pos");
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [ingredients, setIngredients] = usePersistentState("burger-pos.ingredients", seedIngredients);
  const [purchaseUnits, setPurchaseUnits] = usePersistentState("burger-pos.purchaseUnits", seedPurchaseUnits);
  const [products, setProducts] = usePersistentState("burger-pos.products", seedProducts);
  const [recipes, setRecipes] = usePersistentState("burger-pos.recipes", seedRecipes);
  const [modifiers] = usePersistentState("burger-pos.modifiers", seedModifiers);
  const [modifierRecipes] = usePersistentState("burger-pos.modifierRecipes", seedModifierRecipes);
  const [orders, setOrders] = usePersistentState("burger-pos.orders", []);
  const [expenses, setExpenses] = usePersistentState("burger-pos.expenses", []);
  const [shifts, setShifts] = usePersistentState("burger-pos.shifts", []);
  const [stockMovements, setStockMovements] = usePersistentState("burger-pos.stockMovements", []);
  const [settings, setSettings] = usePersistentState("burger-pos.settings", defaultSettings);
  const [cart, setCart] = useState([]);
  const [posView, setPosView] = useState("sale");
  const [orderNote, setOrderNote] = useState("");
  const [printOptions, setPrintOptions] = useState({ kitchen: true, receipt: false });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [modifierIds, setModifierIds] = useState([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [queueLists, setQueueLists] = useState({ print: [], sheet: [] });

  const catalog = useMemo(() => ({ recipes, modifierRecipes }), [recipes, modifierRecipes]);
  const activeProducts = useMemo(() => products.filter((product) => product.active !== false), [products]);
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
      setActiveCategory(activeProducts[0]?.category || categories[0]);
    }
  }, [activeCategory, activeProducts]);

  async function refreshQueues() {
    const [print, sheet] = await Promise.all([
      listLocalJobs("printJobs").catch(() => []),
      listLocalJobs("sheetSyncJobs").catch(() => []),
    ]);
    setQueueLists({ print, sheet });
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
  }

  function addToCart(product, selectedModifierIds) {
    const selectedModifiers = modifiers.filter((modifier) => selectedModifierIds.includes(modifier.id));
    const unitPrice = product.price + selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
    setCart((current) => [
      ...current,
      {
        key: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        product,
        quantity: 1,
        unitPrice,
        modifierIds: selectedModifierIds,
        modifiers: selectedModifiers,
        note: "",
      },
    ]);
    setSelectedProduct(null);
  }

  function changeQuantity(key, delta) {
    setCart((current) =>
      current
        .map((item) => (item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function updateCartNote(key, note) {
    setCart((current) => current.map((item) => (item.key === key ? { ...item, note } : item)));
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
      ...makeOrderPayload({ cart, total, ...payment }),
      shiftId: openShift.id,
      note: orderNote,
      printOptions,
    };
    const movements = makeSaleMovements(requirements, ingredients, order.id);

    setIngredients((current) => applyStockMovement(current, requirements, "out"));
    setOrders((current) => [order, ...current].slice(0, 200));
    setStockMovements((current) => [...movements, ...current].slice(0, 500));
    setLastOrder(order);
    setCart([]);
    setOrderNote("");
    setPaymentOpen(false);

    if (printOptions.kitchen) await addLocalJob("printJobs", { type: "KITCHEN", order });
    if (printOptions.receipt) await addLocalJob("printJobs", { type: "RECEIPT", order });
    await addLocalJob("sheetSyncJobs", { type: "ORDER", payload: order });
    await refreshQueues();
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
  }

  function closeCurrentShift(closingCash) {
    if (!openShift) return;
    if (closingCash === "" || closingCash === null || closingCash === undefined) {
      alert("กรุณาใส่เงินสดตอนปิดกะ");
      return;
    }
    const summary = calculateShiftSummary(openShift, orders, Number(closingCash || 0));
    setShifts((current) =>
      current.map((shift) =>
        shift.id === openShift.id
          ? { ...shift, closedAt: new Date().toISOString(), closingCash: Number(closingCash || 0), summary }
          : shift,
      ),
    );
    setCart([]);
    setPaymentOpen(false);
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

  const queueStats = {
    print: queueLists.print.filter((job) => job.status !== "PRINTED").length,
    sheet: queueLists.sheet.filter((job) => job.status !== "SYNCED").length,
  };

  return (
    <div className="min-h-screen bg-soft text-ink">
      <div className="app-grid">
        <aside className="nav-rail">
          <div className="brand-block">
            <div className="brand-mark">BG</div>
            <div>
              <h1>เบอร์เกอร์ POS</h1>
              <p>หน้าร้าน + สต็อก + รายจ่าย</p>
            </div>
          </div>
          <nav className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`nav-button ${activeTab === item.id ? "is-active" : ""}`}
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  type="button"
                >
                  <Icon size={22} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <StatusPanel lowStock={lowStock.length} queueStats={queueStats} />
        </aside>

        <main className="main-pane">
          <Header activeTab={activeTab} lowStock={lowStock.length} queueStats={queueStats} />
          {activeTab === "pos" ? (
            <PosScreen
              activeCategory={activeCategory}
              cart={cart}
              catalog={catalog}
              changeQuantity={changeQuantity}
              ingredients={ingredients}
              onCategory={setActiveCategory}
              onCheckout={() => setPaymentOpen(true)}
              onCloseShift={closeCurrentShift}
              onOpenShift={openNewShift}
              onProduct={openProduct}
              orderNote={orderNote}
              orders={orders}
              openShift={openShift}
              printOptions={printOptions}
              products={activeProducts}
              posView={posView}
              setOrderNote={setOrderNote}
              setPrintOptions={setPrintOptions}
              setPosView={setPosView}
              shifts={shifts}
              total={total}
              updateCartNote={updateCartNote}
            />
          ) : null}
          {activeTab === "inventory" ? (
            <InventoryScreen
              adjustStock={adjustStock}
              ingredients={ingredients}
              onAddPurchaseUnit={setPurchaseUnits}
              purchaseUnits={purchaseUnits}
              saveIngredient={saveIngredient}
            />
          ) : null}
          {activeTab === "menu" ? (
            <MenuRecipeScreen
              ingredients={ingredients}
              products={products}
              recipes={recipes}
              setProducts={setProducts}
              setRecipes={setRecipes}
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
            />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsScreen
              orders={orders}
              queueLists={queueLists}
              refreshQueues={refreshQueues}
              setSettings={setSettings}
              settings={settings}
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
          onClose={() => setSelectedProduct(null)}
          onConfirm={() => addToCart(selectedProduct, modifierIds)}
          onToggle={(id) =>
            setModifierIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
          }
          product={selectedProduct}
        />
      ) : null}

      {paymentOpen ? (
        <PaymentModal cart={cart} onClose={() => setPaymentOpen(false)} onSubmit={completeOrder} total={total} />
      ) : null}

      {lastOrder ? <OrderToast order={lastOrder} onClose={() => setLastOrder(null)} /> : null}
    </div>
  );
}

function Header({ activeTab, lowStock, queueStats }) {
  const title = {
    pos: "ขายหน้าร้าน",
    inventory: "เช็ควัตถุดิบ",
    menu: "เมนูและสูตรอาหาร",
    expense: "บันทึกรายจ่าย",
    settings: "ตั้งค่าระบบ",
  }[activeTab];
  return (
    <header className="topbar">
      <div>
        <h2>{title}</h2>
        <p>ออกแบบสำหรับ Galaxy Tab A9+, iPad, iPhone และ Android phone</p>
      </div>
      <div className="top-status">
        <span><Wifi size={16} /> Supabase พร้อมเชื่อมต่อ</span>
        <span><Database size={16} /> Sheet queue {queueStats.sheet}</span>
        <span className={lowStock ? "text-danger" : ""}><Bell size={16} /> ใกล้หมด {lowStock}</span>
      </div>
    </header>
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

function PosScreen({
  activeCategory,
  cart,
  catalog,
  changeQuantity,
  ingredients,
  onCategory,
  onCheckout,
  onCloseShift,
  onOpenShift,
  onProduct,
  orderNote,
  orders,
  openShift,
  printOptions,
  products,
  posView,
  setOrderNote,
  setPrintOptions,
  setPosView,
  shifts,
  total,
  updateCartNote,
}) {
  const productCategories = Array.from(new Set([...categories, ...products.map((product) => product.category)]));
  const visibleProducts = products.filter((product) => product.category === activeCategory);
  const currentSummary = openShift ? calculateShiftSummary(openShift, orders) : null;
  return (
    <section className="pos-screen">
      <div className="subnav-row">
        <button className={posView === "sale" ? "is-active" : ""} onClick={() => setPosView("sale")} type="button">ขายสินค้า</button>
        <button className={posView === "history" ? "is-active" : ""} onClick={() => setPosView("history")} type="button">ประวัติการขาย</button>
      </div>

      {posView === "history" ? (
        <SalesHistory orders={orders} shifts={shifts} />
      ) : (
        <div className="pos-layout">
          <section className="menu-area">
            {openShift ? (
              <ShiftStatusCard onCloseShift={onCloseShift} shift={openShift} summary={currentSummary} />
            ) : (
              <OpenShiftCard onOpenShift={onOpenShift} />
            )}
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
                    className={`product-tile ${product.color || "bg-white"} ${available ? "" : "is-disabled"}`}
                    disabled={!available}
                    key={product.id}
                    onClick={() => onProduct(product)}
                    type="button"
                  >
                    <span>{product.name}</span>
                    <strong>{money(product.price)} บาท</strong>
                    {!openShift ? <em>ต้องเปิดกะก่อนขาย</em> : !available ? <em>วัตถุดิบไม่พอ</em> : null}
                  </button>
                );
              })}
            </div>
            <RecentOrders orders={orders} />
          </section>
          <CartPanel
            cart={cart}
            changeQuantity={changeQuantity}
            disabled={!openShift}
            onCheckout={onCheckout}
            orderNote={orderNote}
            printOptions={printOptions}
            setOrderNote={setOrderNote}
            setPrintOptions={setPrintOptions}
            total={total}
            updateCartNote={updateCartNote}
          />
        </div>
      )}
    </section>
  );
}

function CartPanel({
  cart,
  changeQuantity,
  disabled,
  onCheckout,
  orderNote,
  printOptions,
  setOrderNote,
  setPrintOptions,
  total,
  updateCartNote,
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
          <div className="cart-row cart-row-full" key={item.key}>
            <div className="cart-row-head">
              <div>
                <strong>{item.product.name}</strong>
                {item.modifiers.length ? <p>{item.modifiers.map((modifier) => modifier.label).join(", ")}</p> : null}
                <span>{money(item.unitPrice)} บาท</span>
              </div>
              <div className="qty-control">
                <button onClick={() => changeQuantity(item.key, -1)} type="button"><Minus size={16} /></button>
                <b>{item.quantity}</b>
                <button onClick={() => changeQuantity(item.key, 1)} type="button"><Plus size={16} /></button>
              </div>
            </div>
            <input
              aria-label={`หมายเหตุ ${item.product.name}`}
              onChange={(event) => updateCartNote(item.key, event.target.value)}
              placeholder="หมายเหตุรายการ เช่น ไม่เผ็ด"
              value={item.note}
            />
          </div>
        )) : <div className="empty-state">แตะเมนูเพื่อเริ่มออเดอร์</div>}
      </div>
      <textarea
        aria-label="หมายเหตุทั้งออเดอร์"
        className="order-note"
        onChange={(event) => setOrderNote(event.target.value)}
        placeholder="หมายเหตุทั้งออเดอร์"
        value={orderNote}
      />
      <div className="check-row">
        <label><input checked={printOptions.kitchen} onChange={(event) => setPrintOptions((current) => ({ ...current, kitchen: event.target.checked }))} type="checkbox" /> ใบครัว</label>
        <label><input checked={printOptions.receipt} onChange={(event) => setPrintOptions((current) => ({ ...current, receipt: event.target.checked }))} type="checkbox" /> ใบเสร็จ</label>
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

function ShiftStatusCard({ onCloseShift, shift, summary }) {
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
        <button className="ghost-button" onClick={() => onCloseShift(closingCash)} type="button">
          ปิดกะ
        </button>
      </div>
    </section>
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
                {order.id}
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

function ModifierModal({ ingredients, modifierIds, modifierRecipes, modifiers, onClose, onConfirm, onToggle, product }) {
  const productModifiers = modifiers.filter((modifier) => modifier.productIds.includes(product.id));
  const selectedRecipeLines = modifierRecipes
    .filter((recipe) => modifierIds.includes(recipe.modifierId))
    .map((recipe) => ({ ingredientId: recipe.ingredientId, quantity: Math.max(0, recipe.quantity) }));
  const missing = getMissingIngredients(selectedRecipeLines, ingredients);
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
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
  const [method, setMethod] = useState("TRANSFER");
  const [cash, setCash] = useState(0);
  const change = Math.max(0, cash - total);
  return (
    <div className="modal-backdrop">
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
          {cart.map((item) => <span key={item.key}>{item.quantity}x {item.product.name}</span>)}
        </div>
        <div className="pay-total"><span>ยอดที่ต้องชำระ</span><strong>{money(total)} บาท</strong></div>
        {method === "CASH" ? (
          <>
            <div className="cash-display">{money(cash)} บาท</div>
            <div className="cash-buttons">
              {[20, 50, 100, 500, 1000].map((amount) => (
                <button key={amount} onClick={() => setCash((current) => current + amount)} type="button">+{amount}</button>
              ))}
              <button onClick={() => setCash(0)} type="button">ล้าง</button>
            </div>
            <div className="change-line">เงินทอน {money(change)} บาท</div>
          </>
        ) : <div className="transfer-ready"><Check size={20} /> เงินโอนสำเร็จได้ทันทีเมื่อกดยืนยัน</div>}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">ยกเลิก</button>
          <button
            className="primary-button"
            disabled={method === "CASH" && cash < total}
            onClick={() => onSubmit({ paymentMethod: method, cashReceived: cash })}
            type="button"
          >
            ยืนยันออเดอร์
          </button>
        </div>
      </div>
    </div>
  );
}

function InventoryScreen({ adjustStock, ingredients, onAddPurchaseUnit, purchaseUnits, saveIngredient }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(ingredients[0]?.id || "");
  const selected = ingredients.find((item) => item.id === selectedId) || ingredients[0];
  const [form, setForm] = useState(selected || emptyIngredient());
  const [adjustment, setAdjustment] = useState({ quantityDelta: "", reason: "" });
  const [unitForm, setUnitForm] = useState({ label: "แพ็ค", ratio: 1 });

  useEffect(() => {
    if (selected) setForm(selected);
  }, [selectedId, selected?.stock]);

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
    setSelectedId(next.id);
  }

  function addUnit(event) {
    event.preventDefault();
    if (!selected) return;
    onAddPurchaseUnit((current) => [
      ...current,
      {
        id: `unit_${Date.now()}`,
        ingredientId: selected.id,
        label: unitForm.label,
        ratio: Number(unitForm.ratio || 1),
        baseUnit: selected.unit,
      },
    ]);
    setUnitForm({ label: "แพ็ค", ratio: 1 });
  }

  function submitAdjustment(event) {
    event.preventDefault();
    adjustStock({ ingredientId: selected.id, ...adjustment });
    setAdjustment({ quantityDelta: "", reason: "" });
  }

  return (
    <section className="management-layout">
      <div className="work-panel">
        <div className="toolbar">
          <div className="search-box"><Search size={18} /><input placeholder="ค้นหาวัตถุดิบ" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")} type="button">ทั้งหมด</button>
          <button className={filter === "low" ? "is-active" : ""} onClick={() => setFilter("low")} type="button">ใกล้หมด</button>
          <button className={filter === "out" ? "is-active" : ""} onClick={() => setFilter("out")} type="button">หมดแล้ว</button>
        </div>
        <div className="inventory-grid">
          {rows.map((item) => {
            const low = Number(item.stock) <= Number(item.minimumStock);
            return (
              <button className={`inventory-card ${low ? "is-low" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
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
      <aside className="side-editor">
        <button
          className="new-record-button"
          onClick={() => {
            setSelectedId("");
            setForm(emptyIngredient());
          }}
          type="button"
        >
          <Plus size={20} />
          เพิ่มรายการวัตถุดิบใหม่
        </button>
        <form onSubmit={saveForm}>
          <div className="panel-title"><Edit3 size={20} /><h3>จัดการวัตถุดิบ</h3></div>
          <label>ชื่อ<input value={form.name || ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>หน่วยหลัก<input value={form.unit || ""} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} /></label>
          <label>คงเหลือ<input inputMode="decimal" type="number" value={form.stock ?? 0} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} /></label>
          <label>แจ้งเตือนเมื่อเหลือ<input inputMode="decimal" type="number" value={form.minimumStock ?? 0} onChange={(event) => setForm((current) => ({ ...current, minimumStock: event.target.value }))} /></label>
          <div className="modal-actions">
            <button className="primary-button" type="submit"><Save size={18} /> บันทึก</button>
          </div>
        </form>
        {selected ? (
          <>
            <form onSubmit={addUnit}>
              <h3>หน่วยซื้อ</h3>
              <div className="small-list">
                {purchaseUnits.filter((unit) => unit.ingredientId === selected.id).map((unit) => (
                  <div key={unit.id}>1 {unit.label} = {money(unit.ratio)} {unit.baseUnit}</div>
                ))}
              </div>
              <label>ชื่อหน่วยซื้อ<input value={unitForm.label} onChange={(event) => setUnitForm((current) => ({ ...current, label: event.target.value }))} /></label>
              <label>ตัวคูณ<input inputMode="decimal" type="number" value={unitForm.ratio} onChange={(event) => setUnitForm((current) => ({ ...current, ratio: event.target.value }))} /></label>
              <button className="ghost-button" type="submit">เพิ่มหน่วยซื้อ</button>
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
    </section>
  );
}

function MenuRecipeScreen({ ingredients, products, recipes, setProducts, setRecipes }) {
  const [selectedId, setSelectedId] = useState(products[0]?.id || "");
  const selected = products.find((product) => product.id === selectedId) || products[0];
  const [productForm, setProductForm] = useState(selected || emptyProduct());
  const [recipeDraft, setRecipeDraft] = useState({});

  useEffect(() => {
    if (!selected) return;
    setProductForm(selected);
    setRecipeDraft(Object.fromEntries(recipes.filter((recipe) => recipe.productId === selected.id).map((recipe) => [recipe.ingredientId, recipe.quantity])));
  }, [selectedId, selected?.price, recipes.length]);

  function saveProduct(event) {
    event.preventDefault();
    const next = {
      ...productForm,
      id: productForm.id || `prod_${Date.now()}`,
      price: Number(productForm.price || 0),
      active: productForm.active !== false,
    };
    setProducts((current) => {
      const exists = current.some((product) => product.id === next.id);
      return exists ? current.map((product) => (product.id === next.id ? next : product)) : [...current, next];
    });
    const nextRecipes = Object.entries(recipeDraft)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([ingredientId, quantity]) => ({ productId: next.id, ingredientId, quantity: Number(quantity) }));
    setRecipes((current) => [...current.filter((recipe) => recipe.productId !== next.id), ...nextRecipes]);
    setSelectedId(next.id);
  }

  return (
    <section className="management-layout">
      <div className="work-panel">
        <div className="product-admin-grid">
          {products.map((product) => (
            <button className={`admin-product ${selectedId === product.id ? "is-active" : ""}`} key={product.id} onClick={() => setSelectedId(product.id)} type="button">
              <strong>{product.name}</strong>
              <span>{product.category} · {money(product.price)} บาท</span>
              <em>{product.active === false ? "ปิดขาย" : "เปิดขาย"}</em>
            </button>
          ))}
        </div>
      </div>
      <form className="side-editor" onSubmit={saveProduct}>
        <div className="panel-title"><Utensils size={20} /><h3>เมนูและสูตร BOM</h3></div>
        <label>ชื่อเมนู<input value={productForm.name || ""} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>หมวด<input value={productForm.category || ""} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} /></label>
        <label>ราคา<input inputMode="decimal" type="number" value={productForm.price ?? 0} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} /></label>
        <label className="check-line"><input checked={productForm.active !== false} onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /> เปิดขาย</label>
        <h3>สูตรวัตถุดิบต่อ 1 ชิ้น</h3>
        <div className="recipe-list">
          {ingredients.map((ingredient) => (
            <label key={ingredient.id}>
              {ingredient.name} ({ingredient.unit})
              <input
                inputMode="decimal"
                min="0"
                type="number"
                value={recipeDraft[ingredient.id] || ""}
                onChange={(event) => setRecipeDraft((current) => ({ ...current, [ingredient.id]: event.target.value }))}
                placeholder="0"
              />
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={() => { setProductForm(emptyProduct()); setRecipeDraft({}); }} type="button">เพิ่มเมนูใหม่</button>
          <button className="primary-button" type="submit">บันทึกเมนู/สูตร</button>
        </div>
      </form>
    </section>
  );
}

function ExpenseScreen({ ingredients, onAddIngredient, onAddPurchaseUnit, onRecord, purchaseUnits, recentExpenses }) {
  const firstIngredientId = ingredients[0]?.id || "";
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, () => blankExpenseRow(firstIngredientId)));
  const previewItems = rows.map((row) => buildExpenseItem(row, ingredients, purchaseUnits)).filter(Boolean);
  const totalAmount = previewItems.reduce((sum, item) => sum + item.lineTotal, 0);

  function updateRow(id, patch) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRows(count = 3) {
    setRows((current) => [...current, ...Array.from({ length: count }, () => blankExpenseRow(firstIngredientId))]);
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
    setRows(Array.from({ length: 5 }, () => blankExpenseRow(firstIngredientId)));
  }

  function addNewIngredient() {
    const name = prompt("ชื่อวัตถุดิบใหม่");
    if (!name) return;
    const unit = prompt("หน่วยหลัก เช่น ชิ้น, กรัม, ml", "ชิ้น") || "ชิ้น";
    const purchaseLabel = prompt("หน่วยซื้อเริ่มต้น เช่น แพ็ค, ถุง, กิโล", "แพ็ค") || unit;
    const ratioText = prompt(`1 ${purchaseLabel} เท่ากับกี่ ${unit}`, "1") || "1";
    const ratio = Number(ratioText);
    const newIngredient = { id: `ing_${Date.now()}`, name, unit, stock: 0, minimumStock: 0 };
    onAddIngredient((current) => [...current, newIngredient]);
    if (Number.isFinite(ratio) && ratio > 0) {
      onAddPurchaseUnit((current) => [...current, { id: `unit_${Date.now()}`, ingredientId: newIngredient.id, label: purchaseLabel, ratio, baseUnit: unit }]);
    }
    setRows((current) => current.map((row, index) => (index === 0 ? { ...row, mode: "ingredient", ingredientId: newIngredient.id, purchaseUnitId: "" } : row)));
  }

  return (
    <section className="expense-wide-layout">
      <div className="work-panel">
        <div className="expense-header">
          <div className="panel-title">
            <WalletCards size={22} />
            <div>
              <h3>ลงรายจ่ายหลายรายการ</h3>
              <p>เลือกวันที่ครั้งเดียว แล้วกรอกรายการต่อเนื่องได้ทันที</p>
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
              key={row.id}
              onRemove={() => setRows((current) => current.filter((item) => item.id !== row.id))}
              purchaseUnits={purchaseUnits}
              row={row}
              rowNumber={index + 1}
              updateRow={updateRow}
            />
          ))}
        </div>

        <div className="expense-actions">
          <button className="ghost-button" onClick={() => addRows(3)} type="button">เพิ่ม 3 แถว</button>
          <button className="ghost-button" onClick={addNewIngredient} type="button">เพิ่มวัตถุดิบใหม่</button>
          <div className="expense-total">รวม {money(totalAmount)} บาท</div>
          <button className="primary-button" onClick={submitExpenses} type="button">บันทึกทั้งหมด</button>
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
    </section>
  );
}

function ExpenseEntryRow({ ingredients, onRemove, purchaseUnits, row, rowNumber, updateRow }) {
  const selectedIngredient = ingredients.find((item) => item.id === row.ingredientId);
  const availableUnits = purchaseUnits.filter((unit) => unit.ingredientId === row.ingredientId);
  const selectedUnit = availableUnits.find((unit) => unit.id === row.purchaseUnitId) || availableUnits[0];
  const quantity = Number(row.quantity || 0);
  const stockQuantity = row.mode === "ingredient" ? quantity * Number(selectedUnit?.ratio || 1) : 0;

  return (
    <div className="expense-entry-row">
      <select
        aria-label={`ประเภทรายจ่ายแถว ${rowNumber}`}
        value={row.mode}
        onChange={(event) => updateRow(row.id, { mode: event.target.value })}
      >
        <option value="ingredient">วัตถุดิบ</option>
        <option value="custom">ทั่วไป</option>
      </select>
      {row.mode === "ingredient" ? (
        <select
          aria-label={`วัตถุดิบแถว ${rowNumber}`}
          value={row.ingredientId}
          onChange={(event) => updateRow(row.id, { ingredientId: event.target.value, purchaseUnitId: "" })}
        >
          {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
        </select>
      ) : (
        <input
          aria-label={`รายการทั่วไปแถว ${rowNumber}`}
          onChange={(event) => updateRow(row.id, { name: event.target.value })}
          placeholder="เช่น ถุงกระดาษ"
          value={row.name}
        />
      )}
      <select
        aria-label={`หน่วยซื้อแถว ${rowNumber}`}
        disabled={row.mode !== "ingredient"}
        value={selectedUnit?.id || ""}
        onChange={(event) => updateRow(row.id, { purchaseUnitId: event.target.value })}
      >
        {row.mode === "ingredient" && availableUnits.length ? availableUnits.map((unit) => (
          <option key={unit.id} value={unit.id}>1 {unit.label} = {money(unit.ratio)} {unit.baseUnit}</option>
        )) : <option value="">{row.mode === "ingredient" ? selectedIngredient?.unit : "-"}</option>}
      </select>
      <input
        aria-label={`จำนวนรายจ่ายแถว ${rowNumber}`}
        inputMode="decimal"
        min="0"
        onChange={(event) => updateRow(row.id, { quantity: event.target.value })}
        placeholder="0"
        step="0.01"
        type="number"
        value={row.quantity}
      />
      <input
        aria-label={`ราคาต่อหน่วยแถว ${rowNumber}`}
        inputMode="decimal"
        min="0"
        onChange={(event) => updateRow(row.id, { unitPrice: event.target.value })}
        placeholder="0"
        step="0.01"
        type="number"
        value={row.unitPrice}
      />
      <span className="stock-preview">
        {row.mode === "ingredient" && selectedIngredient ? `+${money(stockQuantity)} ${selectedIngredient.unit}` : "ไม่เพิ่มสต็อก"}
      </span>
      <button aria-label={`ลบแถว ${rowNumber}`} onClick={onRemove} type="button"><Trash2 size={16} /></button>
    </div>
  );
}

function SettingsScreen({ orders, queueLists, refreshQueues, setSettings, settings }) {
  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function markFirstJobDone(storeName, job) {
    await updateLocalJob(storeName, { ...job, status: storeName === "printJobs" ? "PRINTED" : "SYNCED" });
    await refreshQueues();
  }

  return (
    <section className="settings-grid">
      <article className="settings-card">
        <Printer size={24} />
        <h3>เครื่องพิมพ์ครัว</h3>
        <label>RawBT / Local bridge URL<input value={settings.bridgeUrl} onChange={(event) => update("bridgeUrl", event.target.value)} /></label>
        <label>IP เครื่องพิมพ์ Wi-Fi<input value={settings.printerIp} onChange={(event) => update("printerIp", event.target.value)} /></label>
        <label>ขนาดกระดาษ<select value={settings.paperSize} onChange={(event) => update("paperSize", event.target.value)}><option value="80mm">80mm</option><option value="58mm">58mm</option></select></label>
        <label className="check-line"><input checked={settings.buzzerEnabled} onChange={(event) => update("buzzerEnabled", event.target.checked)} type="checkbox" /> เปิด Kitchen Buzzer</label>
      </article>
      <article className="settings-card">
        <Database size={24} />
        <h3>Google Sheet Sync</h3>
        <p>Sheet ใช้เป็นสำเนา/รายงาน ไม่ใช่ฐานหลักของ POS</p>
        <label>Sheet ID<input value={settings.sheetId} onChange={(event) => update("sheetId", event.target.value)} /></label>
        <div className="queue-line"><RefreshCw size={18} /> รอ sync {queueLists.sheet.filter((job) => job.status !== "SYNCED").length} รายการ</div>
        <QueueList jobs={queueLists.sheet} onDone={(job) => markFirstJobDone("sheetSyncJobs", job)} />
      </article>
      <article className="settings-card">
        <ClipboardList size={24} />
        <h3>Template ใบครัว</h3>
        <textarea value={settings.kitchenTemplate} onChange={(event) => update("kitchenTemplate", event.target.value)} />
        <h3>Template ใบเสร็จ</h3>
        <textarea value={settings.receiptTemplate} onChange={(event) => update("receiptTemplate", event.target.value)} />
      </article>
      <article className="settings-card">
        <Printer size={24} />
        <h3>Print Queue</h3>
        <QueueList jobs={queueLists.print} onDone={(job) => markFirstJobDone("printJobs", job)} />
      </article>
      <article className="settings-card settings-card-wide">
        <ReceiptText size={24} />
        <h3>ประวัติออเดอร์ล่าสุด</h3>
        <div className="table-list">
          {orders.slice(0, 8).map((order) => (
            <div className="table-row" key={order.id}>
              <span>{order.id}<small>{new Date(order.createdAt).toLocaleString("th-TH")}</small></span>
              <strong>{money(order.totalAmount)} บาท</strong>
            </div>
          ))}
        </div>
      </article>
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
          <span key={order.id}>{order.id} · {money(order.totalAmount)} บาท</span>
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

function OrderToast({ order, onClose }) {
  return (
    <div className="order-toast">
      <Check size={20} />
      <div>
        <strong>บันทึกออเดอร์สำเร็จ</strong>
        <p>{order.id} รวม {money(order.totalAmount)} บาท เงินทอน {money(order.changeDue)} บาท</p>
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

function blankExpenseRow(ingredientId = "") {
  return {
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    mode: "ingredient",
    ingredientId,
    purchaseUnitId: "",
    name: "",
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

function emptyProduct() {
  return { id: "", name: "", category: "เบอร์เกอร์", price: 0, active: true, color: "bg-white" };
}
