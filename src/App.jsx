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
import { addLocalJob, clearAllLocalJobs, clearLocalJobs, listLocalJobs, updateLocalJob } from "./lib/localQueues.js";
import { sendSheetSyncJob } from "./lib/googleSheetSync.js";
import { getOrderDisplayNo, makeNextOrderNo } from "./lib/orderFormat.js";
import {
  applyStockMovement,
  calculateCartTotal,
  canSellProduct,
  getCartRequirements,
  getMissingIngredients,
  getOrderRequirements,
  makeOrderPayload,
  money,
} from "./lib/posLogic.js";
import { makePrinterTestJob, printThaiCodePageTest, sendPrintJob, testPrintBridge } from "./lib/printBridge.js";
import { getAndroidBluetoothPrinters, isNativeThaiPrinterAvailable, openAndroidCashDrawer, printAndroidBluetoothThaiCodePageSweep, printAndroidBluetoothThaiPrototype, printAndroidThaiPrototype } from "./lib/nativeThaiPrinter.js";
import { makeShiftSummaryLineJob, makeStockEditLineJob, sendLineNotificationJob } from "./lib/lineNotifications.js";
import { BURGER_POS_SHEET_ID, SHEET_HEADERS, makeExpenseDeleteSheetJob, makeExpenseSheetJob, makeOrderSheetJob, makeOrderVoidSheetJob, makeResetSheetJob, makeShiftSheetJob, makeStockMovementSheetJob } from "./lib/sheetExport.js";
import { useSheetBackedAppState, useSupabaseAppState } from "./lib/supabaseAppState.js";
import { SUPABASE_STORE_ID } from "./lib/supabaseClient.js";
import { usePersistentState } from "./lib/storage.js";

const navItems = [
  { id: "pos", label: "ขาย", icon: Store, children: [{ id: "sales-history", label: "ประวัติขาย", tab: "pos", view: "history" }] },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "menu", label: "รายการสินค้า", icon: Utensils, children: [{ id: "categories", label: "หมวดหมู่", tab: "categories" }, { id: "modifiers", label: "จัดการตัวเลือกเสริม", tab: "modifiers" }] },
  { id: "inventory", label: "วัตถุดิบ", icon: Package },
  { id: "expense", label: "รายจ่าย", icon: ReceiptText, children: [{ id: "expense-history", label: "ประวัติรายจ่าย", tab: "expense", view: "history" }, { id: "expense-master", label: "ฐานข้อมูลรายจ่าย", tab: "expense", view: "master" }] },
  { id: "settings", label: "ตั้งค่า", icon: Settings },
  { id: "notifications", label: "แจ้งเตือน", icon: Bell },
];

const salesChannels = [
  { id: "store", label: "หน้าร้าน" },
  { id: "grab", label: "Grab" },
  { id: "lineman", label: "Lineman" },
  { id: "shopee", label: "Shopee Food" },
];

const defaultModifierGroups = [
  { id: "addon", label: "Add on" },
  { id: "spice", label: "ระดับความเผ็ด" },
  { id: "sauce", label: "ซอส" },
  { id: "other", label: "อื่นๆ" },
];
const defaultIngredientCategories = ["เนื้อสัตว์", "ขนมปัง", "ผัก", "ซอส", "เครื่องดื่ม", "อื่นๆ"];
const defaultIngredientExpenseCategory = "วัตถุดิบ";
const defaultIngredientExpenseSubcategory = "วัตถุดิบทั่วไป";
const defaultGeneralExpenseCategories = [defaultIngredientExpenseCategory, "บรรจุภัณฑ์", "ค่าสาธารณูปโภค", "ค่าซ่อมบำรุง", "ค่าเดินทาง", "ค่าใช้จ่ายอื่นๆ"];
const defaultGeneralExpenseSubcategories = [
  { id: "expense_sub_ingredient_general", category: defaultIngredientExpenseCategory, name: defaultIngredientExpenseSubcategory },
  { id: "expense_sub_ingredient_meat", category: defaultIngredientExpenseCategory, name: "เนื้อสัตว์" },
  { id: "expense_sub_ingredient_bread", category: defaultIngredientExpenseCategory, name: "ขนมปัง" },
  { id: "expense_sub_ingredient_sauce", category: defaultIngredientExpenseCategory, name: "ซอส" },
  { id: "expense_sub_packaging", category: "บรรจุภัณฑ์", name: "ถุงและบรรจุภัณฑ์" },
  { id: "expense_sub_gas", category: "ค่าสาธารณูปโภค", name: "แก๊สหุงต้ม" },
  { id: "expense_sub_utility", category: "ค่าสาธารณูปโภค", name: "ค่าน้ำและค่าไฟ" },
  { id: "expense_sub_repair", category: "ค่าซ่อมบำรุง", name: "ซ่อมอุปกรณ์" },
  { id: "expense_sub_travel", category: "ค่าเดินทาง", name: "เดินทางและขนส่ง" },
  { id: "expense_sub_other", category: "ค่าใช้จ่ายอื่นๆ", name: "ทั่วไป" },
];
const defaultGeneralExpenseItems = [
  { id: "general_gas", name: "ค่าแก๊ส", category: "ค่าสาธารณูปโภค", subcategory: "แก๊สหุงต้ม", unit: "ถัง", active: true },
  { id: "general_paper_bag", name: "ถุงกระดาษ", category: "บรรจุภัณฑ์", subcategory: "ถุงและบรรจุภัณฑ์", unit: "แพ็ค", active: true },
  { id: "general_repair", name: "ค่าซ่อม", category: "ค่าซ่อมบำรุง", subcategory: "ซ่อมอุปกรณ์", unit: "ครั้ง", active: true },
  { id: "general_travel", name: "ค่าเดินทาง", category: "ค่าเดินทาง", subcategory: "เดินทางและขนส่ง", unit: "ครั้ง", active: true },
];

const DEFAULT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbytIrKYSNwOHj6MXCvB23YXDmfE0sgt2mcCRWrd2h5zmH3OSsG6YabKmmGdFasnTxZ2hw/exec";
const legacyWebAppUrls = new Set([
  "https://script.google.com/macros/s/AKfycbwW69gre0yuX04oMcJ_6dja8gReINmlGMy7DW3_CeEzULnonMqrlc6m8eTA4lpGNSDagA/exec",
  "https://script.google.com/macros/s/AKfycbxsbToqWo3n-J41-ak5QM0XFPZq51_Afdaxs-7qnKWRjshDgpPPIawbGdpEDpTaO8CcXQ/exec",
  "https://script.google.com/macros/s/AKfycbyaHJT2m9MJNvlTQ2bf1g4SibFbh8iaadKugMV-C6B3fVDPSIUz_ZKHW-7thIJuiKXgJg/exec",
]);
const SHEET_SYNC_BATCH_SIZE = 50;

const defaultSettings = {
  printerModel: "POS-8390",
  printerConnection: "BLUETOOTH_NATIVE",
  bridgeUrl: "ws://127.0.0.1:40213/",
  printerIp: "192.168.1.150",
  printerPort: "9100",
  bluetoothPrinterAddress: "",
  bluetoothPrintTimeoutMs: 20000,
  bluetoothPrintChunkSize: 320,
  bluetoothPrintChunkDelayMs: 2,
  bluetoothPrintFinalDelayMs: 2200,
  paperSize: "80mm",
  bridgeMethod: "RAWBT_INTENT",
  thaiCodePage: "20",
  nativeThaiRenderMode: "BITMAP",
  cashDrawerEnabled: true,
  cashDrawerPin: "0",
  allowNegativeStockSales: false,
  testModeEnabled: false,
  printingPaused: false,
  buzzerEnabled: true,
  defaultPrintOptions: { kitchen: true, receipt: false, shiftSummary: true },
  sheetId: BURGER_POS_SHEET_ID,
  supabaseStoreId: SUPABASE_STORE_ID,
  sheetWebAppUrl: DEFAULT_WEB_APP_URL,
  lineWebAppUrl: DEFAULT_WEB_APP_URL,
  lineStockAlertsEnabled: true,
  lineShiftSummaryEnabled: true,
  lineStockTargetName: "LINE ส่วนตัว",
  lineShiftTargetName: "LINE กลุ่มร้าน",
  developerPin: "2025",
  kitchenTemplate: "[ORDER_NO]\nรายการอาหาร: ตัวหนา\n  - ตัวเลือกเสริม: ตัวบางและเยื้อง\nหมายเหตุ\nเวลาสั่ง",
  receiptLogoDataUrl: "",
  receiptLogoName: "",
  receiptTemplate: "ใบเสร็จรับเงิน\n[LOGO]\n--------------------------------------\nหมายเลขคำสั่งซื้อ : [ORDER_NO]\nวันและเวลา : [ORDER_DATE]\n--------------------------------------\nสินค้า                  ราคา     จำนวน            รวม\n[ITEMS]            [PRICE]  [QUANTITY]   [TOTAL (price*quantity)]\nรวม                                                  [TOTAL]",
};

const legacySheetIds = new Set(["18dF1U5pjfd4_y9KziNptiL6Mf_PjFAsxv-5CA4HgpAc"]);

