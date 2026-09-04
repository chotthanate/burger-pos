# Work Status

Updated: 2026-09-05

## Important live-system context

- The mobile dashboard synchronization fix is merged into `main` and deployed through GitHub Pages.
- On 2026-07-16, the live Supabase `products` app-state row was restored from the real Google Sheet catalog after an old four-item test catalog appeared on phones. The restored catalog contained 22 entries when verified.
- Recovery snapshots are stored only in the local ignored `tmp/recovery-2026-07-16/` directory. They must not be committed or deleted automatically.
- Burger POS ยังใช้ `public.pos_app_state` เป็น state หลักของแอปและ Google Sheets เป็นสำเนา/รายงาน
- เพิ่มคิว `centralSyncJobs` สำหรับส่งออเดอร์และการยกเลิกเข้า `boy_central` แบบ idempotent โดยหน้าร้านยังขายต่อได้เมื่อออฟไลน์
- หน้า Settings > BOY Central รองรับ Magic Link, จำ session ในเครื่อง, ส่ง Master snapshot และสั่งส่งคิวค้าง
- BOY Central เป็นแหล่งยอดสต็อกกลางแล้ว: POS ดึงยอดกลับเมื่อเปิดแอป/กลับมาออนไลน์/ทุก 15 วินาที และหลังส่งออเดอร์สำเร็จ โดยจะไม่ดึงยอดมาทับเมื่อยังมีคิวออฟไลน์ค้าง
- ย้ายออเดอร์ย้อนหลังที่แอปเก็บไว้ 200 รายการเข้า BOY Central แล้ว (บรรทัดขาย 284 รายการ, ยกเลิก 3 ออเดอร์) โดยไม่ตัดสต็อกย้อนหลังซ้ำ; ปุ่มซิงก์จะเติมเฉพาะรายการใหม่ที่ยังขาด
- เครื่อง Mac นี้มี Android build tools และสร้าง APK ใหม่ได้แล้ว; เอา Windows-only `org.gradle.java.home` ออกจากโปรเจกต์เพื่อให้ build สลับ PC/Mac ได้

## Pending work

- ต้องอนุญาต USB debugging บน Redmi Pad 2 เพื่อติดตั้ง APK รอบนี้
- หลังติดตั้ง ต้องเปิด Settings > BOY Central บนอุปกรณ์ POS และล็อกอินด้วยอีเมลผู้ดูแลหนึ่งครั้ง เพื่อให้ออเดอร์ใหม่ส่งเข้าฐานกลางและรับสต็อกจาก BOY ได้
- ยอดสต็อก POS เดิมถูกใช้เป็น opening balance ชั่วคราว 23 รายการแล้ว (รวมยอดติดลบเดิม); ต้องตรวจนับจริงและปรับยอดก่อนถือว่าเป็นสต็อกใช้งานจริง
- การแก้ Master ใน POS จะส่ง snapshot เพื่ออัปเดต mapping แต่ยังไม่เขียนทับ BOY Central Master โดยอัตโนมัติ
