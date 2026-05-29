# Burger POS

Web-based POS สำหรับร้านเบอร์เกอร์ ใช้งานบน Samsung Galaxy Tab A9+, iPad, iPhone และ Android phone เป็นหลัก

## Stack

- Vite + React
- Tailwind CSS
- Supabase เป็นฐานข้อมูลหลัก
- Google Sheet ใช้เป็นสำเนา/รายงานผ่าน `sheet_sync_jobs`
- IndexedDB ใช้เป็น local queue สำหรับงานพิมพ์และ sync

## Run

```powershell
npm install
npm run dev
```

เปิด `http://localhost:5173`

## Implemented prototype

- POS ปุ่มใหญ่ แยกหมวดสินค้า
- เปิดกะก่อนขาย ใส่เงินสดเริ่มต้น และปิดกะพร้อมสรุปเงินสด เงินโอน ส่วนต่างเงินสด และจำนวนออเดอร์
- หน้าขายมีหัวข้อย่อย `ขายสินค้า` และ `ประวัติการขาย`
- Modifier popup สำหรับเมนูเบอร์เกอร์
- ตะกร้า แก้จำนวน ลบด้วยการลดเหลือ 0 หมายเหตุรายรายการ และหมายเหตุทั้งออเดอร์
- เลือกพิมพ์ใบครัว/ใบเสร็จก่อน checkout
- ตะกร้าและชำระเงิน เงินสด/เงินโอน
- เงินสดมีปุ่มลัด `20`, `50`, `100`, `500`, `1000` และกดซ้ำเพื่อบวกยอด
- ประวัติออเดอร์ล่าสุด
- Inventory realtime-ready พร้อม filter วัตถุดิบใกล้หมด/หมดแล้ว
- จัดการวัตถุดิบ พร้อมปุ่ม `เพิ่มรายการวัตถุดิบใหม่` แยกชัดเจน เพิ่ม/แก้ไข stock ขั้นต่ำ หน่วยหลัก และปรับ stock manual พร้อมเหตุผล
- จัดการหน่วยซื้อ เช่น `1 แพ็ค = 10 ชิ้น`
- หน้าเมนู/สูตร BOM สำหรับเพิ่ม/แก้ไขเมนู ราคา หมวด เปิดปิดขาย และสูตรวัตถุดิบต่อ 1 ชิ้น
- Expense เลือกวันที่ได้ ลงหลายรายการพร้อมกันในตาราง เลือกวัตถุดิบจากฐานกลาง, เพิ่มรายการทั่วไป, เพิ่มวัตถุดิบใหม่ และ preview conversion
- Settings บันทึกค่า printer, Google Sheet ID, template ใบครัว/ใบเสร็จ ลง localStorage
- ดู print queue / Google Sheet sync queue และ mark done สำหรับทดสอบ flow
- Local queue ใน IndexedDB สำหรับ print jobs และ Google Sheet sync jobs
- Supabase schema อยู่ที่ `supabase/schema.sql`

## Google Sheet

Google Sheet ใช้เป็นสำเนา/รายงาน ไม่ใช่ source of truth:

`https://docs.google.com/spreadsheets/d/1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI/edit`

ข้อมูลที่ควร sync:

- orders
- payments
- expenses
- expense_items
- stock_movements
- daily summary

## Next backend step

1. Deploy `supabase/schema.sql`
2. ใส่ seed data จริงของร้าน
3. ทำ Supabase client และเรียก RPC `create_order`, `record_expense_purchase`
4. ทำ worker หรือ Apps Script endpoint สำหรับอ่าน `sheet_sync_jobs` แล้ว append ลง Google Sheet
5. ต่อ RawBT/local print bridge สำหรับ ESC/POS silent print บน Android

## Android Thai printer prototype

This project includes a Capacitor Android prototype for testing Thai bitmap printing on POS-8390 over Wi-Fi/LAN.

```powershell
npm install
npm run cap:sync
npm run cap:open
```

Requirements on the build machine:

- JDK 17
- Android Studio with Android SDK
- POS-8390 connected to the same Wi-Fi/LAN network

In the Android app, open `ตั้งค่า` -> `ทดสอบพิมพ์ไทย`, set the printer IP and port `9100`, then test receipt or kitchen order printing. The prototype renders the receipt as a canvas bitmap first, so Thai text, logo, bold item rows, normal modifier rows, right-aligned prices, feed, and auto cut are sent as ESC/POS raster data.