function makeTestOrderNo(date = new Date()) {
  const stamp = date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/\D/g, "");
  return `TEST-${stamp || Date.now()}`;
}

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
  const [ingredientCategories, setIngredientCategories] = usePersistentState("burger-pos.ingredientCategories", defaultIngredientCategories);
  const [purchaseUnits, setPurchaseUnits] = usePersistentState("burger-pos.purchaseUnits", seedPurchaseUnits);
  const [generalExpenseCategories, setGeneralExpenseCategories] = usePersistentState("burger-pos.generalExpenseCategories", defaultGeneralExpenseCategories);
  const [generalExpenseSubcategories, setGeneralExpenseSubcategories] = usePersistentState("burger-pos.generalExpenseSubcategories", defaultGeneralExpenseSubcategories);
  const [generalExpenseItems, setGeneralExpenseItems] = usePersistentState("burger-pos.generalExpenseItems", defaultGeneralExpenseItems);
  const [products, setProducts] = usePersistentState("burger-pos.products", seedProducts);
  const [recipes, setRecipes] = usePersistentState("burger-pos.recipes", seedRecipes);
  const [modifiers, setModifiers] = usePersistentState("burger-pos.modifiers", seedModifiers);
  const [modifierGroups, setModifierGroups] = usePersistentState("burger-pos.modifierGroups", defaultModifierGroups);
  const [modifierRecipes, setModifierRecipes] = usePersistentState("burger-pos.modifierRecipes", seedModifierRecipes);
  const [orders, setOrders] = usePersistentState("burger-pos.orders", []);
  const [expenses, setExpenses] = usePersistentState("burger-pos.expenses", []);
  const [shifts, setShifts] = usePersistentState("burger-pos.shifts", []);
  const [stockMovements, setStockMovements] = usePersistentState("burger-pos.stockMovements", []);
  const [settings, setSettings] = usePersistentState("burger-pos.settings", defaultSettings);
  const resolvedSettings = useMemo(() => ({
    ...defaultSettings,
    ...settings,
    sheetId: settings.sheetId || defaultSettings.sheetId,
    sheetWebAppUrl: settings.sheetWebAppUrl || defaultSettings.sheetWebAppUrl,
    lineWebAppUrl: settings.lineWebAppUrl || defaultSettings.lineWebAppUrl,
    defaultPrintOptions: {
      ...defaultSettings.defaultPrintOptions,
      ...(settings.defaultPrintOptions || {}),
    },
  }), [settings]);
  const isTestMode = resolvedSettings.testModeEnabled === true;
  const [cart, setCart] = useState([]);
  const [posView, setPosView] = useState("sale");
  const [salesChannel, setSalesChannel] = useState("store");
  const [expenseView, setExpenseView] = useState("entry");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingCartKey, setEditingCartKey] = useState("");
  const [modifierIds, setModifierIds] = useState([]);
  const [modifierNote, setModifierNote] = useState("");
  const [modifierQuantity, setModifierQuantity] = useState(1);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [closeShiftToken, setCloseShiftToken] = useState(0);
  const [queueLists, setQueueLists] = useState({ print: [], sheet: [], line: [] });
  const [cartLeavingKeys, setCartLeavingKeys] = useState([]);

  const catalog = useMemo(() => ({ recipes, modifierRecipes }), [recipes, modifierRecipes]);
  const printOptions = resolvedSettings.defaultPrintOptions || defaultSettings.defaultPrintOptions;
  const appStateSources = useMemo(() => ({
    menuCategories: [menuCategories, setMenuCategories],
    ingredients: [ingredients, setIngredients],
    ingredientCategories: [ingredientCategories, setIngredientCategories],
    purchaseUnits: [purchaseUnits, setPurchaseUnits],
    generalExpenseCategories: [generalExpenseCategories, setGeneralExpenseCategories],
    generalExpenseSubcategories: [generalExpenseSubcategories, setGeneralExpenseSubcategories],
    generalExpenseItems: [generalExpenseItems, setGeneralExpenseItems],
    products: [products, setProducts],
    recipes: [recipes, setRecipes],
    modifiers: [modifiers, setModifiers],
    modifierGroups: [modifierGroups, setModifierGroups],
    modifierRecipes: [modifierRecipes, setModifierRecipes],
    orders: [orders, setOrders],
    expenses: [expenses, setExpenses],
    shifts: [shifts, setShifts],
    stockMovements: [stockMovements, setStockMovements],
  }), [
    expenses,
    generalExpenseCategories,
    generalExpenseItems,
    generalExpenseSubcategories,
    ingredientCategories,
    ingredients,
    menuCategories,
    modifierGroups,
    modifierRecipes,
    modifiers,
    orders,
    products,
    purchaseUnits,
    recipes,
    shifts,
    stockMovements,
  ]);
  const preferLocalSupabaseHydrate = isNativeThaiPrinterAvailable() && Boolean(
    orders.length || expenses.length || shifts.length || stockMovements.length,
  );
  const supabaseState = useSupabaseAppState(appStateSources, {
    storeId: resolvedSettings.supabaseStoreId || SUPABASE_STORE_ID,
    preferLocalOnHydrate: preferLocalSupabaseHydrate,
  });
  const sheetBackedState = useSheetBackedAppState(appStateSources, {
    enabled: !supabaseState.connected,
    sheetId: resolvedSettings.sheetId,
    webAppUrl: resolvedSettings.sheetWebAppUrl,
    storeId: resolvedSettings.supabaseStoreId || SUPABASE_STORE_ID,
  });
  const remoteState = supabaseState.connected ? supabaseState : (sheetBackedState.connected ? sheetBackedState : supabaseState);
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
    if (generalExpenseCategories.includes(defaultIngredientExpenseCategory)) return;
    setGeneralExpenseCategories((current) => current.includes(defaultIngredientExpenseCategory)
      ? current
      : [defaultIngredientExpenseCategory, ...current]);
  }, [generalExpenseCategories, setGeneralExpenseCategories]);

  useEffect(() => {
    const names = [defaultIngredientExpenseSubcategory, ...ingredientCategories].filter(Boolean);
    const missing = names.filter((name) => !generalExpenseSubcategories.some((item) => (
      item.category === defaultIngredientExpenseCategory && item.name === name
    )));
    if (!missing.length) return;
    setGeneralExpenseSubcategories((current) => [
      ...current,
      ...missing.map((name, index) => ({
        id: makeExpenseSubcategoryId(defaultIngredientExpenseCategory, name, index),
        category: defaultIngredientExpenseCategory,
        name,
      })),
    ]);
  }, [generalExpenseSubcategories, ingredientCategories, setGeneralExpenseSubcategories]);

  useEffect(() => {
    if (ingredients.every((item) => item.category && item.expenseCategory && item.expenseSubcategory)) return;
    setIngredients((current) => current.map((item) => {
      const displayCategory = item.category || inferIngredientCategory(item.name);
      return {
        ...item,
        category: displayCategory,
        expenseCategory: item.expenseCategory || defaultIngredientExpenseCategory,
        expenseSubcategory: item.expenseSubcategory || displayCategory || defaultIngredientExpenseSubcategory,
      };
    }));
  }, [ingredients, setIngredients]);

  useEffect(() => {
    if (generalExpenseItems.every((item) => item.subcategory)) return;
    setGeneralExpenseItems((current) => current.map((item) => {
      if (item.subcategory) return item;
      const fallback = generalExpenseSubcategories.find((subcategory) => subcategory.category === item.category);
      return { ...item, subcategory: fallback?.name || "ทั่วไป" };
    }));
  }, [generalExpenseItems, generalExpenseSubcategories, setGeneralExpenseItems]);

  useEffect(() => {
    if (!settings.sheetId || legacySheetIds.has(settings.sheetId)) {
      setSettings((current) => ({ ...current, sheetId: BURGER_POS_SHEET_ID }));
    }
  }, [setSettings, settings.sheetId]);

  useEffect(() => {
    if (
      !settings.sheetWebAppUrl
      || !settings.lineWebAppUrl
      || legacyWebAppUrls.has(settings.sheetWebAppUrl)
      || legacyWebAppUrls.has(settings.lineWebAppUrl)
    ) {
      setSettings((current) => ({
        ...current,
        sheetWebAppUrl: !current.sheetWebAppUrl || legacyWebAppUrls.has(current.sheetWebAppUrl)
          ? DEFAULT_WEB_APP_URL
          : current.sheetWebAppUrl,
        lineWebAppUrl: !current.lineWebAppUrl || legacyWebAppUrls.has(current.lineWebAppUrl)
          ? DEFAULT_WEB_APP_URL
          : current.lineWebAppUrl,
      }));
    }
  }, [setSettings, settings.lineWebAppUrl, settings.sheetWebAppUrl]);

  useEffect(() => {
    if (!activeProducts.some((product) => product.category === activeCategory)) {
      setActiveCategory(activeProducts[0]?.category || menuCategories[0] || categories[0]);
    }
  }, [activeCategory, activeProducts, menuCategories]);

  async function refreshQueues() {
    const [print, sheet, line] = await Promise.all([
      listLocalJobs("printJobs").catch(() => []),
      listLocalJobs("sheetSyncJobs").catch(() => []),
      listLocalJobs("lineNotifyJobs").catch(() => []),
    ]);
    setQueueLists({ print, sheet, line });
  }

  async function flushPrintQueue() {
    if (resolvedSettings.printingPaused) {
      await refreshQueues();
      return;
    }
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

  async function clearPrintQueue() {
    await clearLocalJobs("printJobs");
    await refreshQueues();
  }

  async function flushSheetQueue() {
    if (isTestMode) return;
    const jobs = await listLocalJobs("sheetSyncJobs").catch(() => []);
    const pendingJobs = jobs.filter((job) => job.status !== "SYNCED").slice(0, SHEET_SYNC_BATCH_SIZE);
    for (const job of pendingJobs) {
      try {
        await sendSheetSyncJob(job, resolvedSettings);
        await updateLocalJob("sheetSyncJobs", { ...job, status: "SYNCED", lastError: "" });
      } catch (error) {
        await updateLocalJob("sheetSyncJobs", {
          ...job,
          status: "ERROR",
          retryCount: Number(job.retryCount || 0) + 1,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await refreshQueues();
  }

  async function flushLineQueue() {
    if (isTestMode) return;
    const jobs = await listLocalJobs("lineNotifyJobs").catch(() => []);
    const pendingJobs = jobs.filter((job) => job.status !== "SENT").slice(0, 20);
    for (const job of pendingJobs) {
      try {
        await sendLineNotificationJob(job, resolvedSettings);
        await updateLocalJob("lineNotifyJobs", { ...job, status: "SENT", lastError: "" });
      } catch (error) {
        await updateLocalJob("lineNotifyJobs", {
          ...job,
          status: "ERROR",
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
    const hasEnoughStock = canSellProduct(product.id, ingredients, [], catalog);
    if (!isTestMode && !hasEnoughStock && resolvedSettings.allowNegativeStockSales !== true) return;
    const productModifiers = modifiers.filter((modifier) => modifier.productIds.includes(product.id));
    if (!productModifiers.length) {
      addToCart(product, []);
      return;
    }
    setEditingCartKey("");
    setSelectedProduct(product);
    setModifierIds([]);
    setModifierNote("");
    setModifierQuantity(1);
  }

  function closeModifierModal() {
    setSelectedProduct(null);
    setEditingCartKey("");
    setModifierIds([]);
    setModifierNote("");
    setModifierQuantity(1);
  }

  function openCartItemEditor(item) {
    if (!item?.product) return;
    preserveScrollPosition();
    setEditingCartKey(item.key);
    setSelectedProduct(item.product);
    setModifierIds([...(item.modifierIds || [])]);
    setModifierNote(item.note || "");
    setModifierQuantity(Math.max(1, Number.parseInt(item.quantity, 10) || 1));
  }

  function toggleModifierSelection(modifierId) {
    const modifier = modifiers.find((item) => item.id === modifierId);
    const group = modifier?.group || "addon";
    const allowsQuantity = modifierAllowsQuantity(modifier);
    setModifierIds((current) => {
      if (allowsQuantity) {
        return [...current, modifierId];
      }
      if (current.includes(modifierId)) {
        return current.filter((item) => item !== modifierId);
      }
      if (group !== "addon") {
        const sameGroupIds = new Set(modifiers.filter((item) => (item.group || "addon") === group).map((item) => item.id));
        return [...current.filter((item) => !sameGroupIds.has(item)), modifierId];
      }
      return [...current, modifierId];
    });
  }

  function decrementModifierSelection(modifierId) {
    setModifierIds((current) => {
      const index = current.lastIndexOf(modifierId);
      if (index < 0) return current;
      return [...current.slice(0, index), ...current.slice(index + 1)];
    });
  }

  function addToCart(product, selectedModifierIds, note = "", quantity = 1) {
    preserveScrollPosition();
    const safeQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const normalizedModifierIds = [...selectedModifierIds].sort();
    const selectedModifiers = buildSelectedModifiers(normalizedModifierIds, modifiers);
    const unitPrice = getChannelPrice(product, salesChannel) + selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
    const normalizedNote = note.trim();
    setCart((current) => {
      const existing = current.find((item) =>
        item.product.id === product.id &&
        normalizeModifierKey(item.modifierIds) === normalizeModifierKey(normalizedModifierIds) &&
        (item.note || "") === normalizedNote
      );
      if (existing) {
        return current.map((item) => (item.key === existing.key ? { ...item, quantity: item.quantity + safeQuantity } : item));
      }
      const key = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return [
        ...current,
        {
          key,
          product,
          quantity: safeQuantity,
          unitPrice,
          modifierIds: normalizedModifierIds,
          modifiers: selectedModifiers,
          note: normalizedNote,
        },
      ];
    });
    closeModifierModal();
  }

  function updateCartItem(key, product, selectedModifierIds, note = "", quantity = 1) {
    preserveScrollPosition();
    const safeQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const normalizedModifierIds = [...selectedModifierIds].sort();
    const selectedModifiers = buildSelectedModifiers(normalizedModifierIds, modifiers);
    const unitPrice = getChannelPrice(product, salesChannel) + selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
    const normalizedNote = note.trim();
    setCart((current) => current.map((item) => (item.key === key ? {
      ...item,
      product,
      quantity: safeQuantity,
      unitPrice,
      modifierIds: normalizedModifierIds,
      modifiers: selectedModifiers,
      note: normalizedNote,
    } : item)));
    closeModifierModal();
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
    if (!openShift && !isTestMode) {
      alert("กรุณาเปิดกะก่อนเริ่มขาย");
      return;
    }
    const requirements = getCartRequirements(cart, catalog);
    const missing = getMissingIngredients(requirements, ingredients);
    const allowNegativeStock = resolvedSettings.allowNegativeStockSales === true;
    if (missing.length && !allowNegativeStock && !isTestMode) {
      alert(`วัตถุดิบไม่พอ: ${missing.map((item) => item.name).join(", ")}`);
      return;
    }
    const order = {
      ...makeOrderPayload({
        cart,
        orderNo: isTestMode ? makeTestOrderNo() : makeNextOrderNo(orders),
        total,
        ...payment,
      }),
      isTest: isTestMode,
      salesChannel,
      shiftId: openShift?.id || "TEST-SHIFT",
      note: isTestMode ? "TEST MODE - not saved" : "",
      printOptions,
    };
    const movements = isTestMode ? [] : makeSaleMovements(requirements, ingredients, order.id);

    if (!isTestMode) {
      setIngredients((current) => applyStockMovement(current, requirements, "out", { allowNegative: allowNegativeStock }));
      setOrders((current) => [order, ...current].slice(0, 200));
      setStockMovements((current) => [...movements, ...current].slice(0, 500));
    }
    setLastOrder(order);
    setCart([]);
    setPaymentOpen(false);

    try {
      const shouldOpenCashDrawer = resolvedSettings.cashDrawerEnabled !== false && order.paymentMethod === "CASH";
      const openDrawerWithKitchen = shouldOpenCashDrawer && printOptions.kitchen && !printOptions.receipt;
      const openDrawerWithReceipt = shouldOpenCashDrawer && printOptions.receipt;
      if (printOptions.kitchen) await addLocalJob("printJobs", { type: "KITCHEN", order, openCashDrawer: openDrawerWithKitchen, isTest: isTestMode });
      if (printOptions.receipt) await addLocalJob("printJobs", { type: "RECEIPT", order, openCashDrawer: openDrawerWithReceipt, isTest: isTestMode });
      if (!isTestMode) await addLocalJob("sheetSyncJobs", makeOrderSheetJob(order, movements));
    } catch (error) {
      console.error("Failed to queue order follow-up jobs", error);
    }
    try {
      await refreshQueues();
    } catch (error) {
      console.error("Failed to refresh queues after order", error);
    }
    void flushPrintQueue();
    return true;
  }

  async function queueHistoricalPrint(order, type) {
    await addLocalJob("printJobs", { type, order, source: "HISTORY_REPRINT" });
    await refreshQueues();
    void flushPrintQueue();
    return true;
  }

  async function voidOrder(order, voidPayload) {
    if (!order || order.paymentStatus === "VOIDED") return false;
    if (isTestMode) {
      alert("โหมดทดสอบ: ไม่ยกเลิกออเดอร์จริง");
      return false;
    }
    const voidedAt = new Date().toISOString();
    const refundAmount = Math.max(0, Number(voidPayload.refundAmount || 0));
    const stockRestored = Boolean(voidPayload.stockRestored);
    const updatedOrder = {
      ...order,
      paymentStatus: "VOIDED",
      voidedAt,
      voidReason: voidPayload.reason || "ยกเลิกออร์เดอร์",
      voidRefundMethod: voidPayload.refundMethod || "NONE",
      voidRefundAmount: refundAmount,
      voidStockRestored: stockRestored,
      voidNote: voidPayload.note || "",
    };
    const restoreRequirements = stockRestored ? getOrderRequirements(order, catalog) : [];
    const restoreMovements = makeVoidStockMovements(restoreRequirements, ingredients, updatedOrder);

    if (restoreRequirements.length) {
      setIngredients((current) => applyStockMovement(current, restoreRequirements, "in"));
    }
    setOrders((current) => current.map((item) => (item.id === order.id ? updatedOrder : item)));
    if (restoreMovements.length) {
      setStockMovements((current) => [...restoreMovements, ...current].slice(0, 500));
    }

    await addLocalJob("sheetSyncJobs", makeOrderVoidSheetJob(updatedOrder, restoreMovements));
    await refreshQueues();
    return true;
  }

  function openNewShift(openingCash) {
    if (isTestMode) {
      alert("โหมดทดสอบ: ไม่เปิดกะจริง หน้าขายทดสอบใช้งานได้โดยไม่ต้องเปิดกะ");
      return false;
    }
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

  async function closeCurrentShift(closingCash) {
    if (!openShift) return false;
    if (isTestMode) {
      alert("โหมดทดสอบ: ไม่ปิดกะจริง");
      return false;
    }
    if (closingCash === "" || closingCash === null || closingCash === undefined) {
      alert("กรุณาใส่เงินสดตอนปิดกะ");
      return false;
    }
    const closedAt = new Date().toISOString();
    const summary = {
      ...calculateShiftSummary(openShift, orders, Number(closingCash || 0)),
      openedAt: openShift.openedAt,
      closedAt,
      shiftId: openShift.id,
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
    await addLocalJob("sheetSyncJobs", makeShiftSheetJob({ ...openShift, closedAt, closingCash: Number(closingCash || 0) }, summary));
    if (resolvedSettings.sheetWebAppUrl) void flushSheetQueue();
    if (resolvedSettings.defaultPrintOptions?.shiftSummary !== false) {
      await addLocalJob("printJobs", {
        type: "SHIFT_SUMMARY",
        shift: { ...openShift, closedAt, closingCash: Number(closingCash || 0) },
        summary,
      });
      void flushPrintQueue();
    }
    if (resolvedSettings.lineShiftSummaryEnabled) {
      await addLocalJob("lineNotifyJobs", makeShiftSummaryLineJob({ ...openShift, closedAt, closingCash: Number(closingCash || 0) }, summary));
      if (resolvedSettings.lineWebAppUrl) void flushLineQueue();
    }
    await refreshQueues();
    return { summary };
  }

  async function openCashDrawerNow() {
    try {
      await openAndroidCashDrawer(resolvedSettings);
      return true;
    } catch (error) {
      console.error("Failed to open cash drawer", error);
      alert(`เปิดลิ้นชักไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  function queueStockMovementAudit(movement, { notifyLine = true } = {}) {
    if (isTestMode) return;
    void addLocalJob("sheetSyncJobs", makeStockMovementSheetJob(movement, movement.sourceType || movement.type))
      .then(() => {
        if (resolvedSettings.sheetWebAppUrl) void flushSheetQueue();
        return refreshQueues();
      })
      .catch(() => {});
    if (notifyLine && resolvedSettings.lineStockAlertsEnabled) {
      void addLocalJob("lineNotifyJobs", makeStockEditLineJob(movement))
        .then(refreshQueues)
        .then(() => {
          if (resolvedSettings.lineWebAppUrl) void flushLineQueue();
        })
        .catch(() => {});
    }
  }

  async function recordExpense(expense) {
    if (isTestMode) {
      return { testMode: true };
    }
    const additionsByIngredient = expense.items.reduce((map, item) => {
      if (!item.ingredientId) return map;
      map.set(item.ingredientId, Number(map.get(item.ingredientId) || 0) + Number(item.stockQuantity || 0));
      return map;
    }, new Map());
    const movements = ingredients
      .map((ingredient) => {
        const additions = Number(additionsByIngredient.get(ingredient.id) || 0);
        if (!additions) return null;
        const quantityBefore = Number(ingredient.stock || 0);
        return {
          id: `MOV-${Date.now()}-${ingredient.id}`,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          type: "PURCHASE",
          sourceType: "EXPENSE",
          quantityBefore,
          quantityDelta: additions,
          quantityAfter: quantityBefore + additions,
          unit: ingredient.unit,
          sourceId: expense.id,
          reason: "บันทึกรายจ่ายซื้อวัตถุดิบ",
          createdAt: expense.createdAt,
        };
      })
      .filter(Boolean);
    setIngredients((current) =>
      current.map((ingredient) => {
        const additions = Number(additionsByIngredient.get(ingredient.id) || 0);
        if (!additions) return ingredient;
        return { ...ingredient, stock: Number(ingredient.stock || 0) + additions };
      }),
    );
    setExpenses((current) => [expense, ...current].slice(0, 200));
    setStockMovements((current) => [...movements, ...current].slice(0, 500));
    await addLocalJob("sheetSyncJobs", makeExpenseSheetJob(expense, movements));
    if (resolvedSettings.sheetWebAppUrl) void flushSheetQueue();
    await refreshQueues();
    return { testMode: false };
  }

  async function deleteExpense(expenseId) {
    if (isTestMode) {
      alert("โหมดทดสอบ: ไม่ลบรายจ่ายจริง");
      return false;
    }
    const expense = expenses.find((item) => item.id === expenseId);
    if (!expense) return false;
    const movements = (expense.items || [])
      .filter((item) => item.ingredientId && Number(item.stockQuantity || 0) > 0)
      .map((item) => {
        const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
        const quantityBefore = Number(ingredient?.stock || 0);
        const delta = -Number(item.stockQuantity || 0);
        return {
          id: `MOV-${Date.now()}-${item.ingredientId}`,
          ingredientId: item.ingredientId,
          ingredientName: ingredient?.name || item.ingredientName || item.name,
          type: "EXPENSE_DELETE",
          sourceType: "EXPENSE_DELETE",
          quantityBefore,
          quantityDelta: delta,
          quantityAfter: quantityBefore + delta,
          unit: ingredient?.unit || item.baseUnit || "",
          sourceId: expense.id,
          reason: "ลบรายจ่ายและคืนสต็อกย้อนหลัง",
          createdAt: new Date().toISOString(),
        };
      });
    setIngredients((current) =>
      current.map((ingredient) => {
        const movement = movements.find((item) => item.ingredientId === ingredient.id);
        return movement ? { ...ingredient, stock: Number(movement.quantityAfter || 0) } : ingredient;
      }),
    );
    setExpenses((current) => current.filter((item) => item.id !== expenseId));
    setStockMovements((current) => [...movements, ...current].slice(0, 500));
    await addLocalJob("sheetSyncJobs", makeExpenseDeleteSheetJob(expense, movements));
    if (resolvedSettings.sheetWebAppUrl) void flushSheetQueue();
    await refreshQueues();
    return true;
  }

  function saveIngredient(nextIngredient) {
    const existing = ingredients.find((ingredient) => ingredient.id === nextIngredient.id);
    const normalizedNext = {
      ...nextIngredient,
      stock: Number(nextIngredient.stock || 0),
      minimumStock: Number(nextIngredient.minimumStock || 0),
    };
    const movement = makeIngredientSaveMovement(existing, normalizedNext);
    setIngredients((current) => {
      const exists = current.some((ingredient) => ingredient.id === normalizedNext.id);
      return exists
        ? current.map((ingredient) => (ingredient.id === normalizedNext.id ? normalizedNext : ingredient))
        : [...current, normalizedNext];
    });
    if (movement) {
      setStockMovements((current) => [movement, ...current].slice(0, 500));
      queueStockMovementAudit(movement);
    }
  }

  function deleteIngredient(ingredientId) {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (ingredient) {
      const quantityBefore = Number(ingredient.stock || 0);
      const movement = {
        id: `MOV-${Date.now()}`,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        type: "STOCK_EDIT",
        sourceType: "INGREDIENT_DELETE",
        quantityBefore,
        quantityDelta: -quantityBefore,
        quantityAfter: 0,
        unit: ingredient.unit,
        reason: "ลบวัตถุดิบออกจากระบบ",
        sourceId: ingredient.id,
        createdAt: new Date().toISOString(),
      };
      setStockMovements((current) => [movement, ...current].slice(0, 500));
      queueStockMovementAudit(movement);
    }
    setIngredients((current) => current.filter((ingredient) => ingredient.id !== ingredientId));
    setPurchaseUnits((current) => current.filter((unit) => unit.ingredientId !== ingredientId));
    setRecipes((current) => current.filter((recipe) => recipe.ingredientId !== ingredientId));
  }

  function deleteProduct(productId) {
    setProducts((current) => current.filter((product) => product.id !== productId));
    setRecipes((current) => current.filter((recipe) => recipe.productId !== productId));
  }

  function adjustStock({ ingredientId, quantityDelta, reason }) {
    if (isTestMode) {
      alert("โหมดทดสอบ: ไม่ปรับสต็อกจริง");
      return;
    }
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient || !quantityDelta) return;
    const quantityBefore = Number(ingredient.stock || 0);
    const nextStock = Math.max(0, quantityBefore + Number(quantityDelta));
    const movement = {
      id: `MOV-${Date.now()}`,
      ingredientId,
      ingredientName: ingredient.name,
      type: "ADJUSTMENT",
      sourceType: "ADJUSTMENT",
      quantityBefore,
      quantityDelta: nextStock - quantityBefore,
      quantityAfter: nextStock,
      unit: ingredient.unit,
      reason: reason || "ปรับสต็อก manual",
      sourceId: "manual",
      createdAt: new Date().toISOString(),
    };
    setIngredients((current) =>
      current.map((item) => (item.id === ingredientId ? { ...item, stock: nextStock } : item)),
    );
    setStockMovements((current) => [movement, ...current].slice(0, 500));
    queueStockMovementAudit(movement);
  }

  async function resetOperationalData({ includeMasterData = false } = {}) {
    if (isTestMode) {
      alert("ปิดโหมดทดสอบก่อนล้างข้อมูลจริง");
      return;
    }
    const resetMode = includeMasterData ? "all" : "transactions";
    if (resolvedSettings.sheetWebAppUrl) {
      await sendSheetSyncJob(makeResetSheetJob(resetMode), resolvedSettings);
    }
    await clearAllLocalJobs();
    setOrders([]);
    setExpenses([]);
    setShifts([]);
    setStockMovements([]);
    setCart([]);
    setLastOrder(null);
    setPaymentOpen(false);
    setCloseShiftToken((token) => token + 1);

    if (includeMasterData) {
      setMenuCategories([]);
      setProducts([]);
      setRecipes([]);
      setModifiers([]);
      setModifierRecipes([]);
      setIngredients([]);
      setPurchaseUnits([]);
      setGeneralExpenseCategories([]);
      setGeneralExpenseSubcategories([]);
      setGeneralExpenseItems([]);
      setActiveCategory(categories[0]);
      setActiveTab("settings");
      return;
    }

    setIngredients((current) => current.map((ingredient) => ({ ...ingredient, stock: 0 })));
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
    line: (queueLists.line || []).filter((job) => job.status !== "SENT").length,
  };
  const notificationItems = buildNotificationItems({
    lowStock,
    queueLists,
    queueStats,
    settings: resolvedSettings,
    supabaseState: remoteState,
  });

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
          <StatusPanel
            lowStock={lowStock.length}
            notificationCount={notificationItems.length}
            onOpenInventory={() => navigateMain("inventory")}
            onOpenNotifications={() => navigateMain("notifications")}
            queueStats={queueStats}
              supabaseState={remoteState}
          />
        </aside>

        <main className="main-pane">
          <Header
            activeTab={activeTab}
            expenseView={expenseView}
            lowStock={lowStock.length}
            onOpenNav={() => setIsNavOpen(true)}
            onOpenInventory={() => navigateMain("inventory")}
            onRequestCloseShift={() => setCloseShiftToken((token) => token + 1)}
            onRequestOpenCashDrawer={openCashDrawerNow}
            openShift={openShift}
            posView={posView}
            salesChannel={salesChannel}
            setSalesChannel={setSalesChannel}
          />
          {isTestMode ? (
              <div className="test-mode-banner" data-testid="test-mode-banner" role="status">
              <AlertTriangle size={20} />
              <strong>โหมดทดสอบ</strong>
              <span>พิมพ์และเปิดลิ้นชักได้ แต่ไม่บันทึกออเดอร์ ไม่ตัดสต็อก และไม่ส่งข้อมูลจริงเข้า Google Sheet/LINE</span>
            </div>
          ) : null}
          <div className="main-scroll">
          <MobileSubnav activeTab={activeTab} expenseView={expenseView} navigateMain={navigateMain} navigateSub={navigateSub} />
          {activeTab === "notifications" ? (
            <NotificationScreen
              items={notificationItems}
              onOpenInventory={() => navigateMain("inventory")}
              onOpenSettings={() => navigateMain("settings")}
            />
          ) : null}
          {activeTab === "pos" ? (
            <PosScreen
              activeCategory={activeCategory}
              cart={cart}
              cartLeavingKeys={cartLeavingKeys}
              closeShiftToken={closeShiftToken}
              catalog={catalog}
              changeQuantity={changeQuantity}
              ingredients={ingredients}
              allowNegativeStockSales={resolvedSettings.allowNegativeStockSales === true}
              menuCategories={menuCategories}
              onCategory={setActiveCategory}
              onCheckout={() => setPaymentOpen(true)}
              onCloseShift={closeCurrentShift}
              onEditCartItem={openCartItemEditor}
              onOpenShift={openNewShift}
              onProduct={openProduct}
              onReprintOrder={queueHistoricalPrint}
              onVoidOrder={voidOrder}
              orders={orders}
              openShift={openShift}
              printOptions={printOptions}
              products={activeProducts}
              posView={posView}
              salesChannel={salesChannel}
              setPosView={setPosView}
              shifts={shifts}
              testMode={isTestMode}
              total={total}
            />
          ) : null}
          {activeTab === "dashboard" ? (
            <DashboardScreenV2
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
              expenseCategories={generalExpenseCategories}
              expenseSubcategories={generalExpenseSubcategories}
              ingredientCategories={ingredientCategories}
              ingredients={ingredients}
              onAddPurchaseUnit={setPurchaseUnits}
              purchaseUnits={purchaseUnits}
              saveIngredient={saveIngredient}
              setIngredientCategories={setIngredientCategories}
              setIngredients={setIngredients}
            />
          ) : null}
          {activeTab === "menu" ? (
            <MenuRecipeScreen
              ingredients={ingredients}
              ingredientCategories={ingredientCategories}
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
              modifierGroups={modifierGroups}
              modifierRecipes={modifierRecipes}
              modifiers={modifiers}
              products={products}
              setModifierRecipes={setModifierRecipes}
              setModifierGroups={setModifierGroups}
              setModifiers={setModifiers}
            />
          ) : null}
          {activeTab === "expense" ? (
            <ExpenseScreen
              generalExpenseCategories={generalExpenseCategories}
              generalExpenseItems={generalExpenseItems}
              generalExpenseSubcategories={generalExpenseSubcategories}
              ingredients={ingredients}
              onAddIngredient={saveIngredient}
              onAddPurchaseUnit={setPurchaseUnits}
              onDeleteExpense={deleteExpense}
              onRecord={recordExpense}
              purchaseUnits={purchaseUnits}
              recentExpenses={expenses}
              setGeneralExpenseCategories={setGeneralExpenseCategories}
              setGeneralExpenseItems={setGeneralExpenseItems}
              setGeneralExpenseSubcategories={setGeneralExpenseSubcategories}
              setIngredients={setIngredients}
              setView={setExpenseView}
              view={expenseView}
            />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsScreen
              clearPrintQueue={clearPrintQueue}
              flushLineQueue={flushLineQueue}
              flushPrintQueue={flushPrintQueue}
              flushSheetQueue={flushSheetQueue}
              orders={orders}
              queueLists={queueLists}
              refreshQueues={refreshQueues}
              onResetData={resetOperationalData}
              setSettings={setSettings}
              settings={resolvedSettings}
            />
          ) : null}
          </div>
        </main>
      </div>

      {selectedProduct ? (
        <ModifierModal
          allowMissingStock={resolvedSettings.allowNegativeStockSales === true || isTestMode}
          ingredients={ingredients}
          modifierGroups={modifierGroups}
          modifierIds={modifierIds}
          modifierRecipes={modifierRecipes}
          modifiers={modifiers}
          confirmLabel={editingCartKey ? "บันทึกการแก้ไข" : "เพิ่มลงตะกร้า"}
          onClose={closeModifierModal}
          note={modifierNote}
          onConfirm={() => {
            if (editingCartKey) {
              updateCartItem(editingCartKey, selectedProduct, modifierIds, modifierNote, modifierQuantity);
            } else {
              addToCart(selectedProduct, modifierIds, modifierNote, modifierQuantity);
            }
          }}
          onDecrement={(id) => decrementModifierSelection(id)}
          onNoteChange={setModifierNote}
          onQuantityChange={setModifierQuantity}
          onToggle={(id) => toggleModifierSelection(id)}
          product={selectedProduct}
          quantity={modifierQuantity}
        />
      ) : null}

      {paymentOpen ? (
        <PaymentModal cart={cart} onClose={() => setPaymentOpen(false)} onSubmit={completeOrder} total={total} />
      ) : null}

      {lastOrder ? <OrderSuccessDialog order={lastOrder} onClose={() => setLastOrder(null)} /> : null}
    </div>
  );
}

function Header({ activeTab, expenseView, lowStock, onOpenInventory, onOpenNav, onRequestCloseShift, onRequestOpenCashDrawer, openShift, posView, salesChannel, setSalesChannel }) {
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const title = {
    pos: posView === "history" ? "ประวัติการขาย" : "ขายหน้าร้าน",
    dashboard: "Dashboard สรุปยอดขาย",
    inventory: "เช็ควัตถุดิบ",
    menu: "รายการสินค้า",
    categories: "หมวดหมู่สินค้า",
    modifiers: "จัดการตัวเลือกเสริม",
    notifications: "แจ้งเตือนระบบ",
    expense: expenseView === "history" ? "ประวัติรายจ่าย" : expenseView === "master" ? "ฐานข้อมูลรายจ่าย" : "บันทึกรายจ่าย",
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
        <button className={lowStock ? "text-danger" : ""} onClick={onOpenInventory} type="button"><Bell size={16} /> ใกล้หมด {lowStock}</button>
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
                  void onRequestOpenCashDrawer();
                }}
                type="button"
              >
                <Banknote size={18} /> เปิดลิ้นชัก
              </button>
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
    { id: "expense-master-main", label: "ฐานข้อมูลรายจ่าย", tab: "expense", view: "master" },
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

function StatusPanel({ lowStock, notificationCount, onOpenInventory, onOpenNotifications, queueStats, supabaseState }) {
  const supabaseLabel = supabaseState?.connected ? "ซิงก์ข้อมูลกลางพร้อมใช้" : "ซิงก์ข้อมูลกลางไม่สำเร็จ";
  return (
    <section className="status-card">
      <button className={supabaseState?.connected ? "" : "text-muted"} onClick={onOpenNotifications} title={supabaseState?.lastError || ""} type="button"><Wifi size={18} /> {supabaseLabel}</button>
      <button onClick={onOpenNotifications} type="button"><Printer size={18} /> คิวพิมพ์ {queueStats.print}</button>
      <button onClick={onOpenNotifications} type="button"><Database size={18} /> คิว Google Sheet {queueStats.sheet}</button>
      <button className={notificationCount ? "text-danger" : ""} onClick={onOpenNotifications} type="button"><AlertTriangle size={18} /> แจ้งเตือน {notificationCount}</button>
      <button className={lowStock ? "text-danger" : ""} onClick={onOpenInventory} type="button"><Package size={18} /> ใกล้หมด {lowStock}</button>
    </section>
  );
}

function NotificationScreen({ items, onOpenInventory, onOpenSettings }) {
  const [dismissedIds, setDismissedIds] = useState([]);
  const [swipeState, setSwipeState] = useState({});
  const visibleItems = items.filter((item) => !dismissedIds.includes(item.id));
  const dismissItem = (id) => {
    setSwipeState((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setDismissedIds((current) => (current.includes(id) ? current : [...current, id]));
  };
  const startSwipe = (item, event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    setSwipeState((current) => ({
      ...current,
      [item.id]: { startX: touch.clientX, x: current[item.id]?.x || 0, removing: false },
    }));
  };
  const moveSwipe = (item, event) => {
    const touch = event.touches?.[0];
    const current = swipeState[item.id];
    if (!touch || !current || current.removing) return;
    const delta = Math.min(0, Math.max(-118, touch.clientX - current.startX));
    if (Math.abs(delta) > 6) event.preventDefault();
    setSwipeState((state) => ({
      ...state,
      [item.id]: { ...current, x: delta },
    }));
  };
  const endSwipe = (item) => {
    const current = swipeState[item.id];
    if (!current || current.removing) return;
    if (current.x <= -74) {
      setSwipeState((state) => ({
        ...state,
        [item.id]: { ...current, x: -132, removing: true },
      }));
      window.setTimeout(() => dismissItem(item.id), 180);
      return;
    }
    setSwipeState((state) => ({
      ...state,
      [item.id]: { ...current, x: 0, removing: false },
    }));
  };

  return (
    <section className="notification-screen work-panel">
      <div className="panel-title pinned-panel-title">
        <Bell size={22} />
        <div>
          <h3>แจ้งเตือนระบบ</h3>
          <p>รวมปัญหาที่ควรรู้ เช่น บันทึกไม่สำเร็จ คิวค้าง หรือวัตถุดิบใกล้หมด</p>
        </div>
      </div>
      {visibleItems.length ? (
        <div className="notification-list">
          {visibleItems.map((item) => (
            <article
              className={`notification-item is-${item.severity || "info"} ${swipeState[item.id]?.x < -10 ? "is-swiping" : ""} ${swipeState[item.id]?.removing ? "is-removing" : ""}`}
              key={item.id}
              style={{ "--swipe-x": `${swipeState[item.id]?.x || 0}px` }}
              onTouchStart={(event) => {
                startSwipe(item, event);
              }}
              onTouchMove={(event) => {
                moveSwipe(item, event);
              }}
              onTouchEnd={() => {
                endSwipe(item);
              }}
              onTouchCancel={() => {
                endSwipe(item);
              }}
            >
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                {item.meta ? <small>{item.meta}</small> : null}
              </div>
              {item.action === "inventory" ? <button className="ghost-button" onClick={onOpenInventory} type="button">ไปหน้าวัตถุดิบ</button> : null}
              {item.action === "settings" ? <button className="ghost-button" onClick={onOpenSettings} type="button">ไปหน้าตั้งค่า</button> : null}
              <button className="notification-dismiss" onClick={() => dismissItem(item.id)} type="button" aria-label="dismiss notification">
                <X size={18} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">ตอนนี้ยังไม่มีแจ้งเตือนสำคัญ</div>
      )}
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
  const animatedThaiChuayThaiSales = useAnimatedNumber(data.thaiChuayThaiSales, { prefersReducedMotion });
  const animatedOrderCount = useAnimatedNumber(data.orderCount, { duration: 520, prefersReducedMotion });
  const animatedCashOrders = useAnimatedNumber(data.cashOrders, { duration: 520, prefersReducedMotion });
  const animatedTransferOrders = useAnimatedNumber(data.transferOrders, { duration: 520, prefersReducedMotion });
  const animatedThaiChuayThaiOrders = useAnimatedNumber(data.thaiChuayThaiOrders, { duration: 520, prefersReducedMotion });
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
        <article className="metric-card" style={{ "--motion-index": 4 }}>
          <span>ไทยช่วยไทย</span>
          <strong>{money(animatedThaiChuayThaiSales)} บาท</strong>
          <small>{animatedThaiChuayThaiOrders} ออร์เดอร์</small>
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
              <p>เงินสด เงินโอน และไทยช่วยไทย</p>
            </div>
          </div>
          <div className="payment-donut" style={{ "--cash": `${animatedCashPercent}%`, "--transfer": `${data.transferPercent}%` }}>
            <span>{animatedCashPercent}%</span>
          </div>
          <div className="legend-list">
            <span><i className="legend-cash" /> เงินสด {money(animatedCashSales)} บาท</span>
            <span><i className="legend-transfer" /> เงินโอน {money(animatedTransferSales)} บาท</span>
            <span><i className="legend-thai-chuay-thai" /> ไทยช่วยไทย {money(animatedThaiChuayThaiSales)} บาท</span>
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

function DashboardScreenV2({ expenses, ingredients, orders, products, shifts }) {
  const todayInput = toDateInputValue(new Date());
  const currentMonthInput = toMonthInputValue(new Date());
  const [dateMode, setDateMode] = useState("today");
  const [selectedDate, setSelectedDate] = useState(todayInput);
  const [rangeStart, setRangeStart] = useState(todayInput);
  const [rangeEnd, setRangeEnd] = useState(todayInput);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthInput);
  const [comparePreviousMonth, setComparePreviousMonth] = useState(true);
  const periodSelection = useMemo(
    () => ({ mode: dateMode, selectedDate, rangeStart, rangeEnd, selectedMonth }),
    [dateMode, selectedDate, rangeStart, rangeEnd, selectedMonth],
  );
  const data = useMemo(
    () => buildDashboardData(orders, expenses, ingredients, products, shifts, { period: periodSelection, comparePreviousMonth }),
    [orders, expenses, ingredients, products, shifts, periodSelection, comparePreviousMonth],
  );
  const updateSelectedDate = (event) => setSelectedDate(event.currentTarget.value || todayInput);
  const updateRangeStart = (event) => setRangeStart(event.currentTarget.value || todayInput);
  const updateRangeEnd = (event) => setRangeEnd(event.currentTarget.value || rangeStart || todayInput);
  const updateSelectedMonth = (event) => setSelectedMonth(event.currentTarget.value || currentMonthInput);
  const prefersReducedMotion = usePrefersReducedMotion();
  const animatedTotalSales = useAnimatedNumber(data.totalSales, { prefersReducedMotion });
  const animatedAverageOrder = useAnimatedNumber(data.averageOrder, { prefersReducedMotion });
  const animatedCashSales = useAnimatedNumber(data.cashSales, { prefersReducedMotion });
  const animatedTransferSales = useAnimatedNumber(data.transferSales, { prefersReducedMotion });
  const animatedThaiChuayThaiSales = useAnimatedNumber(data.thaiChuayThaiSales, { prefersReducedMotion });
  const animatedOrderCount = useAnimatedNumber(data.orderCount, { duration: 520, prefersReducedMotion });
  const animatedCashOrders = useAnimatedNumber(data.cashOrders, { duration: 520, prefersReducedMotion });
  const animatedTransferOrders = useAnimatedNumber(data.transferOrders, { duration: 520, prefersReducedMotion });
  const animatedThaiChuayThaiOrders = useAnimatedNumber(data.thaiChuayThaiOrders, { duration: 520, prefersReducedMotion });
  const animatedCashPercent = useAnimatedNumber(data.cashPercent, { duration: 620, prefersReducedMotion });

  return (
    <section className="dashboard-screen dashboard-v2 motion-dashboard">
      <div className="dashboard-hero">
        <div>
          <p>สรุปผลประกอบการ</p>
          <h2>{data.periodLabel}</h2>
        </div>
        <div className="dashboard-filter-row">
          {[
            ["today", "วันนี้"],
            ["7days", "7 วัน"],
            ["month", "เดือนนี้"],
            ["all", "ทั้งหมด"],
          ].map(([id, label]) => (
            <button className={dateMode === id ? "is-active" : ""} data-dashboard-filter={id} key={id} onClick={() => setDateMode(id)} type="button">{label}</button>
          ))}
          <button className={dateMode === "day" ? "is-active" : ""} data-dashboard-filter="day" onClick={() => setDateMode("day")} type="button">เลือกวัน</button>
          <button className={dateMode === "range" ? "is-active" : ""} data-dashboard-filter="range" onClick={() => setDateMode("range")} type="button">ช่วงวันที่</button>
          {dateMode === "day" ? (
            <label className="dashboard-date-control">
              วันที่
              <input data-dashboard-input="day" value={selectedDate} onChange={updateSelectedDate} onInput={updateSelectedDate} type="date" />
            </label>
          ) : null}
          {dateMode === "range" ? (
            <div className="dashboard-date-range">
              <label className="dashboard-date-control">
                จาก
                <input data-dashboard-input="range-start" value={rangeStart} onChange={updateRangeStart} onInput={updateRangeStart} type="date" />
              </label>
              <label className="dashboard-date-control">
                ถึง
                <input data-dashboard-input="range-end" value={rangeEnd} onChange={updateRangeEnd} onInput={updateRangeEnd} type="date" />
              </label>
            </div>
          ) : null}
          {dateMode === "month" ? (
            <label className="dashboard-date-control">
              เดือน
              <input data-dashboard-input="month" value={selectedMonth} onChange={updateSelectedMonth} onInput={updateSelectedMonth} type="month" />
            </label>
          ) : null}
          <label className="dashboard-compare-toggle">
            <input checked={comparePreviousMonth} onChange={(event) => setComparePreviousMonth(event.target.checked)} type="checkbox" />
            เทียบเดือนก่อน
          </label>
        </div>
      </div>

      <div className="dashboard-metrics">
        <article className="metric-card metric-sales" style={{ "--motion-index": 0 }}>
          <span><WalletCards size={18} /> ยอดขายสุทธิ</span>
          <strong>{money(animatedTotalSales)} บาท</strong>
          <small>เฉลี่ย {money(animatedAverageOrder)} บาทต่อออร์เดอร์</small>
        </article>
        <article className="metric-card metric-orders" style={{ "--motion-index": 1 }}>
          <span><ReceiptText size={18} /> จำนวนออร์เดอร์</span>
          <strong>{animatedOrderCount} ออร์เดอร์</strong>
          <small>ยกเลิก {data.voidOrderCount} ออร์เดอร์</small>
        </article>
        <article className="metric-card metric-cash" style={{ "--motion-index": 2 }}>
          <span><Banknote size={18} /> เงินสด</span>
          <strong>{money(animatedCashSales)} บาท</strong>
          <small>{animatedCashOrders} ออร์เดอร์หน้าร้าน</small>
        </article>
        <article className="metric-card metric-transfer" style={{ "--motion-index": 3 }}>
          <span><CreditCard size={18} /> เงินโอน</span>
          <strong>{money(animatedTransferSales)} บาท</strong>
          <small>{animatedTransferOrders} ออร์เดอร์หน้าร้าน</small>
        </article>
        <article className="metric-card metric-transfer" style={{ "--motion-index": 4 }}>
          <span><CreditCard size={18} /> ไทยช่วยไทย</span>
          <strong>{money(animatedThaiChuayThaiSales)} บาท</strong>
          <small>{animatedThaiChuayThaiOrders} ออร์เดอร์หน้าร้าน</small>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="chart-card span-2 revenue-card" style={{ "--motion-index": 4 }}>
          <div className="panel-title">
            <BarChart3 size={22} />
            <div>
              <h3>ยอดขายรายวัน</h3>
              <p>ใช้ดูแนวโน้มรายวันและเปรียบเทียบกับช่วงที่เลือก</p>
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
              <p>เงินสด เงินโอน และไทยช่วยไทย</p>
            </div>
          </div>
          <div className="payment-donut" style={{ "--cash": `${animatedCashPercent}%`, "--transfer": `${data.transferPercent}%` }}>
            <span>{animatedCashPercent}%</span>
          </div>
          <div className="legend-list">
            <span><i className="legend-cash" /> เงินสด <strong>{money(animatedCashSales)} บาท</strong></span>
            <span><i className="legend-transfer" /> เงินโอน <strong>{money(animatedTransferSales)} บาท</strong></span>
            <span><i className="legend-thai-chuay-thai" /> ไทยช่วยไทย <strong>{money(animatedThaiChuayThaiSales)} บาท</strong></span>
          </div>
        </article>

        <article className="chart-card accent-card" style={{ "--motion-index": 6 }}>
          <div className="panel-title">
            <SlidersHorizontal size={22} />
            <div>
              <h3>เทียบเดือนก่อน</h3>
              <p>ช่วยดูว่ารอบนี้ดีขึ้นหรือลดลง</p>
            </div>
          </div>
          <div className="comparison-stack">
            <strong className={data.comparison.delta >= 0 ? "is-up" : "is-down"}>
              {data.comparison.delta >= 0 ? "+" : ""}{money(data.comparison.delta)} บาท
            </strong>
            <span>{data.comparison.percent >= 0 ? "+" : ""}{data.comparison.percent}% จากเดือนก่อน</span>
            <small>เดือนก่อน {money(data.comparison.previousTotal)} บาท</small>
          </div>
        </article>

        <article className="chart-card" style={{ "--motion-index": 7 }}>
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

        <article className="chart-card span-2 channel-card" style={{ "--motion-index": 9 }}>
          <div className="panel-title">
            <Package size={22} />
            <div>
              <h3>ยอดขายตามช่องทาง</h3>
              <p>หน้าร้านและแพลตฟอร์มเดลิเวอรี่</p>
            </div>
          </div>
          <div className="channel-sales-grid">
            {data.channelSales.map((channel) => (
              <div key={channel.id}>
                <span>{channel.label}</span>
                <strong>{money(channel.total)} บาท</strong>
                <small>{channel.orders} ออร์เดอร์</small>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function PosScreen({
  activeCategory,
  allowNegativeStockSales,
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
  onEditCartItem,
  onOpenShift,
  onProduct,
  onReprintOrder,
  onVoidOrder,
  orders,
  openShift,
  printOptions,
  products,
  posView,
  salesChannel,
  setPosView,
  shifts,
  testMode = false,
  total,
}) {
  const [shiftPanelOpen, setShiftPanelOpen] = useState(false);
  const [closedShiftSummary, setClosedShiftSummary] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const handledCloseShiftTokenRef = useRef(closeShiftToken);
  const productCategories = Array.from(new Set([...(menuCategories || categories), ...products.map((product) => product.category)]));
  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase("th-TH");
  const visibleProducts = products.filter((product) => {
    const matchesCategory = product.category === activeCategory;
    if (!normalizedProductSearch) return matchesCategory;
    return matchesCategory && product.name.toLocaleLowerCase("th-TH").includes(normalizedProductSearch);
  });
  const currentSummary = openShift ? calculateShiftSummary(openShift, orders) : null;
  const saleUnlocked = Boolean(openShift || testMode);
  useEffect(() => {
    if (
      closeShiftToken
      && closeShiftToken !== handledCloseShiftTokenRef.current
      && openShift
      && posView === "sale"
    ) {
      handledCloseShiftTokenRef.current = closeShiftToken;
      setShiftPanelOpen(true);
    }
  }, [closeShiftToken, openShift, posView]);
  async function submitCloseShift(closingCash) {
    const closed = await onCloseShift(closingCash);
    if (closed) {
      setShiftPanelOpen(false);
      setClosedShiftSummary(closed.summary);
    }
  }
  return (
    <section className={`pos-screen ${!saleUnlocked && posView === "sale" ? "is-shift-locked" : ""} ${testMode ? "is-test-mode" : ""}`}>
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
        <SalesHistoryPanel onReprintOrder={onReprintOrder} onVoidOrder={onVoidOrder} orders={orders} shifts={shifts} />
      ) : (
        <div className="pos-layout">
          <section className="menu-area">
            <div className="category-row">
              {productCategories.map((category) => (
                <button
                  className={`category-button ${activeCategory === category ? "is-active" : ""}`}
                  disabled={!saleUnlocked}
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
                const hasEnoughStock = canSellProduct(product.id, ingredients, [], catalog);
                const available = testMode || (openShift && (hasEnoughStock || allowNegativeStockSales));
                const stockBlocked = Boolean(!testMode && openShift && !hasEnoughStock);
                const stockOverride = Boolean(stockBlocked && allowNegativeStockSales);
                return (
                  <button
                    className={`product-tile ${product.imageDataUrl ? "has-image" : ""} ${product.color || "bg-white"} ${available ? "" : "is-disabled"} ${stockOverride ? "is-stock-warning" : ""}`}
                    disabled={!available}
                    key={product.id}
                    onClick={() => onProduct(product)}
                    type="button"
                  >
                    {product.imageDataUrl ? (
                      <span className="product-image-frame" aria-hidden="true">
                        <img alt="" className="product-tile-image" src={product.imageDataUrl} />
                        {stockBlocked ? <span className="product-stock-overlay">{stockOverride ? "สต็อกติดลบได้" : "วัตถุดิบไม่พอ"}</span> : null}
                      </span>
                    ) : null}
                    <div className="product-tile-footer">
                      <span className="product-tile-name">{product.name}</span>
                      <strong>{money(getChannelPrice(product, salesChannel))} บาท</strong>
                    </div>
                    {!saleUnlocked ? <em>ต้องเปิดกะก่อนขาย</em> : testMode ? <em>TEST ไม่ตัดสต็อก</em> : stockBlocked && !product.imageDataUrl ? <em>{stockOverride ? "ขายได้ สต็อกติดลบ" : "วัตถุดิบไม่พอ"}</em> : null}
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
            disabled={!saleUnlocked}
            onCheckout={onCheckout}
            onEditItem={onEditCartItem}
            printOptions={printOptions}
            total={total}
          />
        </div>
      )}

      {!saleUnlocked && posView === "sale" ? (
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
  onEditItem,
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
          <div
            className={`cart-row cart-row-full ${cartLeavingKeys.includes(item.key) ? "is-hidden" : ""}`}
            key={item.key}
            onClick={() => onEditItem?.(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditItem?.(item);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="cart-row-head">
              <div>
                <div className="cart-item-title">
                  <strong>{item.product.name}</strong>
                  <span>{money(item.unitPrice)} บาท</span>
                </div>
                {item.modifiers.length ? <p>{formatModifierSummary(item.modifiers).join(", ")}</p> : null}
                {item.note ? <p className="cart-item-note">หมายเหตุ: {item.note}</p> : null}
              </div>
              <div className="qty-control">
                <button onClick={(event) => { event.stopPropagation(); changeQuantity(item.key, -1); }} type="button"><Minus size={16} /></button>
                <b>{item.quantity}</b>
                <button onClick={(event) => { event.stopPropagation(); changeQuantity(item.key, 1); }} type="button"><Plus size={16} /></button>
              </div>
            </div>
          </div>
        )) : <div className="empty-state">แตะเมนูเพื่อเริ่มออเดอร์</div>}
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
        <span>ยอดขายสุทธิ <strong>{money(summary.netSales ?? summary.totalSales)} บาท</strong></span>
        <span>เงินสดเริ่มต้น <strong>{money(shift.openingCash)} บาท</strong></span>
        <span>เงินสด <strong>{money(summary.cashSales)} บาท</strong></span>
        <span>เงินโอน <strong>{money(summary.transferSales)} บาท</strong></span>
        <span>ไทยช่วยไทย <strong>{money(summary.thaiChuayThaiSales || 0)} บาท</strong></span>
        <span>ออเดอร์ <strong>{summary.orderCount}</strong></span>
        <span>ยกเลิก <strong>{summary.voidOrderCount || 0}</strong></span>
        <span>คืนเงินสด <strong>{money(summary.cashRefundAmount || 0)} บาท</strong></span>
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
      <div className="shift-close-secondary">
        <span>เปิดกะ <strong>{new Date(summary.openedAt || Date.now()).toLocaleString("th-TH")}</strong></span>
        <span>ปิดกะ <strong>{new Date(summary.closedAt || Date.now()).toLocaleString("th-TH")}</strong></span>
        <span>ออร์เดอร์ทั้งหมด <strong>{summary.orderCount}</strong></span>
        <span>เบอร์เกอร์ <strong>{money(summary.burgerQuantity || 0)} ชิ้น</strong></span>
        <span>BBQ <strong>{money(summary.bbqQuantity || 0)} ชิ้น</strong></span>
      </div>
      <div className="shift-close-focus">
        <span>ยอดขายสุทธิ <strong>{money(summary.netSales ?? summary.totalSales)} บาท</strong></span>
        <span>เงินสดที่นับได้ <strong>{money(summary.closingCash)} บาท</strong></span>
        <span>ส่วนต่างเงินสด <strong className={summary.cashDifference < 0 ? "text-danger" : ""}>{money(summary.cashDifference)} บาท</strong></span>
      </div>
      <div className="shift-close-secondary">
        <span>เงินสด <strong>{money(summary.cashSales)} บาท</strong></span>
        <span>เงินโอน <strong>{money(summary.transferSales)} บาท</strong></span>
        <span>ไทยช่วยไทย <strong>{money(summary.thaiChuayThaiSales || 0)} บาท</strong></span>
        <span>ออเดอร์ <strong>{summary.orderCount}</strong></span>
        <span>ยกเลิก <strong>{summary.voidOrderCount || 0}</strong></span>
      </div>
      <details className="shift-close-details">
        <summary>รายละเอียดเพิ่มเติม</summary>
        <div className="shift-metrics compact">
          <span>ยอดก่อนยกเลิก <strong>{money(summary.grossSales ?? summary.totalSales)} บาท</strong></span>
          <span>เงินสดเริ่มต้น <strong>{money(summary.openingCash)} บาท</strong></span>
          <span>เบอร์เกอร์ <strong>{money(summary.burgerQuantity || 0)} ชิ้น</strong></span>
          <span>BBQ <strong>{money(summary.bbqQuantity || 0)} ชิ้น</strong></span>
          <span>ยอดยกเลิก <strong>{money(summary.voidAmount || 0)} บาท</strong></span>
          <span>คืนเงินสด <strong>{money(summary.cashRefundAmount || 0)} บาท</strong></span>
          <span>คืนเงินโอน <strong>{money(summary.transferRefundAmount || 0)} บาท</strong></span>
          <span>เงินสดที่ควรมี <strong>{money(summary.expectedCash)} บาท</strong></span>
        </div>
      </details>
      <div className="modal-actions">
        <button className="primary-button" onClick={onClose} type="button">ออกจากสรุป</button>
      </div>
    </section>
  );
}

function SalesHistoryPanel({ onReprintOrder, onVoidOrder, orders, shifts }) {
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
          {orders.length ? orders.map((order) => {
            const isVoided = order.paymentStatus === "VOIDED";
            return (
              <button
                className={`table-row history-row history-order-button ${selectedOrder?.id === order.id ? "is-active" : ""} ${isVoided ? "is-voided" : ""}`}
                key={order.id}
                onClick={() => {
                  setSelectedOrderId(order.id);
                  setPrintNotice("");
                }}
                type="button"
              >
                <span>
                  <span className="history-order-title">
                    {getOrderDisplayNo(order)}
                    {isVoided ? <small className="void-badge">ยกเลิกแล้ว</small> : null}
                  </span>
                  <small>{new Date(order.createdAt).toLocaleString("th-TH")} · {getPaymentMethodLabel(order.paymentMethod)}</small>
                </span>
                <strong>{money(order.totalAmount)} บาท</strong>
              </button>
            );
          }) : <div className="empty-state">ยังไม่มีประวัติการขาย</div>}
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
              onVoidOrder={onVoidOrder}
              printNotice={printNotice}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OrderDetailPanel({ onClose, onReprint, onVoidOrder, order, printNotice }) {
  const isVoided = order.paymentStatus === "VOIDED";
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidNotice, setVoidNotice] = useState("");
  const [voidForm, setVoidForm] = useState({
    refundMethod: "NONE",
    refundAmount: 0,
    reason: "",
    stockRestored: true,
    confirmed: false,
  });

  useEffect(() => {
    setShowVoidForm(false);
    setVoidBusy(false);
    setVoidNotice("");
    setVoidForm({
      refundMethod: "NONE",
      refundAmount: 0,
      reason: "",
      stockRestored: true,
      confirmed: false,
    });
  }, [order.id]);

  function updateVoidRefundMethod(refundMethod) {
    setVoidForm((current) => ({
      ...current,
      refundMethod,
      refundAmount: refundMethod === "NONE" ? 0 : Number(order.totalAmount || 0),
    }));
  }

  async function submitVoidOrder(event) {
    event.preventDefault();
    if (!voidForm.confirmed || voidBusy || !onVoidOrder) return;
    setVoidBusy(true);
    setVoidNotice("");
    try {
      await onVoidOrder(order, {
        refundMethod: voidForm.refundMethod,
        refundAmount: voidForm.refundMethod === "NONE" ? 0 : Number(voidForm.refundAmount || 0),
        reason: voidForm.reason.trim() || "ยกเลิกจากประวัติการขาย",
        stockRestored: voidForm.stockRestored,
      });
      setShowVoidForm(false);
      setVoidNotice("ยกเลิกออร์เดอร์และบันทึกประวัติเรียบร้อย");
    } catch (error) {
      setVoidNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setVoidBusy(false);
    }
  }

  return (
    <div className="order-detail-panel">
      <div className="panel-title">
        <ClipboardList size={22} />
        <div>
          <h3>{getOrderDisplayNo(order)}</h3>
          <p>{new Date(order.createdAt).toLocaleString("th-TH")} · {getPaymentMethodLabel(order.paymentMethod)}</p>
        </div>
        {isVoided ? <span className="void-badge">ยกเลิกแล้ว</span> : null}
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
      ) : (
        <div className="order-detail-payment">
          <span>ชำระด้วย{getPaymentMethodLabel(order.paymentMethod)} {money(order.totalAmount)} บาท</span>
        </div>
      )}
      {isVoided ? (
        <div className="void-summary-box">
          <strong>ข้อมูลการยกเลิก</strong>
          <span>เวลา: {new Date(order.voidedAt || Date.now()).toLocaleString("th-TH")}</span>
          <span>เหตุผล: {order.voidReason || "-"}</span>
          <span>รูปแบบคืนเงิน: {formatRefundMethod(order.voidRefundMethod)} · {money(order.voidRefundAmount || 0)} บาท</span>
          <span>คืนวัตถุดิบ: {order.voidStockRestored ? "คืนเข้าสต็อกแล้ว" : "ไม่คืนเข้าสต็อก"}</span>
        </div>
      ) : null}
      {printNotice ? <div className="inline-warning">{printNotice}</div> : null}
      {voidNotice ? <div className={voidNotice.includes("เรียบร้อย") ? "inline-confirm" : "inline-warning"}>{voidNotice}</div> : null}
      {showVoidForm && !isVoided ? (
        <form className="void-order-form" onSubmit={submitVoidOrder}>
          <strong>ยกเลิกออร์เดอร์นี้</strong>
          <label>
            รูปแบบการยกเลิก/คืนเงิน
            <select value={voidForm.refundMethod} onChange={(event) => updateVoidRefundMethod(event.target.value)}>
              <option value="NONE">กดผิด / ไม่ได้รับเงินจริง - ลบยอดรับเงินออก</option>
              <option value="CASH">คืนเงินสดจากลิ้นชัก</option>
              <option value="TRANSFER">คืนเงินผ่านเงินโอน</option>
            </select>
          </label>
          <p className="void-form-hint">
            กดผิด/ไม่ได้รับเงินจริงจะลบยอดออร์เดอร์ออกจากยอดขายและยอดรับเงินตามวิธีจ่ายเดิม ส่วนคืนเงินสดจะบันทึกเงินสดออกจากลิ้นชักเพิ่ม
          </p>
          {voidForm.refundMethod !== "NONE" ? (
            <label>
              จำนวนเงินที่คืน
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) => setVoidForm((current) => ({ ...current, refundAmount: event.target.value }))}
                type="number"
                value={voidForm.refundAmount}
              />
            </label>
          ) : null}
          <label>
            เหตุผล
            <textarea
              onChange={(event) => setVoidForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="เช่น ลูกค้าขอคืนเงิน, กดผิด, พิมพ์ออร์เดอร์ผิด"
              value={voidForm.reason}
            />
          </label>
          <label className="check-line">
            <input
              checked={voidForm.stockRestored}
              onChange={(event) => setVoidForm((current) => ({ ...current, stockRestored: event.target.checked }))}
              type="checkbox"
            />
            คืนวัตถุดิบตามสูตรกลับเข้าสต็อก
          </label>
          <label className="check-line">
            <input
              checked={voidForm.confirmed}
              onChange={(event) => setVoidForm((current) => ({ ...current, confirmed: event.target.checked }))}
              type="checkbox"
            />
            ยืนยันว่าต้องการยกเลิกออร์เดอร์นี้
          </label>
          <div className="modal-actions">
            <button className="ghost-button" onClick={() => setShowVoidForm(false)} type="button">ไม่ยกเลิก</button>
            <button className="danger-button is-armed" disabled={!voidForm.confirmed || voidBusy} type="submit">
              {voidBusy ? "กำลังบันทึก..." : "ยืนยันยกเลิก"}
            </button>
          </div>
        </form>
      ) : null}
      <div className="modal-actions">
        <button className="primary-button" onClick={() => onReprint(order, "RECEIPT")} type="button"><Printer size={18} /> พิมพ์ใบเสร็จ</button>
        <button className="ghost-button" onClick={() => onReprint(order, "KITCHEN")} type="button"><ReceiptText size={18} /> พิมพ์ใบออร์เดอร์</button>
        {!isVoided && onVoidOrder ? (
          <button className="danger-button" onClick={() => setShowVoidForm((current) => !current)} type="button">
            ยกเลิกออร์เดอร์
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatRefundMethod(method) {
  if (method === "CASH") return "คืนเงินสด";
  if (method === "TRANSFER") return "คืนเงินโอน";
  return "กดผิด / ไม่ได้รับเงินจริง - ลบยอดรับเงินออก";
}

function getPaymentMethodLabel(method) {
  if (method === "CASH") return "เงินสด";
  if (method === "THAI_CHUAY_THAI") return "ไทยช่วยไทย";
  return "เงินโอน";
}

function normalizeOrderItemCategory(item) {
  const category = String(item?.category || "").trim();
  const lowerCategory = category.toLowerCase();
  const name = String(item?.name || "").trim().toLowerCase();
  if (lowerCategory === "bbq" || lowerCategory.includes("bbq") || category.includes("บาร์บีคิว")) return "BBQ";
  if (lowerCategory.includes("burger") || category.includes("เบอร์เกอร์")) return "เบอร์เกอร์";
  if (name.includes("bbq") || name.includes("บาร์บีคิว")) return "BBQ";
  if (name.includes("burger") || name.includes("เบอร์เกอร์")) return "เบอร์เกอร์";
  return category;
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
                <small>{new Date(order.createdAt).toLocaleString("th-TH")} · {getPaymentMethodLabel(order.paymentMethod)}</small>
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
                  <span>ไทยช่วยไทย <strong>{money(summary.thaiChuayThaiSales || 0)} บาท</strong></span>
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

function ModifierModal({ allowMissingStock = false, confirmLabel = "เพิ่มลงตะกร้า", ingredients, modifierGroups, modifierIds, modifierRecipes, modifiers, note, onClose, onConfirm, onDecrement, onNoteChange, onQuantityChange, onToggle, product, quantity = 1 }) {
  const { backdropRef } = useAnimeModal(onClose, modifierModalChildren);
  const productModifiers = modifiers.filter((modifier) => modifier.productIds.includes(product.id));
  const knownModifierGroupIds = new Set(modifierGroups.map((group) => group.id));
  const groupedModifiers = modifierGroups
    .map((group) => ({
      ...group,
      modifiers: productModifiers.filter((modifier) => {
        const modifierGroup = modifier.group || "addon";
        if (group.id === "other") return modifierGroup === "other" || !knownModifierGroupIds.has(modifierGroup);
        return modifierGroup === group.id;
      }),
    }))
    .filter((group) => group.modifiers.length);
  const safeQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const modifierCounts = countModifierIds(modifierIds);
  const selectedRecipeLines = modifierRecipes.flatMap((recipe) => {
    const modifierCount = Number(modifierCounts.get(recipe.modifierId) || 0);
    if (!modifierCount) return [];
    return [{ ingredientId: recipe.ingredientId, quantity: Math.max(0, recipe.quantity) * modifierCount * safeQuantity }];
  });
  const missing = getMissingIngredients(selectedRecipeLines, ingredients);
  const confirmDisabled = missing.length > 0 && !allowMissingStock;
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set(["addon"]));
  const getModifierStockWarning = (modifierId) => {
    const recipeLines = modifierRecipes
      .filter((recipe) => recipe.modifierId === modifierId)
      .map((recipe) => ({ ingredientId: recipe.ingredientId, quantity: Math.max(0, recipe.quantity) * safeQuantity }))
      .filter((line) => line.quantity > 0);
    const shortage = getMissingIngredients(recipeLines, ingredients);
    if (!shortage.length) return null;
    const hasSomeStock = shortage.some((item) => Number(item.stock || 0) > 0);
    return {
      label: hasSomeStock ? "วัตถุดิบไม่พอ" : "วัตถุดิบหมด",
      names: shortage.map((item) => item.name).join(", "),
    };
  };
  const updateQuantity = (nextValue) => {
    onQuantityChange(Math.max(1, Number.parseInt(nextValue, 10) || 1));
  };
  const toggleGroupExpansion = (groupId) => {
    if (groupId === "addon") return;
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  return (
    <div className="modal-backdrop anime-modal" ref={backdropRef}>
      <div className="modal-card modifier-modal-card">
        <h3>{product.name}</h3>
        <p>เลือกคำสั่งพิเศษก่อนเพิ่มลงตะกร้า</p>
        <div className="modifier-list">
          {groupedModifiers.map((group) => {
            const isPinnedGroup = group.id === "addon";
            const isExpanded = isPinnedGroup || expandedGroupIds.has(group.id);
            const selectedInGroup = group.modifiers.reduce((sum, modifier) => sum + Number(modifierCounts.get(modifier.id) || 0), 0);
            return (
              <div className={`modifier-group ${isExpanded ? "is-expanded" : ""}`} key={group.id}>
                <button
                  aria-expanded={isExpanded}
                  className="modifier-group-toggle"
                  onClick={() => toggleGroupExpansion(group.id)}
                  type="button"
                >
                  <span>
                    <strong>{group.label}</strong>
                    <small>{isPinnedGroup ? "แสดงตัวเลือกหลัก" : "แตะเพื่อเปิดรายการด้านใน"}</small>
                  </span>
                  <span className="modifier-group-meta">
                    {selectedInGroup ? `เลือก ${selectedInGroup}` : `${group.modifiers.length} รายการ`}
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>
                {isExpanded ? (
                  <div className="modifier-option-grid">
                    {group.modifiers.map((modifier) => {
                      const selectedCount = Number(modifierCounts.get(modifier.id) || 0);
                      const allowsQuantity = modifierAllowsQuantity(modifier);
                      const stockWarning = getModifierStockWarning(modifier.id);
                      return (
                        <div className={`modifier-row ${selectedCount ? "is-active" : ""} ${stockWarning ? "is-stock-warning" : ""}`} key={modifier.id}>
                          <button className="modifier-row-button" onClick={() => onToggle(modifier.id)} type="button">
                            <span>{modifier.label}</span>
                            <strong>{modifier.price ? `+${money(modifier.price)} บาท` : "ไม่คิดเงิน"}</strong>
                            {stockWarning ? <small className="modifier-stock-note">{stockWarning.label}: {stockWarning.names}</small> : null}
                          </button>
                          {allowsQuantity ? (
                            <div className="modifier-option-qty">
                              <button disabled={!selectedCount} onClick={() => onDecrement(modifier.id)} type="button"><Minus size={16} /></button>
                              <b>{selectedCount}</b>
                              <button onClick={() => onToggle(modifier.id)} type="button"><Plus size={16} /></button>
                            </div>
                          ) : (
                            <button className="modifier-toggle-pill" onClick={() => onToggle(modifier.id)} type="button">
                              {selectedCount ? <Check size={16} /> : <Plus size={16} />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="modifier-bottom-grid">
          <label className="modifier-note-field">
            หมายเหตุรายการ
            <input
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="เช่น ไม่เผ็ด ขอเกรียมๆ"
              value={note}
            />
          </label>
          <label className="modifier-quantity-field">
            <span>จำนวน</span>
            <div className="modifier-quantity-control">
              <button onClick={() => updateQuantity(safeQuantity - 1)} type="button">-</button>
              <input
                inputMode="numeric"
                min="1"
                onChange={(event) => updateQuantity(event.target.value)}
                type="number"
                value={safeQuantity}
              />
              <button onClick={() => updateQuantity(safeQuantity + 1)} type="button">+</button>
            </div>
          </label>
        </div>
        {missing.length ? (
          <div className="warning-box">
            วัตถุดิบไม่พอ: {missing.map((item) => item.name).join(", ")}
            {allowMissingStock ? " · กดต่อได้ สต็อกจะติดลบ" : ""}
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">ยกเลิก</button>
          <button className="primary-button" disabled={confirmDisabled} onClick={onConfirm} type="button">{confirmLabel}</button>
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const change = Math.max(0, cash - total);
  function addCash(amount) {
    setCash((current) => (quickCashTouched ? Number(current || 0) + amount : amount));
    setQuickCashTouched(true);
  }
  function updateCash(value) {
    setCash(Number(value || 0));
    setQuickCashTouched(true);
  }
  async function submitPayment() {
    if (isSubmitting || (method === "CASH" && cash < total)) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const saved = await onSubmit({ paymentMethod: method, cashReceived: method === "CASH" ? cash : total });
      if (saved !== true) {
        setSubmitError("ยังบันทึกออร์เดอร์ไม่สำเร็จ กรุณาตรวจยอดและลองอีกครั้ง");
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Failed to complete order", error);
      setSubmitError("บันทึกออร์เดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง");
      setIsSubmitting(false);
    }
  }
  return (
    <div className="modal-backdrop anime-modal" ref={backdropRef}>
      <div className="modal-card payment-card">
        <h3>ชำระเงิน</h3>
        <div className="payment-tabs">
          <button className={method === "CASH" ? "is-active" : ""} onClick={() => setMethod("CASH")} type="button">
            <Banknote size={18} /> เงินสด
          </button>
          <button className={method === "TRANSFER" ? "is-active" : ""} onClick={() => setMethod("TRANSFER")} type="button">
            <CreditCard size={18} /> เงินโอน
          </button>
          <button className={method === "THAI_CHUAY_THAI" ? "is-active" : ""} onClick={() => setMethod("THAI_CHUAY_THAI")} type="button">
            <CreditCard size={18} /> ไทยช่วยไทย
          </button>
        </div>
        <div className="receipt-preview">
          {cart.map((item) => (
            <span key={item.key}>
              <b>{item.quantity}x {item.product.name}</b>
              {item.modifiers.length ? <small>{formatModifierSummary(item.modifiers).join(", ")}</small> : null}
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
        ) : <div className="transfer-ready"><Check size={20} /> {getPaymentMethodLabel(method)}สำเร็จได้ทันทีเมื่อกดยืนยัน</div>}
        {submitError ? <div className="inline-warning">{submitError}</div> : null}
        <div className="modal-actions">
          <button className="ghost-button" disabled={isSubmitting} onClick={closeWithAnimation} type="button">ยกเลิก</button>
          <button
            className="primary-button"
            disabled={isSubmitting || (method === "CASH" && cash < total)}
            onClick={submitPayment}
            type="button"
          >
            {isSubmitting ? "กำลังบันทึก..." : "ยืนยันออเดอร์"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InventoryScreen({ adjustStock, deleteIngredient, expenseCategories = defaultGeneralExpenseCategories, expenseSubcategories = defaultGeneralExpenseSubcategories, ingredientCategories, ingredients, onAddPurchaseUnit, purchaseUnits, saveIngredient, setIngredientCategories, setIngredients }) {
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [newCategory, setNewCategory] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const selected = selectedId ? ingredients.find((item) => item.id === selectedId) : null;
  const [form, setForm] = useState(emptyIngredient());
  const [adjustment, setAdjustment] = useState({ mode: "in", quantity: "", reason: "" });
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
  const formExpenseCategory = form.expenseCategory || defaultIngredientExpenseCategory;
  const formExpenseSubcategories = expenseSubcategories.filter((subcategory) => subcategory.category === formExpenseCategory);

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
    if (categoryFilter !== "all" && (item.category || "อื่นๆ") !== categoryFilter) return false;
    return item.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  function moveIngredient(ingredientId, direction) {
    setIngredients((current) => moveArrayItem(current, ingredientId, direction));
  }

  function moveIngredientTo(ingredientId, position) {
    setIngredients((current) => moveArrayItemToPosition(current, ingredientId, position));
  }

  function addIngredientCategory(event) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name || ingredientCategories.includes(name)) return;
    setIngredientCategories((current) => [...current, name]);
    setNewCategory("");
  }

  function removeIngredientCategory(category) {
    setIngredientCategories((current) => current.filter((item) => item !== category));
    setIngredients((current) => current.map((item) => (item.category === category ? { ...item, category: "อื่นๆ" } : item)));
    if (categoryFilter === category) setCategoryFilter("all");
    setCategoryDeleteTarget("");
  }

  function saveForm(event) {
    event.preventDefault();
    const isNew = !selected;
    const purchaseLabel = (form.purchaseLabel || "").trim();
    const purchaseRatio = Number(form.purchaseRatio || 0);
    const next = {
      id: form.id || `ing_${Date.now()}`,
      name: form.name || "",
      unit: form.unit || "ชิ้น",
      stock: selected ? Number(selected.stock || 0) : Number(form.stock || 0),
      minimumStock: Number(form.minimumStock || 0),
      category: form.category || ingredientCategories[0] || "อื่นๆ",
      expenseCategory: form.expenseCategory || defaultIngredientExpenseCategory,
      expenseSubcategory: form.expenseSubcategory
        || firstExpenseSubcategory(form.expenseCategory || defaultIngredientExpenseCategory, expenseSubcategories)
        || defaultIngredientExpenseSubcategory,
    };
    saveIngredient(next);
    if (isNew && purchaseLabel && purchaseRatio > 0) {
      const timestamp = new Date().toISOString();
      onAddPurchaseUnit((current) => [
        ...current,
        {
          id: `unit_${Date.now()}`,
          ingredientId: next.id,
          label: purchaseLabel,
          ratio: purchaseRatio,
          baseUnit: next.unit,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]);
    }
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
    const timestamp = new Date().toISOString();
    const existingUnit = editingUnitId ? purchaseUnits.find((unit) => unit.id === editingUnitId) : null;
    const nextUnit = {
      id: editingUnitId || `unit_${Date.now()}`,
      ingredientId: selected.id,
      label: unitForm.label.trim() || selected.unit,
      ratio: Number(unitForm.ratio || 1),
      baseUnit: selected.unit,
      createdAt: existingUnit?.createdAt || timestamp,
      updatedAt: timestamp,
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
    if (!selected) return;
    const quantity = Number(adjustment.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setEditorNotice("กรุณาใส่จำนวนที่ต้องการปรับสต็อก");
      window.setTimeout(() => setEditorNotice(""), 1800);
      return;
    }
    const quantityDelta = adjustment.mode === "out" ? -quantity : quantity;
    const actionText = quantityDelta > 0 ? "เพิ่ม" : "ลด";
    const confirmed = window.confirm(`${actionText}สต็อก ${selected.name} ${money(Math.abs(quantityDelta))} ${selected.unit} ใช่ไหม?`);
    if (!confirmed) return;
    adjustStock({
      ingredientId: selected.id,
      quantityDelta,
      reason: adjustment.reason || `${actionText}สต็อก manual`,
    });
    setAdjustment({ mode: "in", quantity: "", reason: "" });
  }

  return (
    <section className={`management-layout ${editorOpen ? "" : "is-single"}`}>
      <div className="work-panel">
        <div className="toolbar inventory-toolbar">
          <div className="search-box"><Search size={18} /><input placeholder="ค้นหาวัตถุดิบ" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")} type="button">ทั้งหมด</button>
          <button className={filter === "low" ? "is-active" : ""} onClick={() => setFilter("low")} type="button">ใกล้หมด</button>
          <button className={filter === "out" ? "is-active" : ""} onClick={() => setFilter("out")} type="button">หมดแล้ว</button>
          <select aria-label="กรองประเภทวัตถุดิบ" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">ทุกประเภท</option>
            {ingredientCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <button
            className="new-record-button toolbar-add-button"
            onClick={startNewIngredient}
            type="button"
          >
            <Plus size={20} />
            เพิ่มรายการ
          </button>
          <button className={`reorder-toggle-button ${reorderMode ? "is-active" : ""}`} onClick={() => setReorderMode((current) => !current)} type="button">
            <SlidersHorizontal size={18} /> {reorderMode ? "เสร็จสิ้นการจัดลำดับ" : "จัดลำดับ"}
          </button>
        </div>
        <div className="inventory-grid">
          {rows.map((item) => {
            const absoluteIndex = ingredients.findIndex((ingredient) => ingredient.id === item.id);
            const stock = Number(item.stock || 0);
            const out = stock <= 0;
            const low = !out && stock <= Number(item.minimumStock);
            return (
              <article
                className={`inventory-card ${low ? "is-low" : ""} ${out ? "is-out" : ""} ${selectedId === item.id ? "is-active" : ""} ${reorderMode ? "is-reordering" : ""}`}
                key={item.id}
                onClick={() => {
                  if (editorOpen && selectedId === item.id) closeEditor();
                  else openEditorFor(item);
                }}
                role="button"
                tabIndex={0}
              >
                {reorderMode ? <span className="admin-item-order">
                  <ReorderPositionInput label={item.name} max={ingredients.length} onMove={(position) => moveIngredientTo(item.id, position)} value={absoluteIndex + 1} />
                  <button aria-label={`เลื่อน ${item.name} ขึ้น`} disabled={absoluteIndex === 0} onClick={(event) => { event.stopPropagation(); moveIngredient(item.id, -1); }} type="button"><ChevronUp size={15} /></button>
                  <button aria-label={`เลื่อน ${item.name} ลง`} disabled={absoluteIndex === ingredients.length - 1} onClick={(event) => { event.stopPropagation(); moveIngredient(item.id, 1); }} type="button"><ChevronDown size={15} /></button>
                </span> : null}
                <div>
                  <h3>{item.name}</h3>
                  <p>ขั้นต่ำ {money(item.minimumStock)} {item.unit}</p>
                </div>
                <strong>{money(item.stock)} <small>{item.unit}</small></strong>
                <span>{out ? "หมดแล้ว" : low ? "ใกล้หมด" : "พร้อมขาย"}</span>
              </article>
            );
          })}
        </div>
        <form className="category-quick-manager" onSubmit={addIngredientCategory}>
          <strong>ประเภทวัตถุดิบ</strong>
          <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="เพิ่มประเภทวัตถุดิบ" />
          <button className="ghost-button" type="submit"><Plus size={16} /> เพิ่ม</button>
          <div>{ingredientCategories.map((category) => <span key={category}>{category}<button aria-label={`ลบประเภท ${category}`} onClick={() => setCategoryDeleteTarget(category)} type="button"><Trash2 size={14} /></button></span>)}</div>
        </form>
      </div>
      {editorOpen ? <button aria-label="ปิดหน้าจัดการวัตถุดิบ" className="editor-backdrop" onClick={closeEditor} type="button" /> : null}
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
          <label>ประเภทวัตถุดิบ (ไว้ดูในเว็บ)<select value={form.category || ingredientCategories[0] || "อื่นๆ"} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{ingredientCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>ประเภทบัญชีหลัก<select value={formExpenseCategory} onChange={(event) => {
            const category = event.target.value;
            setDeleteArmed(false);
            setForm((current) => ({
              ...current,
              expenseCategory: category,
              expenseSubcategory: firstExpenseSubcategory(category, expenseSubcategories) || "",
            }));
          }}>{expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>ประเภทย่อยบัญชี<select value={form.expenseSubcategory || ""} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, expenseSubcategory: event.target.value })); }}>
            {!formExpenseSubcategories.some((subcategory) => subcategory.name === form.expenseSubcategory) && form.expenseSubcategory ? <option value={form.expenseSubcategory}>{form.expenseSubcategory}</option> : null}
            {formExpenseSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>)}
          </select></label>
          <label className={hasUnsavedChanges && normalizeIngredientForm(form).unit !== normalizeIngredientForm(savedForm).unit ? "is-dirty" : ""}>หน่วยหลัก<input value={form.unit || ""} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, unit: event.target.value })); }} /></label>
          {selected ? (
            <div className="readonly-stock-field">
              <span>คงเหลือ</span>
              <strong>{money(selected.stock)} {selected.unit}</strong>
              <small>ปรับจำนวนผ่านช่อง “ปรับ stock manual” ด้านล่างเท่านั้น</small>
            </div>
          ) : (
            <label className={hasUnsavedChanges && normalizeIngredientForm(form).stock !== normalizeIngredientForm(savedForm).stock ? "is-dirty" : ""}>คงเหลือเริ่มต้น<input inputMode="decimal" type="number" value={form.stock ?? 0} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, stock: event.target.value })); }} /></label>
          )}
          <label className={hasUnsavedChanges && normalizeIngredientForm(form).minimumStock !== normalizeIngredientForm(savedForm).minimumStock ? "is-dirty" : ""}>แจ้งเตือนเมื่อเหลือ<input inputMode="decimal" type="number" value={form.minimumStock ?? 0} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, minimumStock: event.target.value })); }} /></label>
          {!selected ? (
            <div className="new-ingredient-unit-fields">
              <label className={hasUnsavedChanges && normalizeIngredientForm(form).purchaseLabel !== normalizeIngredientForm(savedForm).purchaseLabel ? "is-dirty" : ""}>หน่วยซื้อเริ่มต้น<input value={form.purchaseLabel || ""} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, purchaseLabel: event.target.value })); }} /></label>
              <label className={hasUnsavedChanges && normalizeIngredientForm(form).purchaseRatio !== normalizeIngredientForm(savedForm).purchaseRatio ? "is-dirty" : ""}>1 หน่วยซื้อ เท่ากับ<input inputMode="decimal" min="0" type="number" value={form.purchaseRatio ?? 1} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, purchaseRatio: event.target.value })); }} /></label>
            </div>
          ) : null}
          <div className="modal-actions">
            <button className="primary-button" type="submit"><Save size={18} /> บันทึก</button>
            {selected ? <button className="danger-button" onClick={() => setDeleteArmed(true)} type="button">ลบวัตถุดิบ</button> : null}
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
              <div className="stock-adjust-mode" role="group" aria-label="เลือกวิธีปรับสต็อก">
                <button className={adjustment.mode === "in" ? "is-active" : ""} onClick={() => setAdjustment((current) => ({ ...current, mode: "in" }))} type="button">เพิ่ม</button>
                <button className={adjustment.mode === "out" ? "is-active" : ""} onClick={() => setAdjustment((current) => ({ ...current, mode: "out" }))} type="button">ลด</button>
              </div>
              <label>จำนวน<input inputMode="decimal" min="0" type="number" value={adjustment.quantity} onChange={(event) => setAdjustment((current) => ({ ...current, quantity: event.target.value }))} /></label>
              <label>เหตุผล<input value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} placeholder="เช่น นับจริง, เสียหาย" /></label>
              <button className="ghost-button" type="submit">บันทึกการปรับ</button>
            </form>
          </>
        ) : null}
      </aside>
      ) : null}
      {deleteArmed && selected ? <ConfirmDialog title="ลบวัตถุดิบ" message={`ต้องการลบ “${selected.name}” ใช่ไหม? สูตรและหน่วยซื้อที่เกี่ยวข้องจะถูกลบด้วย`} onCancel={() => setDeleteArmed(false)} onConfirm={removeSelectedIngredient} /> : null}
      {categoryDeleteTarget ? <ConfirmDialog title="ลบประเภทวัตถุดิบ" message={`ต้องการลบประเภท “${categoryDeleteTarget}” ใช่ไหม? วัตถุดิบในประเภทนี้จะถูกย้ายไป “อื่นๆ”`} onCancel={() => setCategoryDeleteTarget("")} onConfirm={() => removeIngredientCategory(categoryDeleteTarget)} /> : null}
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
  const [reorderMode, setReorderMode] = useState(false);
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

  function moveProductTo(productId, position) {
    setProducts((current) => moveArrayItemToPosition(current, productId, position));
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
          <button className={`reorder-toggle-button ${reorderMode ? "is-active" : ""}`} onClick={() => setReorderMode((current) => !current)} type="button">
            <SlidersHorizontal size={18} /> {reorderMode ? "เสร็จสิ้นการจัดลำดับ" : "จัดลำดับ"}
          </button>
        </div>
        {productActionNotice ? <div className="inline-confirm">{productActionNotice}</div> : null}
        <div className="product-admin-grid">
          {visibleProducts.map((product, index) => (
            <article
              className={`admin-product ${selectedId === product.id ? "is-active" : ""} ${reorderMode ? "is-reordering" : ""}`}
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
              {reorderMode ? <span className="admin-product-order" aria-label="จัดลำดับสินค้า">
                <ReorderPositionInput label={product.name} max={products.length} onMove={(position) => moveProductTo(product.id, position)} value={products.findIndex((item) => item.id === product.id) + 1} />
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
              </span> : null}
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
          {selected ? <button className="danger-button" onClick={() => setDeleteArmed(true)} type="button">ลบสินค้า</button> : null}
        </div>
      </form>
      ) : null}
      {deleteArmed && selected ? <ConfirmDialog title="ลบสินค้า" message={`ต้องการลบ “${selected.name}” ใช่ไหม? สูตร BOM ของสินค้านี้จะถูกลบด้วย`} onCancel={() => setDeleteArmed(false)} onConfirm={removeProduct} /> : null}
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
                <button className="danger-button" onClick={() => setDeleteTarget(category)} type="button">ลบ</button>
              </div>
            </div>
          );
        })}
      </div>
      {deleteTarget ? <ConfirmDialog title="ลบหมวดหมู่สินค้า" message={`ต้องการลบหมวด “${deleteTarget}” ใช่ไหม? สินค้าในหมวดนี้จะถูกย้ายไปหมวดอื่น`} onCancel={() => setDeleteTarget("")} onConfirm={() => removeCategory(deleteTarget)} /> : null}
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

function ModifierManagementScreen({ ingredients, modifierGroups, modifierRecipes, modifiers, products, setModifierGroups, setModifierRecipes, setModifiers }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState("all");
  const [newGroupName, setNewGroupName] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState(null);
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
      group: form.group || "addon",
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

  function moveModifier(modifierId, direction) {
    setModifiers((current) => moveArrayItem(current, modifierId, direction));
  }

  function moveModifierTo(modifierId, position) {
    setModifiers((current) => moveArrayItemToPosition(current, modifierId, position));
  }

  function addModifierGroup(event) {
    event.preventDefault();
    const label = newGroupName.trim();
    if (!label || modifierGroups.some((group) => group.label === label)) return;
    setModifierGroups((current) => [...current, { id: `group_${Date.now()}`, label }]);
    setNewGroupName("");
  }

  function removeModifierGroup(groupId) {
    if (modifierGroups.length <= 1) return;
    const fallback = modifierGroups.find((group) => group.id !== groupId)?.id || "other";
    setModifierGroups((current) => current.filter((group) => group.id !== groupId));
    setModifiers((current) => current.map((modifier) => (modifier.group === groupId ? { ...modifier, group: fallback } : modifier)));
    if (groupFilter === groupId) setGroupFilter("all");
    setGroupDeleteTarget(null);
  }

  const visibleModifiers = groupFilter === "all" ? modifiers : modifiers.filter((modifier) => (modifier.group || "addon") === groupFilter);

  return (
    <section className={`management-layout ${editorOpen ? "" : "is-single"}`}>
      <div className="work-panel">
        <div className="toolbar management-toolbar">
          <button className={groupFilter === "all" ? "is-active" : ""} onClick={() => setGroupFilter("all")} type="button">ทั้งหมด</button>
          {modifierGroups.map((group) => <button className={groupFilter === group.id ? "is-active" : ""} key={group.id} onClick={() => setGroupFilter(group.id)} type="button">{group.label}</button>)}
          <button className="new-record-button toolbar-add-button" onClick={startNewModifier} type="button">
            <Plus size={20} />
            เพิ่มตัวเลือกเสริม
          </button>
          <button className={`reorder-toggle-button ${reorderMode ? "is-active" : ""}`} onClick={() => setReorderMode((current) => !current)} type="button">
            <SlidersHorizontal size={18} /> {reorderMode ? "เสร็จสิ้นการจัดลำดับ" : "จัดลำดับ"}
          </button>
        </div>
        <div className="modifier-admin-grid">
          {visibleModifiers.map((modifier) => {
            const absoluteIndex = modifiers.findIndex((item) => item.id === modifier.id);
            return <article
              className={`modifier-admin-card ${selectedId === modifier.id ? "is-active" : ""} ${reorderMode ? "is-reordering" : ""}`}
              key={modifier.id}
              onClick={() => {
                if (editorOpen && selectedId === modifier.id) closeEditor();
                else openEditorFor(modifier);
              }}
              role="button"
              tabIndex={0}
            >
              {reorderMode ? <span className="admin-item-order">
                <ReorderPositionInput label={modifier.label} max={modifiers.length} onMove={(position) => moveModifierTo(modifier.id, position)} value={absoluteIndex + 1} />
                <button aria-label={`เลื่อน ${modifier.label} ขึ้น`} disabled={absoluteIndex === 0} onClick={(event) => { event.stopPropagation(); moveModifier(modifier.id, -1); }} type="button"><ChevronUp size={15} /></button>
                <button aria-label={`เลื่อน ${modifier.label} ลง`} disabled={absoluteIndex === modifiers.length - 1} onClick={(event) => { event.stopPropagation(); moveModifier(modifier.id, 1); }} type="button"><ChevronDown size={15} /></button>
              </span> : null}
              <strong>{modifier.label}</strong>
              <span>{modifier.price ? `+${money(modifier.price)} บาท` : "ไม่คิดเงิน"}</span>
              <small>{getModifierGroupLabel(modifier.group || "addon", modifierGroups)} · ใช้กับ {modifier.productIds?.length || 0} เมนู</small>
            </article>;
          })}
        </div>
        <form className="category-quick-manager" onSubmit={addModifierGroup}>
          <strong>ประเภทตัวเลือกเสริม</strong>
          <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="เพิ่มประเภทตัวเลือก" />
          <button className="ghost-button" type="submit"><Plus size={16} /> เพิ่ม</button>
          <div>{modifierGroups.map((group) => <span key={group.id}>{group.label}<button aria-label={`ลบประเภท ${group.label}`} onClick={() => setGroupDeleteTarget(group)} type="button"><Trash2 size={14} /></button></span>)}</div>
        </form>
      </div>
      {editorOpen ? (
        <form className="side-editor" onSubmit={saveModifier}>
          <div className="panel-title">
            <SlidersHorizontal size={20} />
            <h3>ตั้งค่าตัวเลือกเสริม</h3>
            <button className="icon-close-button" onClick={closeEditor} type="button">ปิด</button>
          </div>
          <label>ชื่อตัวเลือก<input value={form.label || ""} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, label: event.target.value })); }} /></label>
          <label>ประเภทตัวเลือก<select value={form.group || "addon"} onChange={(event) => { setDeleteArmed(false); setForm((current) => ({ ...current, group: event.target.value })); }}>
            {modifierGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select></label>
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
            {selected ? <button className="danger-button" onClick={() => setDeleteArmed(true)} type="button">ลบตัวเลือก</button> : null}
          </div>
        </form>
      ) : null}
      {deleteArmed && selected ? <ConfirmDialog title="ลบตัวเลือกเสริม" message={`ต้องการลบ “${selected.label}” ใช่ไหม? สูตรวัตถุดิบของตัวเลือกนี้จะถูกลบด้วย`} onCancel={() => setDeleteArmed(false)} onConfirm={removeModifier} /> : null}
      {groupDeleteTarget ? <ConfirmDialog title="ลบประเภทตัวเลือกเสริม" message={`ต้องการลบประเภท “${groupDeleteTarget.label}” ใช่ไหม? ตัวเลือกในประเภทนี้จะถูกย้ายไปประเภทอื่น`} onCancel={() => setGroupDeleteTarget(null)} onConfirm={() => removeModifierGroup(groupDeleteTarget.id)} /> : null}
    </section>
  );
}

function compareExpenseDatabaseRecords(a, b) {
  const aCategory = a.expenseCategory || a.category || "";
  const bCategory = b.expenseCategory || b.category || "";
  const aSubcategory = a.expenseSubcategory || a.subcategory || "";
  const bSubcategory = b.expenseSubcategory || b.subcategory || "";
  return aCategory.localeCompare(bCategory, "th")
    || aSubcategory.localeCompare(bSubcategory, "th")
    || String(a.name || "").localeCompare(String(b.name || ""), "th");
}

function GeneralExpenseMasterScreen({ categories: masterCategories, ingredients = [], items, setCategories, setIngredients = () => {}, setItems, setSubcategories, subcategories }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyGeneralExpenseItem(
    defaultNonStockExpenseCategory(masterCategories),
    firstExpenseSubcategory(defaultNonStockExpenseCategory(masterCategories), subcategories),
  ));
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newSubcategoryCategory, setNewSubcategoryCategory] = useState(defaultNonStockExpenseCategory(masterCategories) || masterCategories[0] || "");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [subcategoryDialogOpen, setSubcategoryDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState("");
  const [subcategoryDeleteTarget, setSubcategoryDeleteTarget] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const selected = selectedId ? items.find((item) => item.id === selectedId) : null;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleStockItems = ingredients.filter((item) => (
    !normalizedQuery
    || item.name.toLowerCase().includes(normalizedQuery)
    || item.category?.toLowerCase().includes(normalizedQuery)
    || item.expenseCategory?.toLowerCase().includes(normalizedQuery)
    || item.expenseSubcategory?.toLowerCase().includes(normalizedQuery)
  )).sort(compareExpenseDatabaseRecords);
  const visibleItems = items.filter((item) => (
    !normalizedQuery
    || item.name.toLowerCase().includes(normalizedQuery)
    || item.category?.toLowerCase().includes(normalizedQuery)
    || item.subcategory?.toLowerCase().includes(normalizedQuery)
  )).sort(compareExpenseDatabaseRecords);
  const formSubcategories = subcategories.filter((subcategory) => subcategory.category === form.category);

  function openEditor(item) {
    setSelectedId(item.id);
    setForm({
      ...item,
      subcategory: item.subcategory || firstExpenseSubcategory(item.category, subcategories),
    });
    setEditorOpen(true);
  }

  function startNew() {
    setSelectedId("");
    const defaultCategory = defaultNonStockExpenseCategory(masterCategories);
    setForm(emptyGeneralExpenseItem(
      defaultCategory,
      firstExpenseSubcategory(defaultCategory, subcategories),
    ));
    setEditorOpen(true);
  }

  function closeEditor() {
    setSelectedId(null);
    setEditorOpen(false);
  }

  function saveItem(event) {
    event.preventDefault();
    const name = form.name.trim();
    const unit = form.unit.trim();
    if (!name || !form.category || !form.subcategory) return;
    const next = {
      ...form,
      id: form.id || `general_${Date.now()}`,
      name,
      unit,
      note: form.note?.trim() || "",
      active: form.active !== false,
    };
    setItems((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists ? current.map((item) => (item.id === next.id ? next : item)) : [...current, next];
    });
    closeEditor();
  }

  function removeItem() {
    if (!deleteTarget) return;
    setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    closeEditor();
  }

  function moveItem(itemId, direction) {
    setItems((current) => moveArrayItem(current, itemId, direction));
  }

  function moveItemTo(itemId, position) {
    setItems((current) => moveArrayItemToPosition(current, itemId, position));
  }

  function updateIngredientExpenseMeta(ingredientId, patch) {
    setIngredients((current) => current.map((ingredient) => (
      ingredient.id === ingredientId ? { ...ingredient, ...patch } : ingredient
    )));
  }

  function openCategoryDialog() {
    setNewCategory("");
    setCategoryDialogOpen(true);
  }

  function openSubcategoryDialog() {
    setNewSubcategory("");
    setNewSubcategoryCategory(defaultNonStockExpenseCategory(masterCategories) || masterCategories[0] || "");
    setSubcategoryDialogOpen(true);
  }

  function addCategory(event) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name || masterCategories.includes(name)) return;
    setCategories((current) => [...current, name]);
    setNewCategory("");
    setCategoryDialogOpen(false);
  }

  function addSubcategory(event) {
    event.preventDefault();
    const name = newSubcategory.trim();
    const category = newSubcategoryCategory || masterCategories[0] || "";
    if (!name || !category || subcategories.some((item) => item.category === category && item.name === name)) return;
    setSubcategories((current) => [...current, {
      id: `expense_sub_${Date.now()}`,
      category,
      name,
    }]);
    setNewSubcategory("");
    setSubcategoryDialogOpen(false);
  }

  function removeCategory() {
    if (!categoryDeleteTarget) return;
    if (categoryDeleteTarget === defaultIngredientExpenseCategory) {
      setCategoryDeleteTarget("");
      return;
    }
    if (masterCategories.length <= 1) {
      setCategoryDeleteTarget("");
      return;
    }
    const fallback = masterCategories.find((category) => category !== categoryDeleteTarget) || "ค่าใช้จ่ายอื่นๆ";
    const fallbackSubcategory = firstExpenseSubcategory(fallback, subcategories) || "ทั่วไป";
    setCategories((current) => current.filter((category) => category !== categoryDeleteTarget));
    setSubcategories((current) => current.filter((subcategory) => subcategory.category !== categoryDeleteTarget));
    setItems((current) => current.map((item) => (
      item.category === categoryDeleteTarget
        ? { ...item, category: fallback, subcategory: fallbackSubcategory }
        : item
    )));
    setIngredients((current) => current.map((item) => (
      item.expenseCategory === categoryDeleteTarget
        ? { ...item, expenseCategory: fallback, expenseSubcategory: fallbackSubcategory }
        : item
    )));
    setCategoryDeleteTarget("");
  }

  function removeSubcategory() {
    if (!subcategoryDeleteTarget) return;
    const siblings = subcategories.filter((item) => (
      item.category === subcategoryDeleteTarget.category
      && item.id !== subcategoryDeleteTarget.id
    ));
    if (!siblings.length) {
      setSubcategoryDeleteTarget(null);
      return;
    }
    const fallback = siblings[0].name;
    setSubcategories((current) => current.filter((item) => item.id !== subcategoryDeleteTarget.id));
    setItems((current) => current.map((item) => (
      item.category === subcategoryDeleteTarget.category && item.subcategory === subcategoryDeleteTarget.name
        ? { ...item, subcategory: fallback }
        : item
    )));
    setIngredients((current) => current.map((item) => (
      item.expenseCategory === subcategoryDeleteTarget.category && item.expenseSubcategory === subcategoryDeleteTarget.name
        ? { ...item, expenseSubcategory: fallback }
        : item
    )));
    setSubcategoryDeleteTarget(null);
  }

  return (
    <section className={`management-layout ${editorOpen ? "" : "is-single"}`}>
      <div className="work-panel">
        <div className="toolbar management-toolbar general-expense-master-toolbar">
          <div className="search-box"><Search size={18} /><input placeholder="ค้นหาฐานข้อมูลรายจ่าย" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <button className="new-record-button toolbar-add-button" onClick={startNew} type="button"><Plus size={19} /> เพิ่มรายการทั่วไป</button>
          <button className={`reorder-toggle-button ${reorderMode ? "is-active" : ""}`} onClick={() => setReorderMode((current) => !current)} type="button">
            <SlidersHorizontal size={18} /> {reorderMode ? "เสร็จสิ้นการจัดลำดับ" : "จัดลำดับ"}
          </button>
        </div>
        <div className="expense-database-section-title">
          <div>
            <h3>วัตถุดิบที่ลงสต็อก</h3>
            <p>ประเภทวัตถุดิบยังใช้ไว้ดูในเว็บ ส่วนประเภทบัญชีหลัก/ย่อยจะใช้ตอนบันทึกรายจ่ายลงรายจ่าย</p>
          </div>
          <span>{visibleStockItems.length} รายการ</span>
        </div>
        <div className="expense-database-table expense-stock-master-table" role="table" aria-label="วัตถุดิบที่ลงสต็อก">
          <div className="expense-database-row is-head" role="row">
            <span>รายการ</span>
            <span>ประเภทไว้ดูในเว็บ</span>
            <span>ประเภทบัญชีหลัก</span>
            <span>ประเภทย่อยบัญชี</span>
          </div>
          {visibleStockItems.map((ingredient) => {
            const expenseCategory = ingredient.expenseCategory || defaultIngredientExpenseCategory;
            const ingredientSubcategories = subcategories.filter((subcategory) => subcategory.category === expenseCategory);
            return (
              <div className="expense-database-row" key={ingredient.id} role="row">
                <label className="expense-database-cell">
                  <span className="sr-only">รายการ</span>
                  <input value={ingredient.name || ""} onChange={(event) => updateIngredientExpenseMeta(ingredient.id, { name: event.target.value })} />
                </label>
                <span className="expense-database-muted">{ingredient.category || "อื่นๆ"} · {ingredient.unit || "ชิ้น"}</span>
                <label className="expense-database-cell">
                  <span className="sr-only">ประเภทบัญชีหลัก</span>
                  <select value={expenseCategory} onChange={(event) => {
                    const category = event.target.value;
                    updateIngredientExpenseMeta(ingredient.id, {
                      expenseCategory: category,
                      expenseSubcategory: firstExpenseSubcategory(category, subcategories),
                    });
                  }}>{masterCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                </label>
                <label className="expense-database-cell">
                  <span className="sr-only">ประเภทย่อยบัญชี</span>
                  <select value={ingredient.expenseSubcategory || ""} onChange={(event) => updateIngredientExpenseMeta(ingredient.id, { expenseSubcategory: event.target.value })}>
                    {!ingredientSubcategories.some((subcategory) => subcategory.name === ingredient.expenseSubcategory) && ingredient.expenseSubcategory ? <option value={ingredient.expenseSubcategory}>{ingredient.expenseSubcategory}</option> : null}
                    {ingredientSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>)}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
        <div className="expense-database-section-title">
          <div>
            <h3>ค่าใช้จ่ายทั่วไป</h3>
            <p>รายการที่ไม่เพิ่มสต็อก แต่ยังมีประเภทบัญชีหลัก/ย่อยเหมือนกัน</p>
          </div>
          <span>{visibleItems.length} รายการ</span>
        </div>
        <div className="expense-database-table" role="table" aria-label="ค่าใช้จ่ายทั่วไป">
          <div className="expense-database-row general-expense-row is-head" role="row">
            <span>รายการ</span>
            <span>ประเภทหลัก</span>
            <span>ประเภทย่อย</span>
            <span>หน่วย / สถานะ</span>
            <span>{reorderMode ? "ลำดับ" : ""}</span>
          </div>
          {visibleItems.map((item) => {
            const absoluteIndex = items.findIndex((candidate) => candidate.id === item.id);
            return (
              <div
                className={`expense-database-row general-expense-row is-clickable ${item.active === false ? "is-inactive" : ""}`}
                key={item.id}
                onClick={() => openEditor(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") openEditor(item);
                }}
                role="button"
                tabIndex={0}
              >
                <strong>{item.name}</strong>
                <span>{item.category}</span>
                <span>{item.subcategory || "ทั่วไป"}</span>
                <small>{item.unit ? `${item.unit} · ` : ""}{item.active === false ? "ปิดใช้งาน" : "เปิดใช้งาน"}</small>
                <span className="expense-database-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  {reorderMode ? (
                    <>
                      <ReorderPositionInput label={item.name} max={items.length} onMove={(position) => moveItemTo(item.id, position)} value={absoluteIndex + 1} />
                      <button aria-label={`เลื่อน ${item.name} ขึ้น`} disabled={absoluteIndex === 0} onClick={(event) => { event.stopPropagation(); moveItem(item.id, -1); }} type="button"><ChevronUp size={15} /></button>
                      <button aria-label={`เลื่อน ${item.name} ลง`} disabled={absoluteIndex === items.length - 1} onClick={(event) => { event.stopPropagation(); moveItem(item.id, 1); }} type="button"><ChevronDown size={15} /></button>
                    </>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <section className="expense-category-manager">
          <div className="expense-category-manager-head">
            <strong>ประเภทหลัก</strong>
            <button className="ghost-button" onClick={openCategoryDialog} type="button"><Plus size={16} /> เพิ่มประเภทหลัก</button>
          </div>
          <div className="expense-category-chips">{masterCategories.map((category) => (
            <span key={category}>
              {category}
              <button aria-label={`ลบประเภท ${category}`} disabled={category === defaultIngredientExpenseCategory} onClick={() => setCategoryDeleteTarget(category)} type="button"><Trash2 size={14} /></button>
            </span>
          ))}</div>
        </section>
        <section className="expense-category-manager">
          <div className="expense-category-manager-head">
            <strong>ประเภทย่อย</strong>
            <button className="ghost-button" onClick={openSubcategoryDialog} type="button"><Plus size={16} /> เพิ่มประเภทย่อย</button>
          </div>
          <div className="expense-category-chips">{subcategories.map((subcategory) => (
            <span key={subcategory.id}>
              {subcategory.category} / {subcategory.name}
              <button aria-label={`ลบประเภทย่อย ${subcategory.name}`} onClick={() => setSubcategoryDeleteTarget(subcategory)} type="button"><Trash2 size={14} /></button>
            </span>
          ))}</div>
        </section>
      </div>
      {editorOpen ? (
        <form className="side-editor" onSubmit={saveItem}>
          <div className="panel-title">
            <ReceiptText size={20} />
            <h3>{selected ? "แก้ไขรายจ่ายทั่วไป" : "เพิ่มรายจ่ายทั่วไป"}</h3>
            <button className="icon-close-button" onClick={closeEditor} type="button">ปิด</button>
          </div>
          <label>ชื่อรายการ<input autoFocus value={form.name || ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>ประเภทหลัก<select value={form.category || masterCategories[0] || ""} onChange={(event) => {
            const category = event.target.value;
            setForm((current) => ({
              ...current,
              category,
              subcategory: firstExpenseSubcategory(category, subcategories),
            }));
          }}>{masterCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>ประเภทย่อย<select value={form.subcategory || ""} onChange={(event) => setForm((current) => ({ ...current, subcategory: event.target.value }))}>
            {!formSubcategories.some((item) => item.name === form.subcategory) && form.subcategory ? <option value={form.subcategory}>{form.subcategory}</option> : null}
            {formSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>)}
          </select></label>
          <label>หน่วยนับ (ไม่บังคับ)<input value={form.unit || ""} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} placeholder="เว้นว่างได้ เช่น ค่าส่ง เงินเดือน ค่าเช่า" /></label>
          <label>หมายเหตุ<input value={form.note || ""} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
          <label className="check-line"><input checked={form.active !== false} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /> เปิดใช้งาน</label>
          <div className="modal-actions">
            <button className="primary-button" type="submit"><Save size={18} /> บันทึก</button>
            {selected ? <button className="danger-button" onClick={() => setDeleteTarget(selected)} type="button">ลบรายการ</button> : null}
          </div>
        </form>
      ) : null}
      {categoryDialogOpen ? (
        <div className="modal-backdrop">
          <form className="modal-card category-dialog-card" onSubmit={addCategory}>
            <h3>เพิ่มประเภทหลัก</h3>
            <label>ชื่อประเภทหลัก<input autoFocus value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="เช่น ค่าแรง, ของใช้ร้าน" /></label>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setCategoryDialogOpen(false)} type="button">ยกเลิก</button>
              <button className="primary-button" type="submit"><Plus size={17} /> เพิ่ม</button>
            </div>
          </form>
        </div>
      ) : null}
      {subcategoryDialogOpen ? (
        <div className="modal-backdrop">
          <form className="modal-card category-dialog-card" onSubmit={addSubcategory}>
            <h3>เพิ่มประเภทย่อย</h3>
            <label>ประเภทหลัก<select value={newSubcategoryCategory} onChange={(event) => setNewSubcategoryCategory(event.target.value)}>
              {masterCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select></label>
            <label>ชื่อประเภทย่อย<input autoFocus value={newSubcategory} onChange={(event) => setNewSubcategory(event.target.value)} placeholder="เช่น เนื้อสัตว์, ค่าขนส่ง" /></label>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setSubcategoryDialogOpen(false)} type="button">ยกเลิก</button>
              <button className="primary-button" type="submit"><Plus size={17} /> เพิ่ม</button>
            </div>
          </form>
        </div>
      ) : null}
      {deleteTarget ? <ConfirmDialog title="ลบรายจ่ายทั่วไป" message={`ต้องการลบ “${deleteTarget.name}” จากฐานข้อมูลใช่ไหม? ประวัติรายจ่ายเดิมจะไม่ถูกลบ`} onCancel={() => setDeleteTarget(null)} onConfirm={removeItem} /> : null}
      {categoryDeleteTarget ? <ConfirmDialog title="ลบประเภทค่าใช้จ่าย" message={`ต้องการลบประเภท “${categoryDeleteTarget}” ใช่ไหม? รายการในประเภทนี้จะถูกย้ายไปประเภทอื่น`} onCancel={() => setCategoryDeleteTarget("")} onConfirm={removeCategory} /> : null}
      {subcategoryDeleteTarget ? <ConfirmDialog title="ลบประเภทย่อย" message={`ต้องการลบประเภทย่อย “${subcategoryDeleteTarget.name}” ใช่ไหม? รายการในประเภทย่อยนี้จะถูกย้ายไปประเภทย่อยอื่น`} onCancel={() => setSubcategoryDeleteTarget(null)} onConfirm={removeSubcategory} /> : null}
    </section>
  );
}

function ExpenseScreen({ generalExpenseCategories, generalExpenseItems, generalExpenseSubcategories, ingredients, onAddIngredient, onAddPurchaseUnit, onDeleteExpense, onRecord, purchaseUnits, recentExpenses, setGeneralExpenseCategories, setGeneralExpenseItems, setGeneralExpenseSubcategories, setIngredients, setView, view }) {
  const [draft, setDraft] = usePersistentState("burger-pos.expenseDraft", makeEmptyExpenseDraft());
  const [leavingRowIds, setLeavingRowIds] = useState([]);
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const normalizedDraft = normalizeExpenseDraft(draft);
  const expenseDate = normalizedDraft.expenseDate;
  const rows = normalizedDraft.rows;
  const previewItems = rows.map((row) => buildExpenseItem(row, ingredients, purchaseUnits, generalExpenseItems)).filter(Boolean);
  const totalAmount = previewItems.reduce((sum, item) => sum + item.lineTotal, 0);

  function setExpenseDate(value) {
    setDraft((current) => ({ ...normalizeExpenseDraft(current), expenseDate: value }));
  }

  function setRows(updater) {
    setDraft((current) => {
      const normalized = normalizeExpenseDraft(current);
      const nextRows = typeof updater === "function" ? updater(normalized.rows) : updater;
      return { ...normalized, rows: nextRows.length ? nextRows : [blankExpenseRow()] };
    });
  }

  function updateRow(id, patch) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, blankExpenseRow()]);
  }

  function removeRow(id) {
    setRows((current) => current.filter((row) => row.id !== id));
    setLeavingRowIds((current) => current.filter((rowId) => rowId !== id));
  }

  async function submitExpenses() {
    const invalidRowIndex = rows.findIndex((row) => {
      const hasInput = Boolean(row.ingredientId || row.generalExpenseItemId || row.ingredientSearch || row.generalExpenseSearch || row.name || row.quantity || row.unitPrice);
      if (!hasInput) return false;
      if (row.mode === "custom" && (!row.generalExpenseSearch?.trim() || !row.category || !row.subcategory)) return true;
      if (row.mode === "ingredient" && (!row.ingredientId || !row.purchaseUnitId || row.purchaseUnitId === "__new_unit__")) return true;
      return Number(row.quantity || 0) <= 0 || Number(row.unitPrice || 0) <= 0;
    });
    if (invalidRowIndex >= 0) {
      alert(`แถวที่ ${invalidRowIndex + 1}: กรุณากรอกรายการ ประเภท จำนวน และราคาให้ครบ`);
      return;
    }
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
    const result = await onRecord(expense);
    setDraft(makeEmptyExpenseDraft());
    setSaveNotice({ count: previewItems.length, totalAmount, testMode: result?.testMode === true });
  }

  function createIngredientFromExpense({ name, unit, stock, minimumStock, purchaseLabel, ratio }) {
    const newIngredient = {
      id: `ing_${Date.now()}`,
      name,
      unit,
      category: inferIngredientCategory(name),
      expenseCategory: defaultIngredientExpenseCategory,
      expenseSubcategory: firstExpenseSubcategory(defaultIngredientExpenseCategory, generalExpenseSubcategories) || defaultIngredientExpenseSubcategory,
      stock: Number(stock || 0),
      minimumStock: Number(minimumStock || 0),
    };
    onAddIngredient(newIngredient);
    if (Number.isFinite(ratio) && ratio > 0) {
      const timestamp = new Date().toISOString();
      onAddPurchaseUnit((current) => [...current, { id: `unit_${Date.now()}`, ingredientId: newIngredient.id, label: purchaseLabel, ratio, baseUnit: unit, createdAt: timestamp, updatedAt: timestamp }]);
    }
    setRows((current) => current.map((row, index) => (
      index === 0
        ? { ...row, mode: "ingredient", ingredientId: newIngredient.id, ingredientSearch: newIngredient.name, purchaseUnitId: "" }
        : row
    )));
    setIngredientModalOpen(false);
  }

  if (view === "history") {
    return <ExpenseHistoryPanel expenses={recentExpenses} onBack={() => setView("entry")} onDeleteExpense={onDeleteExpense} />;
  }
  if (view === "master") {
    return (
      <GeneralExpenseMasterScreen
        categories={generalExpenseCategories}
        ingredients={ingredients}
        items={generalExpenseItems}
        setCategories={setGeneralExpenseCategories}
        setIngredients={setIngredients}
        setItems={setGeneralExpenseItems}
        setSubcategories={setGeneralExpenseSubcategories}
        subcategories={generalExpenseSubcategories}
      />
    );
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
          <div className="expense-helper-actions">
            <span>ไม่มีวัตถุดิบในรายการ?</span>
            <button className="ghost-button subtle-button" onClick={() => setIngredientModalOpen(true)} type="button">เพิ่มวัตถุดิบใหม่</button>
          </div>
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
              generalExpenseCategories={generalExpenseCategories}
              generalExpenseItems={generalExpenseItems}
              generalExpenseSubcategories={generalExpenseSubcategories}
              ingredients={ingredients}
              isLeaving={leavingRowIds.includes(row.id)}
              key={row.id}
              onAddPurchaseUnit={onAddPurchaseUnit}
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
      {saveNotice ? (
        <div className="modal-backdrop success-modal-backdrop">
          <div className="modal-card success-modal-card">
            <h3>{saveNotice.testMode ? "ทดสอบรายจ่ายสำเร็จ" : "บันทึกรายจ่ายสำเร็จ"}</h3>
            <p>{saveNotice.testMode ? "โหมดทดสอบ ไม่บันทึกข้อมูลจริง ไม่เพิ่มสต็อก และไม่ส่ง Google Sheet" : `บันทึก ${saveNotice.count} รายการ รวม ${money(saveNotice.totalAmount)} บาท`}</p>
            <button className="primary-button" onClick={() => setSaveNotice(null)} type="button">ตกลง</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ExpenseEntryRow({ generalExpenseCategories, generalExpenseItems, generalExpenseSubcategories, ingredients, isLeaving, onAddPurchaseUnit, onRemove, purchaseUnits, row, rowNumber, updateRow }) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [generalSuggestionsOpen, setGeneralSuggestionsOpen] = useState(false);
  const [unitDraft, setUnitDraft] = useState({ label: "", ratio: "" });
  const selectedIngredient = ingredients.find((item) => item.id === row.ingredientId);
  const selectedGeneralExpense = generalExpenseItems.find((item) => item.id === row.generalExpenseItemId);
  const availableUnits = purchaseUnits.filter((unit) => unit.ingredientId === row.ingredientId);
  const selectedUnit = availableUnits.find((unit) => unit.id === row.purchaseUnitId);
  const quantity = Number(row.quantity || 0);
  const stockQuantity = row.mode === "ingredient" && selectedUnit ? quantity * Number(selectedUnit.ratio || 1) : 0;
  const ingredientSearch = row.ingredientSearch ?? selectedIngredient?.name ?? "";
  const activeGeneralExpenses = generalExpenseItems.filter((item) => item.active !== false);
  const ingredientSuggestions = rankSearchMatches(ingredients, ingredientSearch, (item) => item.name).slice(0, 8);
  const generalExpenseSearch = row.generalExpenseSearch ?? selectedGeneralExpense?.name ?? row.name ?? "";
  const generalExpenseSuggestions = rankSearchMatches(activeGeneralExpenses, generalExpenseSearch, (item) => (
    `${item.name} ${item.category || ""} ${item.subcategory || ""}`
  )).slice(0, 8);
  const availableGeneralSubcategories = generalExpenseSubcategories.filter((item) => item.category === row.category);

  useEffect(() => {
    if (row.mode !== "custom" || !selectedGeneralExpense) return;
    const expectedSubcategory = selectedGeneralExpense.subcategory
      || firstExpenseSubcategory(selectedGeneralExpense.category, generalExpenseSubcategories);
    if (
      row.generalExpenseSearch === selectedGeneralExpense.name
      && row.category === selectedGeneralExpense.category
      && row.subcategory === expectedSubcategory
      && row.generalUnit === selectedGeneralExpense.unit
    ) return;
    updateRow(row.id, {
      generalExpenseSearch: selectedGeneralExpense.name,
      name: selectedGeneralExpense.name,
      category: selectedGeneralExpense.category || "",
      subcategory: expectedSubcategory,
      generalUnit: selectedGeneralExpense.unit || "",
    });
  }, [
    generalExpenseSubcategories,
    row.category,
    row.generalExpenseItemId,
    row.generalExpenseSearch,
    row.generalUnit,
    row.id,
    row.mode,
    row.subcategory,
    selectedGeneralExpense,
  ]);

  function selectMode(mode) {
    if (mode === "ingredient") {
      updateRow(row.id, {
        mode,
        ingredientId: row.ingredientId || "",
        ingredientSearch: row.ingredientSearch || "",
      });
      return;
    }
    updateRow(row.id, {
      mode: "custom",
      generalExpenseItemId: row.generalExpenseItemId || "",
      generalExpenseSearch: row.generalExpenseSearch || row.name || "",
      category: row.category || defaultNonStockExpenseCategory(generalExpenseCategories),
      subcategory: row.subcategory || firstExpenseSubcategory(defaultNonStockExpenseCategory(generalExpenseCategories), generalExpenseSubcategories),
      generalUnit: row.generalUnit || "",
    });
  }

  function handlePurchaseUnitChange(value) {
    if (value === "__new_unit__") {
      setUnitDraft({ label: "", ratio: "" });
      updateRow(row.id, { purchaseUnitId: "__new_unit__" });
      return;
    }
    updateRow(row.id, { purchaseUnitId: value });
  }

  function saveInlinePurchaseUnit() {
    if (!selectedIngredient) return;
    const ratio = Number(unitDraft.ratio || 0);
    if (!unitDraft.label.trim() || !ratio) return;
    const timestamp = new Date().toISOString();
    const nextUnit = {
      id: `unit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ingredientId: selectedIngredient.id,
      label: unitDraft.label.trim(),
      ratio,
      baseUnit: selectedIngredient.unit,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    onAddPurchaseUnit((current) => [...current, nextUnit]);
    updateRow(row.id, { purchaseUnitId: nextUnit.id });
    setUnitDraft({ label: "", ratio: "" });
  }

  function updateIngredientSearch(value) {
    const normalized = value.trim().toLowerCase();
    const exact = ingredients.find((ingredient) => ingredient.name.toLowerCase() === normalized);
    const matched = exact || null;
    const ingredientChanged = matched && matched.id !== row.ingredientId;
    updateRow(row.id, {
      ingredientSearch: value,
      ...(!matched && value !== selectedIngredient?.name ? { ingredientId: "", purchaseUnitId: "" } : {}),
      ...(matched ? {
        ingredientId: matched.id,
        ingredientSearch: matched.name,
        ...(ingredientChanged ? { purchaseUnitId: "" } : {}),
      } : {}),
    });
  }

  function selectGeneralExpense(item) {
    updateRow(row.id, {
      generalExpenseItemId: item.id,
      generalExpenseSearch: item.name,
      name: item.name,
      category: item.category || "",
      subcategory: item.subcategory || firstExpenseSubcategory(item.category, generalExpenseSubcategories),
      generalUnit: item.unit || "",
    });
    setGeneralSuggestionsOpen(false);
  }

  function updateGeneralExpenseSearch(value) {
    const normalized = value.trim().toLowerCase();
    const exact = activeGeneralExpenses.find((item) => item.name.toLowerCase() === normalized);
    if (exact) {
      selectGeneralExpense(exact);
      return;
    }
    updateRow(row.id, {
      generalExpenseItemId: "",
      generalExpenseSearch: value,
      name: value,
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
              updateIngredientSearch(event.target.value);
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
            onBlur={(event) => {
              window.setTimeout(() => setGeneralSuggestionsOpen(false), 120);
              updateGeneralExpenseSearch(event.target.value);
            }}
            onChange={(event) => {
              setGeneralSuggestionsOpen(true);
              updateGeneralExpenseSearch(event.target.value);
            }}
            onFocus={() => setGeneralSuggestionsOpen(true)}
            placeholder="พิมพ์ค้นหารายจ่าย"
            value={generalExpenseSearch}
          />
          {generalSuggestionsOpen && generalExpenseSuggestions.length ? (
            <div className="ingredient-suggestion-list general-expense-suggestion-list">
              {generalExpenseSuggestions.map((item) => (
                <button
                  key={item.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectGeneralExpense(item);
                  }}
                  type="button"
                >
                  <span>{item.name}<small>{item.category} / {item.subcategory || "ทั่วไป"}</small></span>
                  <small>{item.unit}</small>
                </button>
              ))}
            </div>
          ) : null}
        </label>
      )}
      {row.mode === "ingredient" ? (
        <label className="expense-field">
          <span className="expense-field-label">หน่วยซื้อ</span>
          <select
            aria-label={`หน่วยซื้อแถว ${rowNumber}`}
            disabled={!selectedIngredient}
            value={row.purchaseUnitId === "__new_unit__" ? "__new_unit__" : selectedUnit?.id || ""}
            onChange={(event) => handlePurchaseUnitChange(event.target.value)}
          >
            <option value="">เลือกหน่วยซื้อ</option>
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>1 {unit.label} = {money(unit.ratio)} {unit.baseUnit}</option>
            ))}
            {selectedIngredient ? <option value="__new_unit__">+ เพิ่มหน่วยซื้อใหม่</option> : null}
          </select>
          {selectedIngredient && row.purchaseUnitId === "__new_unit__" ? (
            <div className="inline-unit-create">
              <input
                aria-label={`ชื่อหน่วยซื้อใหม่แถว ${rowNumber}`}
                onChange={(event) => setUnitDraft((current) => ({ ...current, label: event.target.value }))}
                placeholder="เช่น แพ็ค, ถุง, กล่อง"
                value={unitDraft.label}
              />
              <input
                aria-label={`ตัวคูณหน่วยซื้อใหม่แถว ${rowNumber}`}
                inputMode="decimal"
                min="0"
                onChange={(event) => setUnitDraft((current) => ({ ...current, ratio: event.target.value }))}
                placeholder={`1 หน่วย = กี่ ${selectedIngredient.unit}`}
                type="number"
                value={unitDraft.ratio}
              />
              <button className="ghost-button" onClick={saveInlinePurchaseUnit} type="button">บันทึกหน่วย</button>
            </div>
          ) : null}
        </label>
      ) : null}
      {row.mode === "custom" ? (
        <>
          <label className="expense-field">
            <span className="expense-field-label">ประเภทหลัก</span>
            <select
              aria-label={`ประเภทหลักแถว ${rowNumber}`}
              onChange={(event) => {
                const category = event.target.value;
                updateRow(row.id, {
                  category,
                  subcategory: firstExpenseSubcategory(category, generalExpenseSubcategories),
                });
              }}
              value={row.category || ""}
            >
              <option value="">เลือกประเภทหลัก</option>
              {generalExpenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="expense-field">
            <span className="expense-field-label">ประเภทย่อย</span>
            <select
              aria-label={`ประเภทย่อยแถว ${rowNumber}`}
              onChange={(event) => updateRow(row.id, { subcategory: event.target.value })}
              value={row.subcategory || ""}
            >
              <option value="">เลือกประเภทย่อย</option>
              {!availableGeneralSubcategories.some((item) => item.name === row.subcategory) && row.subcategory ? <option value={row.subcategory}>{row.subcategory}</option> : null}
              {availableGeneralSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>)}
            </select>
          </label>
          <label className="expense-field">
            <span className="expense-field-label">หน่วยนับ</span>
            <input
              aria-label={`หน่วยรายจ่ายแถว ${rowNumber}`}
              onChange={(event) => updateRow(row.id, { generalUnit: event.target.value })}
              placeholder="ไม่บังคับ"
              value={row.generalUnit || ""}
            />
          </label>
        </>
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
          {selectedIngredient && selectedUnit
            ? `+${money(stockQuantity)} ${selectedIngredient.unit} · ${(selectedIngredient.expenseCategory || defaultIngredientExpenseCategory)} / ${(selectedIngredient.expenseSubcategory || defaultIngredientExpenseSubcategory)}`
            : selectedIngredient ? "เลือกหน่วยซื้อ" : "เลือกวัตถุดิบ"}
        </span>
      ) : (
        <span className="general-expense-preview">
          {row.category && row.subcategory
            ? `${row.category} / ${row.subcategory} · ไม่เพิ่มสต็อก`
            : "ระบุประเภทหลักและย่อย"}
        </span>
      )}
      <button aria-label={`ลบแถว ${rowNumber}`} onClick={onRemove} type="button"><Trash2 size={16} /></button>
    </div>
  );
}

function NewIngredientModal({ onClose, onSubmit }) {
  const { backdropRef, closeWithAnimation } = useAnimeModal(onClose, modifierModalChildren);
  const [form, setForm] = useState({ name: "", unit: "ชิ้น", stock: "0", minimumStock: "0", purchaseLabel: "แพ็ค", ratio: "1" });

  function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({
      name: form.name.trim(),
      unit: form.unit.trim() || "ชิ้น",
      stock: Number(form.stock || 0),
      minimumStock: Number(form.minimumStock || 0),
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
          <label>คงเหลือเริ่มต้น<input inputMode="decimal" min="0" type="number" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} /></label>
          <label>แจ้งเตือนเมื่อเหลือ<input inputMode="decimal" min="0" type="number" value={form.minimumStock} onChange={(event) => setForm((current) => ({ ...current, minimumStock: event.target.value }))} /></label>
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

function SettingsScreen({ clearPrintQueue, flushLineQueue, flushPrintQueue, flushSheetQueue, onResetData, orders, queueLists, refreshQueues, setSettings, settings }) {
  const [activeSection, setActiveSection] = useState("printer");
  const [printerNotice, setPrinterNotice] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const [resetArmed, setResetArmed] = useState("");
  const [bluetoothDevices, setBluetoothDevices] = useState([]);
  const [developerUnlocked, setDeveloperUnlocked] = useState(false);
  const [developerPin, setDeveloperPin] = useState("");
  const [developerNotice, setDeveloperNotice] = useState("");
  const receiptTemplateValue = settings.receiptTemplate?.includes("[TOTAL (price*quantity)]") ? settings.receiptTemplate : defaultSettings.receiptTemplate;
  const bridgeMethodValue = settings.bridgeMethod === "RAWBT_INTENT" ? "RAWBT_INTENT" : /^wss?:\/\//i.test(settings.bridgeUrl || "") ? "RAWBT_WS" : settings.bridgeMethod || "POST";
  const basicSections = [
    { id: "printer", label: "เครื่องพิมพ์", icon: Printer },
    { id: "sale", label: "การขาย", icon: Store },
    { id: "orders", label: "ประวัติออร์เดอร์", icon: ReceiptText },
    { id: "developer", label: "โหมดผู้พัฒนา", icon: SlidersHorizontal },
  ];
  const developerSections = [
    { id: "thaiPrototype", label: "ทดสอบพิมพ์ไทย", icon: FileImage },
    { id: "sync", label: "Google Sheet", icon: Database },
    { id: "line", label: "LINE แจ้งเตือน", icon: Bell },
    { id: "data", label: "ล้างข้อมูล", icon: Trash2 },
  ];
  const sections = developerUnlocked ? [...basicSections, ...developerSections] : basicSections;
  const nativeThaiPrinterAvailable = isNativeThaiPrinterAvailable();

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

  function unlockDeveloperMode(event) {
    event.preventDefault();
    if (developerPin === String(settings.developerPin || defaultSettings.developerPin)) {
      setDeveloperUnlocked(true);
      setDeveloperPin("");
      setDeveloperNotice("เปิดโหมดผู้พัฒนาแล้ว");
      return;
    }
    setDeveloperNotice("รหัสโหมดผู้พัฒนาไม่ถูกต้อง");
  }

  function applyPos8390Preset() {
    setSettings((current) => ({
      ...current,
      printerModel: "POS-8390",
      printerConnection: current.printerConnection || "BLUETOOTH_NATIVE",
      paperSize: "80mm",
      printerPort: "9100",
      bluetoothPrintTimeoutMs: 20000,
      bluetoothPrintChunkSize: 320,
      bluetoothPrintChunkDelayMs: 2,
      bluetoothPrintFinalDelayMs: 2200,
      bridgeMethod: "RAWBT_INTENT",
      thaiCodePage: "20",
      nativeThaiRenderMode: "BITMAP",
      bridgeUrl: "ws://127.0.0.1:40213/",
    }));
    setPrinterNotice("ใช้ preset POS-8390: Bluetooth Native, กระดาษ 80mm, ส่งข้อมูลแบบ chunk ที่ทดสอบผ่านแล้ว");
  }

  function applyBurgerSheetPreset() {
    update("sheetId", BURGER_POS_SHEET_ID);
  }

  function updateBridgeMethod(value) {
    setSettings((current) => ({
      ...current,
      bridgeMethod: value,
      bridgeUrl: value === "RAWBT_WS" && !/^wss?:\/\//i.test(current.bridgeUrl || "")
        ? "ws://127.0.0.1:40213/"
        : current.bridgeUrl,
    }));
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
    const status = storeName === "printJobs" ? "PRINTED" : storeName === "lineNotifyJobs" ? "SENT" : "SYNCED";
    await updateLocalJob(storeName, { ...job, status });
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

  async function runThaiCodePageTest() {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      await printThaiCodePageTest(settings);
      setPrinterNotice("ส่งใบเทสภาษาไทยหลาย code page แล้ว ดูว่าบรรทัด PAGE ไหนอ่านไทยได้ชัดที่สุด");
    } catch (error) {
      setPrinterNotice(`ส่งเทสภาษาไทยไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function runNativeThaiCodePageSweep() {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      const result = await printAndroidBluetoothThaiCodePageSweep({
        address: settings.bluetoothPrinterAddress,
        start: 0,
        end: 255,
      });
      setPrinterNotice(`ส่งใบเทส Thai code page 0-255 แล้ว (${result?.bytesWritten || 0} bytes) ให้ดูบรรทัด CP ที่อ่านไทยถูก`);
    } catch (error) {
      setPrinterNotice(`ส่งเทส Thai code page ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function runBridgeTest() {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      await testPrintBridge(settings);
      setPrinterNotice("เชื่อมต่อ RawBT WebSocket ได้แล้ว");
    } catch (error) {
      setPrinterNotice(`เชื่อมต่อไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function sendPendingPrintQueue() {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      await flushPrintQueue();
      setPrinterNotice(settings.printingPaused ? "ยังไม่ได้ส่งคิว เพราะเปิดหยุดพิมพ์ชั่วคราวอยู่" : "ส่งคิวพิมพ์ค้างแล้ว ตรวจสถานะใน Print Queue");
    } catch (error) {
      setPrinterNotice(`ส่งคิวไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function clearPendingPrintQueue() {
    if (!clearPrintQueue) return;
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      await clearPrintQueue();
      setPrinterNotice("ล้างคิวพิมพ์ค้างทั้งหมดแล้ว");
    } catch (error) {
      setPrinterNotice(`ล้างคิวพิมพ์ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function sendPendingSheetQueue() {
    setSyncBusy(true);
    setSyncNotice("");
    try {
      if (settings.testModeEnabled === true) {
        setSyncNotice("โหมดทดสอบเปิดอยู่: ไม่ส่งคิวจริงไป Google Sheet");
        return;
      }
      await flushSheetQueue();
      setSyncNotice("ส่งคิว Google Sheet แล้ว ตรวจสถานะรายการค้างด้านล่าง");
    } catch (error) {
      setSyncNotice(`ส่งคิว Google Sheet ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }

  async function sendPendingLineQueue() {
    setSyncBusy(true);
    setSyncNotice("");
    try {
      if (settings.testModeEnabled === true) {
        setSyncNotice("โหมดทดสอบเปิดอยู่: ไม่ส่งคิวจริงไป LINE");
        return;
      }
      await flushLineQueue();
      setSyncNotice("ส่งคิวแจ้งเตือน LINE แล้ว ตรวจสถานะรายการค้างด้านล่าง");
    } catch (error) {
      setSyncNotice(`ส่งคิว LINE ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }

  function runSheetDryRun() {
    const now = new Date().toISOString();
    const sampleOrder = {
      id: `DRY-RUN-${Date.now()}`,
      orderNo: makeTestOrderNo(),
      createdAt: now,
      salesChannel: "store",
      paymentMethod: "CASH",
      totalAmount: 1,
      cashReceived: 1,
      changeDue: 0,
      shiftId: "TEST-SHIFT",
      paymentStatus: "PAID",
      isTest: true,
      note: "TEST MODE - not saved",
      items: [
        {
          productId: "TEST-PRODUCT",
          name: "TEST ITEM",
          quantity: 1,
          unitPrice: 1,
          modifiers: ["TEST ADD ON"],
          note: "",
        },
      ],
    };
    const job = makeOrderSheetJob(sampleOrder, []);
    const tabs = Array.from(new Set((job.rows || []).map((row) => row.tab))).join(", ");
    setSyncNotice(`จำลองข้อมูล Sheet สำเร็จ: ${job.rows?.length || 0} แถว (${tabs || "ไม่มีแท็บ"}) ไม่ได้ส่งข้อมูลจริง`);
  }

  async function runDataReset(mode) {
    if (!onResetData || resetBusy) return;
    if (resetArmed !== mode) {
      setResetArmed(mode);
      setResetNotice(mode === "all"
        ? "กดอีกครั้งเพื่อล้างทั้งระบบ รวมสินค้า หมวด ตัวเลือกเสริม และวัตถุดิบ"
        : "กดอีกครั้งเพื่อล้างข้อมูลทดลอง โดยเก็บสินค้า หมวด ตัวเลือกเสริม และวัตถุดิบไว้");
      return;
    }
    setResetBusy(true);
    setResetNotice("");
    try {
      await onResetData({ includeMasterData: mode === "all" });
      setResetNotice(mode === "all" ? "ล้างข้อมูลทั้งระบบแล้ว" : "ล้างข้อมูลทดลองแล้ว");
      setResetArmed("");
      await refreshQueues();
    } catch (error) {
      setResetNotice(`ล้างข้อมูลไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setResetBusy(false);
    }
  }

  async function runNativeThaiPrint(type) {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      const useBluetooth = settings.printerConnection === "BLUETOOTH_NATIVE";
      const result = useBluetooth
        ? await printAndroidBluetoothThaiPrototype({
          type,
          address: settings.bluetoothPrinterAddress,
        })
        : await printAndroidThaiPrototype({
          type,
          host: settings.printerIp,
          port: settings.printerPort || "9100",
        });
      setPrinterNotice(`ส่งงานพิมพ์ไทยสำเร็จ (${result?.bytesWritten || 0} bytes)`);
    } catch (error) {
      setPrinterNotice(`พิมพ์ไทยไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function loadBluetoothPrinters() {
    setPrinterBusy(true);
    setPrinterNotice("");
    try {
      const devices = await getAndroidBluetoothPrinters();
      setBluetoothDevices(devices);
      if (!settings.bluetoothPrinterAddress && devices[0]?.address) {
        update("bluetoothPrinterAddress", devices[0].address);
      }
      setPrinterNotice(devices.length ? `พบเครื่อง Bluetooth ที่จับคู่ไว้ ${devices.length} เครื่อง` : "ยังไม่พบเครื่องพิมพ์ Bluetooth ที่จับคู่ไว้");
    } catch (error) {
      setPrinterNotice(`อ่าน Bluetooth ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
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
      {activeSection === "developer" ? (
      <article className="settings-card settings-card-wide developer-card">
        <SlidersHorizontal size={24} />
        <h3>โหมดผู้พัฒนา</h3>
        <p>ใช้สำหรับเมนูที่มีผลกับข้อมูลจริงหรือการเชื่อมต่อภายนอก เช่น Google Sheet, LINE, ล้างข้อมูล และทดสอบพิมพ์ไทย</p>
        {!developerUnlocked ? (
          <form className="developer-lock-form" onSubmit={unlockDeveloperMode}>
            <label>รหัสผู้พัฒนา<input autoComplete="off" inputMode="numeric" type="password" value={developerPin} onChange={(event) => setDeveloperPin(event.target.value)} /></label>
            <button className="primary-button" type="submit">ปลดล็อก</button>
          </form>
        ) : (
          <>
            <div className="inline-confirm">โหมดผู้พัฒนาถูกเปิดอยู่ในเครื่องนี้</div>
            <div className="developer-shortcuts">
              {developerSections.map((section) => {
                const Icon = section.icon;
                return (
                  <button className="ghost-button" key={section.id} onClick={() => setActiveSection(section.id)} type="button">
                    <Icon size={18} />
                    {section.label}
                  </button>
                );
              })}
            </div>
            <button className="ghost-button" onClick={() => { setDeveloperUnlocked(false); setDeveloperNotice("ปิดโหมดผู้พัฒนาแล้ว"); }} type="button">ล็อกโหมดผู้พัฒนา</button>
          </>
        )}
        {developerNotice ? <div className={developerUnlocked ? "inline-confirm" : "inline-warning"}>{developerNotice}</div> : null}
      </article>
      ) : null}
      {activeSection === "sale" ? (
      <article className="settings-card settings-card-wide">
        <Store size={24} />
        <h3>การขายและสต็อก</h3>
        <p>ตั้งค่าว่าหน้าขายควรหยุดขายทันทีเมื่อวัตถุดิบไม่พอ หรือให้ขายต่อแล้วให้สต็อกติดลบเพื่อไปลงเติมย้อนหลัง</p>
        <label className="check-line"><input checked={settings.allowNegativeStockSales === true} onChange={(event) => update("allowNegativeStockSales", event.target.checked)} type="checkbox" /> อนุญาตให้ขายแม้วัตถุดิบไม่พอ</label>
        <div className={settings.allowNegativeStockSales === true ? "inline-warning" : "inline-confirm"}>
          {settings.allowNegativeStockSales === true
            ? "เปิดอยู่: ออเดอร์จะขายได้ต่อ และสต็อกวัตถุดิบอาจติดลบจนกว่าจะลงรายการเติมสต็อก"
            : "ปิดอยู่: ระบบจะบล็อกสินค้าเมื่อวัตถุดิบในสูตรไม่พอ เหมือนเดิม"}
        </div>
        <div className="settings-subsection test-mode-settings">
          <strong>โหมดทดสอบ</strong>
          <p>ใช้ซ้อมขาย ซ้อมพิมพ์ ซ้อมเปิดลิ้นชัก และเช็ค payload ที่จะส่งออก โดยไม่บันทึกออเดอร์ ไม่ตัดสต็อก ไม่เพิ่มสต็อกจากรายจ่าย และไม่ส่ง Google Sheet/LINE จริง</p>
          <label className="check-line test-mode-toggle">
            <input
              checked={settings.testModeEnabled === true}
              data-testid="settings-test-mode-toggle"
              onChange={(event) => update("testModeEnabled", event.target.checked)}
              type="checkbox"
            />
            เปิดโหมดทดสอบในเครื่องนี้
          </label>
          <div className={settings.testModeEnabled === true ? "inline-warning" : "inline-confirm"}>
            {settings.testModeEnabled === true
              ? "กำลังทดสอบ: หน้าขายกดออเดอร์ได้โดยไม่ต้องเปิดกะ และใบพิมพ์จะมีป้าย TEST MODE"
              : "ปิดอยู่: ทุกอย่างทำงานจริงตามปกติ"}
          </div>
        </div>
      </article>
      ) : null}
      {activeSection === "printer" ? (
      <article className="settings-card">
        <Printer size={24} />
        <h3>เครื่องพิมพ์ครัว</h3>
        <p>รองรับเครื่องพิมพ์ความร้อน 58/80mm แบบ ESC/POS ผ่าน RawBT หรือ local print bridge ในเครื่อง Android</p>
        <div className="settings-subsection">
          <strong>ค่าเริ่มต้นการพิมพ์</strong>
          <p>เลือกใบที่ต้องการพิมพ์อัตโนมัติ ใบครัว/ใบเสร็จใช้ตอนปิดออเดอร์ ส่วนใบสรุปปิดกะใช้ตอนปิดกะ</p>
          <label className="check-line"><input checked={settings.defaultPrintOptions?.kitchen !== false} onChange={(event) => updateDefaultPrintOption("kitchen", event.target.checked)} type="checkbox" /> พิมพ์ใบครัวอัตโนมัติ</label>
          <label className="check-line"><input checked={settings.defaultPrintOptions?.receipt === true} onChange={(event) => updateDefaultPrintOption("receipt", event.target.checked)} type="checkbox" /> พิมพ์ใบเสร็จอัตโนมัติ</label>
          <label className="check-line"><input checked={settings.defaultPrintOptions?.shiftSummary !== false} onChange={(event) => updateDefaultPrintOption("shiftSummary", event.target.checked)} type="checkbox" /> พิมพ์ใบสรุปปิดกะอัตโนมัติ</label>
          <label className="check-line"><input checked={settings.printingPaused === true} onChange={(event) => update("printingPaused", event.target.checked)} type="checkbox" /> หยุดส่งคิวพิมพ์ชั่วคราว</label>
        </div>
        <div className="printer-preset-card">
          <strong>POS-8390 Thermal Receipt Printer</strong>
          <span>USB + LAN + BT + WiFi · กระดาษ 80mm · ESC/POS · RAW TCP port 9100</span>
          <button className="ghost-button" onClick={applyPos8390Preset} type="button">ใช้ preset POS-8390</button>
        </div>
        <label>รุ่นเครื่องพิมพ์<input value={settings.printerModel || "POS-8390"} onChange={(event) => update("printerModel", event.target.value)} /></label>
        <label>รูปแบบการเชื่อมต่อ<select value={settings.printerConnection || "WIFI_LAN"} onChange={(event) => update("printerConnection", event.target.value)}>
          <option value="WIFI_LAN">WiFi / LAN ผ่าน IP</option>
          <option value="BLUETOOTH_NATIVE">Bluetooth Native</option>
          <option value="BLUETOOTH">Bluetooth ผ่าน RawBT</option>
          <option value="USB">USB ผ่านแอปตัวกลาง</option>
        </select></label>
        {settings.printerConnection === "BLUETOOTH_NATIVE" ? (
          <div className="settings-subsection">
            <strong>Bluetooth Native</strong>
            <p>จับคู่ POS-8390 กับแท็บเล็ตใน Android Settings ก่อน แล้วกดโหลดรายการเครื่องพิมพ์เพื่อเลือกเครื่องที่จะส่ง ESC/POS bitmap ภาษาไทย</p>
            <div className="settings-printer-actions">
              <button className="ghost-button" disabled={printerBusy || !nativeThaiPrinterAvailable} onClick={loadBluetoothPrinters} type="button"><RefreshCw size={18} /> โหลดเครื่องที่จับคู่ไว้</button>
            </div>
            <label>เครื่องพิมพ์ Bluetooth<select value={settings.bluetoothPrinterAddress || ""} onChange={(event) => update("bluetoothPrinterAddress", event.target.value)}>
              <option value="">เลือกเครื่องพิมพ์ที่จับคู่ไว้</option>
              {bluetoothDevices.map((device) => <option key={device.address} value={device.address}>{device.name || "Unknown printer"} ({device.address})</option>)}
              {settings.bluetoothPrinterAddress && !bluetoothDevices.some((device) => device.address === settings.bluetoothPrinterAddress) ? <option value={settings.bluetoothPrinterAddress}>เครื่องเดิม ({settings.bluetoothPrinterAddress})</option> : null}
            </select></label>
          </div>
        ) : null}
        <label>RawBT / Local bridge URL<input value={settings.bridgeUrl} onChange={(event) => update("bridgeUrl", event.target.value)} /></label>
        <label>วิธีส่งข้อมูล<select value={bridgeMethodValue} onChange={(event) => updateBridgeMethod(event.target.value)}><option value="RAWBT_INTENT">Android RawBT Text</option><option value="RAWBT_WS">RawBT WebSocket</option><option value="POST">POST text/plain</option><option value="GET">GET query data=</option></select></label>
        {settings.printerConnection !== "BLUETOOTH_NATIVE" ? (
          <>
            <label>IP เครื่องพิมพ์ Wi-Fi<input value={settings.printerIp} onChange={(event) => update("printerIp", event.target.value)} /></label>
            <label>Port เครื่องพิมพ์<input inputMode="numeric" value={settings.printerPort || "9100"} onChange={(event) => update("printerPort", event.target.value)} /></label>
          </>
        ) : null}
        <label>Thai code page<select value={settings.thaiCodePage === "42" ? "20" : settings.thaiCodePage || defaultSettings.thaiCodePage} onChange={(event) => update("thaiCodePage", event.target.value)}><option value="20">20 - Thai code 42 / KU42</option><option value="21">21 - Thai code 11 / TIS11</option><option value="22">22 - Thai code 13 / TIS13</option><option value="23">23 - Thai code 14 / TIS14</option><option value="24">24 - Thai code 16 / TIS16</option><option value="25">25 - Thai code 17 / TIS17</option><option value="26">26 - Thai code 18 / TIS18</option><option value="15">15 - Generic KU42 fallback</option><option value="16">16 - Generic TIS11 fallback</option><option value="255">255 - User page fallback</option></select></label>
        <label>โหมดพิมพ์ภาษาไทย<select value="BITMAP" onChange={() => update("nativeThaiRenderMode", "BITMAP")}><option value="BITMAP">Bitmap ผ่าน Bluetooth Classic / ใช้งานจริง</option></select></label>
        <label>ขนาดกระดาษ<select value={settings.paperSize} onChange={(event) => update("paperSize", event.target.value)}><option value="80mm">80mm</option><option value="58mm">58mm</option></select></label>
        <label className="check-line"><input checked={settings.cashDrawerEnabled !== false} onChange={(event) => update("cashDrawerEnabled", event.target.checked)} type="checkbox" /> เปิดลิ้นชักเงินสดหลังออเดอร์เงินสด</label>
        <label>ขาลิ้นชักเงินสด<select value={settings.cashDrawerPin || defaultSettings.cashDrawerPin} onChange={(event) => update("cashDrawerPin", event.target.value)}><option value="0">ขา 0 / มาตรฐาน</option><option value="1">ขา 1 / สำรอง</option></select></label>
        <label className="check-line"><input checked={settings.buzzerEnabled} onChange={(event) => update("buzzerEnabled", event.target.checked)} type="checkbox" /> เปิด Kitchen Buzzer</label>
        <div className="printer-help-box">
          <strong>หมายเหตุสำหรับรุ่น POS-8390</strong>
          <p>เลข 8390-V3.2 ในคู่มือมีแนวโน้มเป็นเวอร์ชันคู่มือ/เฟิร์มแวร์/แพ็กเกจ ไม่ใช่เลข IP หรือ port ของเครื่องพิมพ์</p>
          <p>ปุ่ม RawBT ด้านล่างเป็นโหมด fallback ภาษาอังกฤษเท่านั้น ถ้าต้องการภาษาไทยให้ใช้ปุ่ม Native Thai Bitmap ซึ่งทำงานในแอป Android ที่ติดตั้งจาก APK</p>
          <p>ถ้าใช้ Server for RawBT ให้เปิด Websocket API แล้วใช้ URL <strong>ws://127.0.0.1:40213/</strong> โดย 127.0.0.1 คือแท็บเล็ตเครื่องที่เปิดเว็บอยู่</p>
          <p>ถ้าตรวจการเชื่อมต่อไม่ผ่าน ให้ลองเปลี่ยน URL เป็น <strong>ws://localhost:40213/</strong> หรือใช้ IP ของแท็บเล็ต เช่น <strong>ws://192.168.1.xxx:40213/</strong></p>
          <a href="http://www.barcoderead.net/printer/8390.zip" rel="noreferrer" target="_blank">ดาวน์โหลด driver / utility จากคู่มือ</a>
        </div>
        <div className="settings-printer-actions">
          <button className="primary-button" disabled={printerBusy || !nativeThaiPrinterAvailable} onClick={() => runNativeThaiPrint("RECEIPT")} type="button"><Printer size={18} /> Native ใบเสร็จไทย</button>
          <button className="ghost-button" disabled={printerBusy || !nativeThaiPrinterAvailable} onClick={() => runNativeThaiPrint("KITCHEN")} type="button"><ReceiptText size={18} /> Native ใบออร์เดอร์ไทย</button>
          <button className="ghost-button" disabled={printerBusy} onClick={runBridgeTest} type="button"><Wifi size={18} /> ตรวจ RawBT</button>
          <button className="ghost-button" disabled={printerBusy} onClick={runPrinterTest} type="button"><Printer size={18} /> RawBT อังกฤษ</button>
          <button className="ghost-button" disabled={printerBusy} onClick={runThaiCodePageTest} type="button"><ReceiptText size={18} /> RawBT code page</button>
          <button className="ghost-button" disabled={printerBusy || !nativeThaiPrinterAvailable || settings.printerConnection !== "BLUETOOTH_NATIVE"} onClick={runNativeThaiCodePageSweep} type="button"><ReceiptText size={18} /> Native code page 0-255</button>
          <button className="ghost-button" disabled={printerBusy} onClick={sendPendingPrintQueue} type="button"><RefreshCw size={18} /> ส่งคิวค้าง</button>
          <button className="danger-button" disabled={printerBusy} onClick={clearPendingPrintQueue} type="button"><Trash2 size={18} /> ล้างคิวพิมพ์</button>
        </div>
        {printerNotice ? <div className="inline-confirm">{printerNotice}</div> : null}
      </article>
      ) : null}
      {activeSection === "sync" && developerUnlocked ? (
      <article className="settings-card">
        <Database size={24} />
        <h3>Google Sheet Sync</h3>
        <p>Sheet ใช้เป็นสำเนา/รายงาน ไม่ใช่ฐานหลักของ POS</p>
        <div className="printer-preset-card">
          <strong>Google Sheet ร้านเบอร์เกอร์</strong>
          <span>ใช้ชีทเบอร์เกอร์เป็นรายงานหลัก: Sales + รายรับ + รายจ่าย + Stock Movements + Shift Summary</span>
          <button className="ghost-button" onClick={applyBurgerSheetPreset} type="button">ใช้ Sheet ร้านเบอร์เกอร์</button>
        </div>
        <label>Sheet ID<input value={settings.sheetId} onChange={(event) => update("sheetId", event.target.value)} /></label>
        <label>Apps Script Web App URL<input placeholder="https://script.google.com/macros/s/.../exec" value={settings.sheetWebAppUrl || ""} onChange={(event) => update("sheetWebAppUrl", event.target.value)} /></label>
        <div className="settings-subsection">
          <strong>แท็บข้อมูลดิบที่เว็บจะส่งออก</strong>
          <div className="sheet-schema-list">
            {Object.entries(SHEET_HEADERS).map(([tab, headers]) => (
              <div className="sheet-schema-row" key={tab}>
                <strong>{tab}</strong>
                <span>{headers.slice(0, 6).join(", ")}{headers.length > 6 ? ` +${headers.length - 6}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
        {settings.testModeEnabled === true ? (
          <div className="inline-warning">โหมดทดสอบเปิดอยู่: ระบบจะไม่ส่งคิวจริงไป Google Sheet จนกว่าจะปิดโหมดทดสอบ</div>
        ) : null}
        <div className="queue-line"><RefreshCw size={18} /> รอ sync {queueLists.sheet.filter((job) => job.status !== "SYNCED").length} รายการ</div>
        <div className="settings-printer-actions">
          <button className="ghost-button" disabled={syncBusy} onClick={runSheetDryRun} type="button"><Database size={18} /> จำลองข้อมูล Sheet</button>
          <button className="primary-button" disabled={syncBusy || !settings.sheetWebAppUrl || settings.testModeEnabled === true} onClick={sendPendingSheetQueue} type="button"><RefreshCw size={18} /> ส่งคิวไป Google Sheet</button>
        </div>
        {syncNotice ? <div className={syncNotice.includes("ไม่สำเร็จ") ? "inline-warning" : "inline-confirm"}>{syncNotice}</div> : null}
        <QueueList jobs={queueLists.sheet} onDone={(job) => markFirstJobDone("sheetSyncJobs", job)} />
      </article>
      ) : null}
      {activeSection === "line" && developerUnlocked ? (
      <article className="settings-card settings-card-wide">
        <Bell size={24} />
        <h3>LINE แจ้งเตือน</h3>
        <p>ใช้เป็นคิวแยกจากการขาย หน้าร้านยังทำงานต่อได้แม้ LINE ส่งไม่สำเร็จ แล้วค่อยกดส่งคิวซ้ำภายหลัง</p>
        <div className="settings-subsection">
          <strong>ปลายทางแจ้งเตือน</strong>
          <p>แนะนำให้ทำผ่าน Apps Script หรือ Supabase Edge Function เพื่อเก็บ LINE token ฝั่ง server ไม่ควรวาง token ไว้ในหน้าเว็บ</p>
          <label>LINE Web App URL<input placeholder="https://script.google.com/macros/s/.../exec" value={settings.lineWebAppUrl || ""} onChange={(event) => update("lineWebAppUrl", event.target.value)} /></label>
          <label>ชื่อปลายทางแก้สต็อก<input value={settings.lineStockTargetName || ""} onChange={(event) => update("lineStockTargetName", event.target.value)} /></label>
          <label>ชื่อปลายทางสรุปปิดกะ<input value={settings.lineShiftTargetName || ""} onChange={(event) => update("lineShiftTargetName", event.target.value)} /></label>
        </div>
        <div className="settings-subsection">
          <strong>เปิด/ปิดการแจ้งเตือน</strong>
          <label className="check-line"><input checked={settings.lineStockAlertsEnabled !== false} onChange={(event) => update("lineStockAlertsEnabled", event.target.checked)} type="checkbox" /> ส่ง LINE ทุกครั้งที่แก้ไขสต็อก</label>
          <label className="check-line"><input checked={settings.lineShiftSummaryEnabled !== false} onChange={(event) => update("lineShiftSummaryEnabled", event.target.checked)} type="checkbox" /> ส่ง LINE ตอนปิดกะ</label>
        </div>
        {settings.testModeEnabled === true ? (
          <div className="inline-warning">โหมดทดสอบเปิดอยู่: ระบบจะไม่ส่งคิวจริงไป LINE จนกว่าจะปิดโหมดทดสอบ</div>
        ) : null}
        <div className="queue-line"><RefreshCw size={18} /> รอส่ง LINE {(queueLists.line || []).filter((job) => job.status !== "SENT").length} รายการ</div>
        <div className="settings-printer-actions">
          <button className="primary-button" disabled={syncBusy || !settings.lineWebAppUrl || settings.testModeEnabled === true} onClick={sendPendingLineQueue} type="button"><RefreshCw size={18} /> ส่งคิว LINE</button>
        </div>
        {syncNotice ? <div className={syncNotice.includes("ไม่สำเร็จ") ? "inline-warning" : "inline-confirm"}>{syncNotice}</div> : null}
        <QueueList jobs={queueLists.line || []} onDone={(job) => markFirstJobDone("lineNotifyJobs", job)} />
      </article>
      ) : null}
      {activeSection === "thaiPrototype" && developerUnlocked ? (
      <article className="settings-card settings-card-wide thai-printer-prototype">
        <FileImage size={24} />
        <h3>Prototype พิมพ์ภาษาไทยผ่าน Android App</h3>
        <p>โหมดนี้สร้างใบพิมพ์เป็นรูปภาพจาก canvas แล้วส่ง ESC/POS bitmap เข้า POS-8390 ผ่าน Wi-Fi/LAN หรือ Bluetooth Native เพื่อทดสอบภาษาไทย โลโก้ และการตัดกระดาษ</p>
        <div className="prototype-status">
          {nativeThaiPrinterAvailable ? "พร้อมใช้งานใน Android App" : "ต้องเปิดจาก Android App ที่ build ด้วย Capacitor"}
        </div>
        <label>รูปแบบการเชื่อมต่อ<select value={settings.printerConnection || "WIFI_LAN"} onChange={(event) => update("printerConnection", event.target.value)}>
          <option value="BLUETOOTH_NATIVE">Bluetooth Native</option>
          <option value="WIFI_LAN">WiFi / LAN ผ่าน IP</option>
        </select></label>
        {settings.printerConnection === "BLUETOOTH_NATIVE" ? (
          <>
            <div className="settings-printer-actions">
              <button className="ghost-button" disabled={printerBusy || !nativeThaiPrinterAvailable} onClick={loadBluetoothPrinters} type="button"><RefreshCw size={18} /> โหลดเครื่องที่จับคู่ไว้</button>
            </div>
            <label>เครื่องพิมพ์ Bluetooth<select value={settings.bluetoothPrinterAddress || ""} onChange={(event) => update("bluetoothPrinterAddress", event.target.value)}>
              <option value="">เลือกเครื่องพิมพ์ที่จับคู่ไว้</option>
              {bluetoothDevices.map((device) => <option key={device.address} value={device.address}>{device.name || "Unknown printer"} ({device.address})</option>)}
              {settings.bluetoothPrinterAddress && !bluetoothDevices.some((device) => device.address === settings.bluetoothPrinterAddress) ? <option value={settings.bluetoothPrinterAddress}>เครื่องเดิม ({settings.bluetoothPrinterAddress})</option> : null}
            </select></label>
          </>
        ) : null}
        <label>IP เครื่องพิมพ์ Wi-Fi<input value={settings.printerIp} onChange={(event) => update("printerIp", event.target.value)} /></label>
        <label>Port เครื่องพิมพ์<input inputMode="numeric" value={settings.printerPort || "9100"} onChange={(event) => update("printerPort", event.target.value)} /></label>
        <div className="settings-printer-actions">
          <button className="primary-button" disabled={printerBusy || !nativeThaiPrinterAvailable} onClick={() => runNativeThaiPrint("RECEIPT")} type="button"><Printer size={18} /> พิมพ์ใบเสร็จไทยทดสอบ</button>
          <button className="ghost-button" disabled={printerBusy || !nativeThaiPrinterAvailable} onClick={() => runNativeThaiPrint("KITCHEN")} type="button"><ReceiptText size={18} /> พิมพ์ใบออร์เดอร์ไทยทดสอบ</button>
        </div>
        {printerNotice ? <div className={printerNotice.includes("สำเร็จ") ? "inline-confirm" : "inline-warning"}>{printerNotice}</div> : null}
      </article>
      ) : null}
      {activeSection === "data" && developerUnlocked ? (
      <article className="settings-card settings-card-wide danger-zone-card">
        <Trash2 size={24} />
        <h3>ล้างข้อมูลก่อนใช้งานจริง</h3>
        <p>ใช้หลังช่วงทดลอง 2-3 อาทิตย์ เพื่อล้างข้อมูลทดสอบในเครื่อง, Supabase/local queue และ Google Sheet ให้เริ่มใช้งานจริงแบบสะอาด</p>
        <div className="reset-option-list">
          <div className="reset-option">
            <div>
              <strong>ล้างข้อมูลทดลอง</strong>
              <span>ลบออร์เดอร์ รายจ่าย กะ คิวพิมพ์ คิวซิงก์ และข้อมูลใน Google Sheet แต่เก็บสินค้า หมวด ตัวเลือกเสริม และรายการวัตถุดิบไว้</span>
            </div>
            <button className={resetArmed === "transactions" ? "danger-button is-armed" : "ghost-button"} disabled={resetBusy} onClick={() => runDataReset("transactions")} type="button">
              {resetArmed === "transactions" ? "ยืนยันล้างข้อมูลทดลอง" : "ล้างข้อมูลทดลอง"}
            </button>
          </div>
          <div className="reset-option reset-option-danger">
            <div>
              <strong>ล้างทั้งระบบ</strong>
              <span>ลบข้อมูลทั้งหมด รวมสินค้า หมวด ตัวเลือกเสริม สูตร วัตถุดิบ หน่วยซื้อ รายจ่าย ออร์เดอร์ และ Google Sheet</span>
            </div>
            <button className={resetArmed === "all" ? "danger-button is-armed" : "ghost-button"} disabled={resetBusy} onClick={() => runDataReset("all")} type="button">
              {resetArmed === "all" ? "ยืนยันล้างทั้งระบบ" : "ล้างทั้งระบบ"}
            </button>
          </div>
        </div>
        {resetNotice ? <div className={resetNotice.includes("ไม่สำเร็จ") ? "inline-warning" : "inline-confirm"}>{resetNotice}</div> : null}
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
        <div className="queue-line"><RefreshCw size={18} /> รอพิมพ์ {queueLists.print.filter((job) => job.status !== "PRINTED").length} รายการ</div>
        <div className="settings-printer-actions">
          <button className="ghost-button" disabled={printerBusy} onClick={sendPendingPrintQueue} type="button"><RefreshCw size={18} /> ส่งคิวค้าง</button>
          <button className="danger-button" disabled={printerBusy} onClick={clearPendingPrintQueue} type="button"><Trash2 size={18} /> ล้างคิวพิมพ์ทั้งหมด</button>
        </div>
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
  const visibleJobs = jobs.filter((job) => !["PRINTED", "SYNCED", "SENT"].includes(job.status));
  if (!visibleJobs.length) return <div className="empty-compact">ยังไม่มีงานค้าง</div>;
  return (
    <div className="queue-list">
      {visibleJobs.slice(-5).reverse().map((job) => (
        <div className="queue-item" key={job.id}>
          <span>
            {job.description || job.type || job.job_type}
            <small>{job.status}{job.targetTabs?.length ? ` · ${job.targetTabs.join(", ")}` : ""}</small>
          </span>
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

function ExpenseHistoryPanel({ expenses, onBack, onDeleteExpense }) {
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

  async function requestDeleteExpense() {
    if (!selectedExpense) return;
    const confirmed = window.confirm(`ลบรายจ่าย ${selectedExpense.id} และบันทึกลง Audit Log ใช่ไหม?`);
    if (!confirmed) return;
    await onDeleteExpense?.(selectedExpense.id);
  }

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
          <button className="ghost-button danger-text" onClick={requestDeleteExpense} type="button">ลบรายจ่าย</button>
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

function ConfirmDialog({ message, onCancel, onConfirm, title }) {
  return (
    <div className="modal-backdrop confirm-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <div aria-modal="true" className="modal-card confirm-dialog" role="alertdialog">
        <span className="confirm-dialog-icon"><AlertTriangle size={26} /></span>
        <div>
          <h3>{title}</h3>
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onCancel} type="button">ยกเลิก</button>
          <button className="danger-button" onClick={onConfirm} type="button"><Trash2 size={17} /> ยืนยันลบ</button>
        </div>
      </div>
    </div>
  );
}

function ReorderPositionInput({ label, max, onMove, value }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const position = Math.max(1, Math.min(max, Number(draft || value)));
    setDraft(String(position));
    onMove(position);
  }

  return (
    <label onClick={(event) => event.stopPropagation()}>
      <input
        aria-label={`ลำดับ ${label}`}
        inputMode="numeric"
        max={max}
        min="1"
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        type="number"
        value={draft}
      />
    </label>
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
      sourceType: "ORDER",
      quantityBefore: Number(ingredient?.stock || 0),
      quantityDelta: -line.quantity,
      quantityAfter: Number(ingredient?.stock || 0) - line.quantity,
      unit: ingredient?.unit || "",
      sourceId: orderId,
      createdAt: new Date().toISOString(),
    };
  });
}

function makeVoidStockMovements(requirements, ingredients, order) {
  const createdAt = order.voidedAt || new Date().toISOString();
  return requirements.map((line) => {
    const ingredient = ingredients.find((item) => item.id === line.ingredientId);
    const quantityBefore = Number(ingredient?.stock || 0);
    return {
      id: `MOV-${Date.now()}-${line.ingredientId}`,
      ingredientId: line.ingredientId,
      ingredientName: ingredient?.name || line.ingredientId,
      type: "VOID",
      sourceType: "ORDER_VOID",
      quantityBefore,
      quantityDelta: line.quantity,
      quantityAfter: quantityBefore + line.quantity,
      unit: ingredient?.unit || "",
      sourceId: order.id,
      reason: `ยกเลิกออร์เดอร์ ${getOrderDisplayNo(order)} คืนวัตถุดิบเข้าสต็อก`,
      createdAt,
    };
  });
}

function buildNotificationItems({ lowStock, queueLists, queueStats, settings, supabaseState }) {
  const items = [];
  if (!supabaseState?.connected) {
    items.push({
      id: "supabase-not-ready",
      severity: supabaseState?.mode === "error" ? "danger" : "warning",
      title: supabaseState?.mode === "local" ? "ยังไม่ได้ตั้งค่าซิงก์ข้อมูลกลาง" : "ซิงก์ข้อมูลกลางไม่สำเร็จ",
      detail: supabaseState?.lastError || "เครื่องนี้จะใช้ข้อมูลในเครื่องก่อน ถ้าต้องการให้เว็บและแอพเห็นข้อมูลเดียวกัน ต้องเชื่อมต่อ Supabase หรือ Google Sheet App State ให้สำเร็จ",
      action: "settings",
    });
  }
  if (!settings?.sheetWebAppUrl) {
    items.push({
      id: "sheet-url-missing",
      severity: "warning",
      title: "ยังไม่ได้ตั้งค่า Google Sheet sync",
      detail: "รายรับตอนปิดกะและรายจ่ายจะยังไม่ถูกส่งไป Google Sheet จนกว่าจะใส่ Apps Script Web App URL",
      action: "settings",
    });
  }
  if (queueStats.print > 0) {
    items.push({
      id: "print-queue-pending",
      severity: "warning",
      title: `คิวพิมพ์ค้าง ${queueStats.print} งาน`,
      detail: "มีงานพิมพ์ที่ยังไม่สำเร็จ กดส่งคิวค้างในหน้าตั้งค่าเครื่องพิมพ์ได้",
      action: "settings",
    });
  }
  if (queueStats.sheet > 0) {
    items.push({
      id: "sheet-queue-pending",
      severity: "warning",
      title: `คิว Google Sheet ค้าง ${queueStats.sheet} งาน`,
      detail: "ข้อมูลถูกเก็บไว้ในเครื่องแล้ว แต่ยังส่งเข้า Google Sheet ไม่ครบ",
      action: "settings",
    });
  }
  if (queueStats.line > 0) {
    items.push({
      id: "line-queue-pending",
      severity: "info",
      title: `คิว LINE ค้าง ${queueStats.line} งาน`,
      detail: "มีแจ้งเตือน LINE ที่รอส่งซ้ำ",
      action: "settings",
    });
  }
  const failedJobs = [
    ...(queueLists.print || []).filter((job) => ["FAILED", "ERROR"].includes(job.status)),
    ...(queueLists.sheet || []).filter((job) => ["FAILED", "ERROR"].includes(job.status)),
    ...(queueLists.line || []).filter((job) => ["FAILED", "ERROR"].includes(job.status)),
  ].slice(0, 6);
  failedJobs.forEach((job) => {
    items.push({
      id: `failed-${job.id}`,
      severity: "danger",
      title: job.description || job.type || "บันทึก/ส่งข้อมูลไม่สำเร็จ",
      detail: job.lastError || "ระบบจะเก็บคิวไว้และสามารถลองส่งซ้ำได้",
      meta: job.status,
      action: "settings",
    });
  });
  lowStock.slice(0, 12).forEach((item) => {
    items.push({
      id: `low-${item.id}`,
      severity: Number(item.stock) <= 0 ? "danger" : "warning",
      title: `${item.name} ใกล้หมด`,
      detail: `คงเหลือ ${money(item.stock)} ${item.unit} / แจ้งเตือนที่ ${money(item.minimumStock)} ${item.unit}`,
      action: "inventory",
    });
  });
  return items;
}

function makeIngredientSaveMovement(previous, nextIngredient) {
  const quantityBefore = Number(previous?.stock || 0);
  const quantityAfter = Number(nextIngredient?.stock || 0);
  if (previous && quantityBefore === quantityAfter) return null;
  if (!previous && quantityAfter === 0) return null;
  const type = previous ? "STOCK_EDIT" : "INITIAL_STOCK";
  return {
    id: `MOV-${Date.now()}-${nextIngredient.id}`,
    ingredientId: nextIngredient.id,
    ingredientName: nextIngredient.name,
    type,
    sourceType: previous ? "INGREDIENT_EDIT" : "INGREDIENT_CREATE",
    quantityBefore,
    quantityDelta: quantityAfter - quantityBefore,
    quantityAfter,
    unit: nextIngredient.unit,
    sourceId: nextIngredient.id,
    reason: previous
      ? `แก้ไขจำนวนคงเหลือโดยตรงจาก ${money(quantityBefore)} เป็น ${money(quantityAfter)}`
      : `เพิ่มวัตถุดิบใหม่พร้อมคงเหลือเริ่มต้น ${money(quantityAfter)}`,
    createdAt: new Date().toISOString(),
  };
}

function calculateShiftSummary(shift, orders, closingCash = null) {
  const shiftOrders = orders.filter((order) => order.shiftId === shift.id);
  const activeOrders = shiftOrders.filter((order) => order.paymentStatus !== "VOIDED");
  const voidedOrders = shiftOrders.filter((order) => order.paymentStatus === "VOIDED");
  const grossSales = shiftOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const voidAmount = voidedOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const cashRefundAmount = voidedOrders
    .filter((order) => order.voidRefundMethod === "CASH")
    .reduce((sum, order) => sum + Number(order.voidRefundAmount || 0), 0);
  const transferRefundAmount = voidedOrders
    .filter((order) => order.voidRefundMethod === "TRANSFER")
    .reduce((sum, order) => sum + Number(order.voidRefundAmount || 0), 0);
  const cashSales = activeOrders
    .filter((order) => order.paymentMethod === "CASH")
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const transferSales = activeOrders
    .filter((order) => order.paymentMethod === "TRANSFER")
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const thaiChuayThaiSales = activeOrders
    .filter((order) => order.paymentMethod === "THAI_CHUAY_THAI")
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const netSales = activeOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const cashDrawerSales = shiftOrders
    .filter((order) => (
      order.paymentMethod === "CASH"
      && (order.paymentStatus !== "VOIDED" || order.voidRefundMethod === "CASH" || order.voidRefundMethod === "TRANSFER")
    ))
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const soldQuantities = activeOrders.reduce((counts, order) => {
    (order.items || []).forEach((item) => {
      const quantity = Number(item.quantity || 0);
      const category = normalizeOrderItemCategory(item);
      if (category === "เบอร์เกอร์") counts.burgerQuantity += quantity;
      if (category === "BBQ") counts.bbqQuantity += quantity;
    });
    return counts;
  }, { burgerQuantity: 0, bbqQuantity: 0 });
  const expectedCash = Number(shift.openingCash || 0) + cashDrawerSales - cashRefundAmount;
  const countedCash = closingCash === null || closingCash === undefined ? expectedCash : Number(closingCash || 0);
  return {
    openingCash: Number(shift.openingCash || 0),
    cashSales,
    transferSales,
    thaiChuayThaiSales,
    expectedCash,
    closingCash: countedCash,
    cashDifference: countedCash - expectedCash,
    orderCount: activeOrders.length,
    burgerQuantity: soldQuantities.burgerQuantity,
    bbqQuantity: soldQuantities.bbqQuantity,
    voidOrderCount: voidedOrders.length,
    grossSales,
    voidAmount,
    cashRefundAmount,
    transferRefundAmount,
    netSales,
    totalSales: netSales,
  };
}

function buildDashboardData(orders, expenses, ingredients, products, shifts, options = {}) {
  const period = getDashboardPeriod(options.period || "today");
  const periodOrders = filterByDashboardRange(orders, period.range, (order) => order.createdAt);
  const periodExpenses = filterByDashboardRange(expenses, period.range, (expense) => expense.expenseDate || expense.createdAt);
  const activeOrders = periodOrders.filter((order) => order.paymentStatus !== "VOIDED");
  const voidedOrders = periodOrders.filter((order) => order.paymentStatus === "VOIDED");
  const totalSales = activeOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const storeOrders = activeOrders.filter((order) => (order.salesChannel || "store") === "store");
  const cashOrders = storeOrders.filter((order) => order.paymentMethod === "CASH");
  const transferOrders = storeOrders.filter((order) => order.paymentMethod === "TRANSFER");
  const thaiChuayThaiOrders = storeOrders.filter((order) => order.paymentMethod === "THAI_CHUAY_THAI");
  const cashSales = cashOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const transferSales = transferOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const thaiChuayThaiSales = thaiChuayThaiOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const expenseTotal = periodExpenses.reduce((sum, expense) => sum + Number(expense.totalAmount || 0), 0);
  const productMap = new Map(products.map((product) => [product.id, product.name]));
  const topProductMap = new Map();
  const channelMap = new Map(salesChannels.map((channel) => [channel.id, { ...channel, total: 0, orders: 0 }]));

  activeOrders.forEach((order) => {
    const channel = channelMap.get(order.salesChannel || "store") || channelMap.get("store");
    channel.total += Number(order.totalAmount || 0);
    channel.orders += 1;
    (order.items || []).forEach((item) => {
      const name = item.name || productMap.get(item.productId) || item.productId;
      const previous = topProductMap.get(name) || { name, quantity: 0, total: 0 };
      previous.quantity += Number(item.quantity || 0);
      previous.total += Number(item.quantity || 0) * Number(item.unitPrice || 0);
      topProductMap.set(name, previous);
    });
  });

  const dailyRaw = buildDashboardSalesBuckets(period.range);
  activeOrders.forEach((order) => {
    const key = dailyRaw.bucketType === "month" ? toLocalMonthKey(order.createdAt) : toLocalDateKey(order.createdAt);
    if (dailyRaw.has(key)) {
      dailyRaw.get(key).total += Number(order.totalAmount || 0);
    }
  });
  const maxDaily = Math.max(1, ...Array.from(dailyRaw.values()).map((day) => day.total));
  const dailySales = Array.from(dailyRaw.values()).map((day) => ({ ...day, percent: Math.max(4, Math.round((day.total / maxDaily) * 100)) }));
  const previousRange = getPreviousDashboardRange(period);
  const previousOrders = filterByDashboardRange(orders, previousRange?.range, (order) => order.createdAt)
    .filter((order) => order.paymentStatus !== "VOIDED");
  const previousTotal = previousOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const delta = options.comparePreviousMonth ? totalSales - previousTotal : 0;
  const percent = previousTotal ? Math.round((delta / previousTotal) * 100) : (totalSales ? 100 : 0);

  return {
    periodLabel: period.label,
    totalSales,
    orderCount: activeOrders.length,
    averageOrder: activeOrders.length ? totalSales / activeOrders.length : 0,
    cashSales,
    cashOrders: cashOrders.length,
    transferSales,
    transferOrders: transferOrders.length,
    thaiChuayThaiSales,
    thaiChuayThaiOrders: thaiChuayThaiOrders.length,
    cashPercent: totalSales ? Math.round((cashSales / totalSales) * 100) : 0,
    transferPercent: totalSales ? Math.round((transferSales / totalSales) * 100) : 0,
    thaiChuayThaiPercent: totalSales ? Math.round((thaiChuayThaiSales / totalSales) * 100) : 0,
    dailySales,
    channelSales: Array.from(channelMap.values()).map((channel) => ({ ...channel, label: getSalesChannelLabel(channel.id) })),
    topProducts: Array.from(topProductMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    expenseTotal,
    expenseCount: periodExpenses.reduce((sum, expense) => sum + Number(expense.items?.length || 0), 0),
    netAfterExpenses: totalSales - expenseTotal,
    lowStock: ingredients.filter((item) => Number(item.stock || 0) <= Number(item.minimumStock || 0)).slice(0, 6),
    shiftCount: filterByDashboardRange(shifts, period.range, (shift) => shift.closedAt || shift.openedAt).length,
    voidOrderCount: voidedOrders.length,
    voidAmount: voidedOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    comparison: {
      previousTotal,
      delta,
      percent,
      label: previousRange?.label || "ช่วงก่อนหน้า",
    },
  };
}

function getDashboardPeriod(period) {
  if (period && typeof period === "object") {
    return getCustomDashboardPeriod(period);
  }
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const tomorrow = addDays(todayStart, 1);
  if (period === "7days") {
    return {
      label: "7 วันล่าสุด",
      range: { start: addDays(todayStart, -6), end: tomorrow },
    };
  }
  if (period === "month") {
    return {
      label: now.toLocaleDateString("th-TH", { month: "long", year: "numeric" }),
      range: { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
    };
  }
  if (period === "all") {
    return { label: "ข้อมูลทั้งหมด", range: null };
  }
  return {
    label: "วันนี้",
    range: { start: todayStart, end: tomorrow },
  };
}

function getCustomDashboardPeriod(selection = {}) {
  const mode = selection.mode || "today";
  if (mode === "day") {
    const day = parseDashboardInputDate(selection.selectedDate) || startOfLocalDay(new Date());
    return {
      mode,
      label: formatDashboardFullDate(day),
      range: { start: day, end: addDays(day, 1) },
    };
  }
  if (mode === "range") {
    const first = parseDashboardInputDate(selection.rangeStart) || startOfLocalDay(new Date());
    const second = parseDashboardInputDate(selection.rangeEnd) || first;
    const start = first <= second ? first : second;
    const endDay = first <= second ? second : first;
    const sameDay = toLocalDateKey(start) === toLocalDateKey(endDay);
    return {
      mode,
      label: sameDay ? formatDashboardFullDate(start) : `${formatDashboardShortDate(start)} - ${formatDashboardShortDate(endDay)}`,
      range: { start, end: addDays(endDay, 1) },
    };
  }
  if (mode === "month") {
    const month = parseDashboardInputMonth(selection.selectedMonth) || startOfLocalMonth(new Date());
    return {
      mode,
      label: month.toLocaleDateString("th-TH", { month: "long", year: "numeric" }),
      range: { start: month, end: new Date(month.getFullYear(), month.getMonth() + 1, 1) },
    };
  }
  return getDashboardPeriod(mode);
}

function filterByDashboardRange(items, range, getDateValue) {
  if (!range) return items;
  return items.filter((item) => {
    const date = parseDashboardDate(getDateValue(item));
    if (!date) return false;
    return date >= range.start && date < range.end;
  });
}

function buildDashboardSalesBuckets(range) {
  const buckets = new Map();
  const now = new Date();
  const start = range?.start || addDays(startOfLocalDay(now), -6);
  const end = range?.end || addDays(startOfLocalDay(now), 1);
  const dayCount = Math.max(1, Math.ceil((end - start) / 86400000));
  if (dayCount > 31) {
    let cursor = startOfLocalMonth(start);
    while (cursor < end && buckets.size < 24) {
      const key = toLocalMonthKey(cursor);
      buckets.set(key, { key, label: cursor.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }), total: 0 });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    buckets.bucketType = "month";
    return buckets;
  }
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(start, offset);
    const key = toLocalDateKey(date);
    buckets.set(key, { key, label: date.toLocaleDateString("th-TH", { day: "2-digit", month: "short" }), total: 0 });
  }
  buckets.bucketType = "day";
  return buckets;
}

function getPreviousDashboardRange(period) {
  if (!period?.range) return { label: "ช่วงก่อนหน้า", range: null };
  const { start, end } = period.range;
  if (period.mode === "month") {
    return {
      label: "เดือนก่อน",
      range: { start: new Date(start.getFullYear(), start.getMonth() - 1, 1), end: new Date(start.getFullYear(), start.getMonth(), 1) },
    };
  }
  const dayCount = Math.max(1, Math.ceil((end - start) / 86400000));
  const previousEnd = start;
  const previousStart = addDays(start, -dayCount);
  return {
    label: dayCount === 1 ? "วันก่อนหน้า" : "ช่วงก่อนหน้า",
    range: { start: previousStart, end: previousEnd },
  };
}

function parseDashboardDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDashboardInputDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseDashboardInputMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function startOfLocalDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalMonth(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function toLocalDateKey(value) {
  const date = value instanceof Date ? value : parseDashboardDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toLocalMonthKey(value) {
  const date = value instanceof Date ? value : parseDashboardDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateInputValue(value) {
  return toLocalDateKey(value) || toLocalDateKey(new Date());
}

function toMonthInputValue(value) {
  return toLocalMonthKey(value) || toLocalMonthKey(new Date());
}

function formatDashboardFullDate(value) {
  return value.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

function formatDashboardShortDate(value) {
  return value.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" });
}

function blankExpenseRow(ingredientId = "", ingredientSearch = "") {
  return {
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    mode: "ingredient",
    ingredientId,
    ingredientSearch,
    purchaseUnitId: "",
    generalExpenseItemId: "",
    generalExpenseSearch: "",
    generalUnit: "",
    category: "",
    subcategory: "",
    name: "",
    note: "",
    quantity: "",
    unitPrice: "",
  };
}

function makeEmptyExpenseDraft() {
  return {
    version: 2,
    expenseDate: new Date().toISOString().slice(0, 10),
    rows: [blankExpenseRow()],
  };
}

function normalizeExpenseDraft(draft) {
  if (draft?.version !== 2) return makeEmptyExpenseDraft();
  return {
    version: 2,
    expenseDate: draft?.expenseDate || new Date().toISOString().slice(0, 10),
    rows: draft?.rows?.length
      ? draft.rows.map((row) => ({
        ...row,
        generalExpenseSearch: row.generalExpenseSearch ?? row.name ?? "",
        generalUnit: row.generalUnit || "",
        category: row.category || "",
        subcategory: row.subcategory || "",
      }))
      : [blankExpenseRow()],
  };
}

function buildExpenseItem(row, ingredients, purchaseUnits, generalExpenseItems = []) {
  const quantity = Number(row.quantity || 0);
  const unitPrice = Number(row.unitPrice || 0);
  if (!quantity && !unitPrice && !row.name?.trim() && !row.generalExpenseSearch?.trim() && !row.ingredientId && !row.generalExpenseItemId) return null;
  if (row.mode === "custom") {
    const generalItem = generalExpenseItems.find((item) => item.id === row.generalExpenseItemId && item.active !== false);
    const name = generalItem?.name || row.generalExpenseSearch?.trim() || row.name?.trim();
    const category = generalItem?.category || row.category;
    const subcategory = generalItem?.subcategory || row.subcategory;
    const unit = generalItem?.unit || row.generalUnit?.trim() || "";
    if (!name || !category || !subcategory) return null;
    return {
      id: row.id,
      mode: "custom",
      name,
      generalExpenseItemId: generalItem?.id || "",
      category,
      subcategory,
      ingredientId: null,
      purchaseUnit: unit,
      purchaseQuantity: quantity,
      stockQuantity: 0,
      baseUnit: unit,
      unitPrice,
      note: generalItem?.note || row.note?.trim() || "",
      lineTotal: quantity * unitPrice,
    };
  }

  const ingredient = ingredients.find((item) => item.id === row.ingredientId);
  if (!ingredient) return null;
  const availableUnits = purchaseUnits.filter((unit) => unit.ingredientId === row.ingredientId);
  const selectedUnit = availableUnits.find((unit) => unit.id === row.purchaseUnitId);
  if (!selectedUnit) return null;
  const stockQuantity = quantity * Number(selectedUnit?.ratio || 1);
  const category = ingredient.expenseCategory || defaultIngredientExpenseCategory;
  const subcategory = ingredient.expenseSubcategory || defaultIngredientExpenseSubcategory;
  return {
    id: row.id,
    mode: "ingredient",
    name: ingredient.name,
    ingredientId: ingredient.id,
    generalExpenseItemId: "",
    category,
    subcategory,
    purchaseUnit: selectedUnit?.label || ingredient.unit,
    purchaseQuantity: quantity,
    stockQuantity,
    baseUnit: ingredient.unit,
    unitPrice,
    lineTotal: quantity * unitPrice,
  };
}

function defaultNonStockExpenseCategory(categories = defaultGeneralExpenseCategories) {
  return categories.find((category) => category !== defaultIngredientExpenseCategory) || categories[0] || "";
}

function emptyGeneralExpenseItem(category = defaultNonStockExpenseCategory(), subcategory = "") {
  return {
    id: "",
    name: "",
    category: category || "",
    subcategory: subcategory || firstExpenseSubcategory(category, defaultGeneralExpenseSubcategories),
    unit: "",
    note: "",
    active: true,
  };
}

function firstExpenseSubcategory(category, subcategories = defaultGeneralExpenseSubcategories) {
  return subcategories.find((subcategory) => subcategory.category === category)?.name || "";
}

function makeExpenseSubcategoryId(category, name, index = 0) {
  const slug = `${category}_${name}`
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
  return `expense_sub_${slug || "item"}_${index}`;
}

function rankSearchMatches(items, query, getSearchText) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return items;
  return items
    .map((item, index) => {
      const text = String(getSearchText(item) || "").toLowerCase();
      const name = String(item.name || item.label || "").toLowerCase();
      let score = 100;
      if (name === normalized) score = 0;
      else if (name.startsWith(normalized)) score = 1;
      else if (name.includes(normalized)) score = 2;
      else if (text.includes(normalized)) score = 3;
      return { item, index, score };
    })
    .filter((entry) => entry.score < 100)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.item);
}

function emptyIngredient() {
  return {
    id: "",
    name: "",
    category: defaultIngredientCategories[0],
    expenseCategory: defaultIngredientExpenseCategory,
    expenseSubcategory: defaultIngredientExpenseSubcategory,
    stock: 0,
    unit: "ชิ้น",
    minimumStock: 0,
    purchaseLabel: "แพ็ค",
    purchaseRatio: 1,
  };
}

function normalizeIngredientForm(item) {
  return {
    id: item?.id || "",
    name: (item?.name || "").trim(),
    category: item?.category || "อื่นๆ",
    expenseCategory: item?.expenseCategory || defaultIngredientExpenseCategory,
    expenseSubcategory: item?.expenseSubcategory || defaultIngredientExpenseSubcategory,
    stock: Number(item?.stock || 0),
    unit: (item?.unit || "").trim(),
    minimumStock: Number(item?.minimumStock || 0),
    purchaseLabel: (item?.purchaseLabel || "").trim(),
    purchaseRatio: Number(item?.purchaseRatio || 0),
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
    group: "addon",
    price: 0,
    productIds: products.map((product) => product.id),
  };
}

function getModifierGroupLabel(groupId, groups = defaultModifierGroups) {
  return groups.find((group) => group.id === groupId)?.label || "Add on";
}

function countModifierIds(ids = []) {
  return ids.reduce((counts, id) => {
    counts.set(id, Number(counts.get(id) || 0) + 1);
    return counts;
  }, new Map());
}

function buildSelectedModifiers(ids = [], availableModifiers = []) {
  const modifierMap = new Map(availableModifiers.map((modifier) => [modifier.id, modifier]));
  return ids.map((id) => modifierMap.get(id)).filter(Boolean);
}

function formatModifierSummary(modifiers = []) {
  const summary = new Map();
  modifiers.forEach((modifier) => {
    const key = modifier.id || modifier.label;
    const current = summary.get(key) || { label: modifier.label || key, count: 0 };
    summary.set(key, { ...current, count: current.count + 1 });
  });
  return Array.from(summary.values()).map((item) => (item.count > 1 ? `${item.label} x${item.count}` : item.label));
}

function modifierAllowsQuantity(modifier) {
  return Number(modifier?.price || 0) > 0;
}

function moveArrayItem(items, itemId, direction) {
  const index = items.findIndex((item) => item.id === itemId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function moveArrayItemToPosition(items, itemId, position) {
  const index = items.findIndex((item) => item.id === itemId);
  const target = Math.max(0, Math.min(items.length - 1, Number(position || 1) - 1));
  if (index < 0 || index === target) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function inferIngredientCategory(name = "") {
  const value = name.toLowerCase();
  if (/หมู|ไก่|เนื้อ|เบคอน|patty/.test(value)) return "เนื้อสัตว์";
  if (/ขนมปัง|bun/.test(value)) return "ขนมปัง";
  if (/ผัก|หอม|มะเขือ|แตง/.test(value)) return "ผัก";
  if (/ซอส|มายอง|เคช/.test(value)) return "ซอส";
  if (/โค้ก|น้ำ|ชา|กาแฟ|drink|cola/.test(value)) return "เครื่องดื่ม";
  return "อื่นๆ";
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
