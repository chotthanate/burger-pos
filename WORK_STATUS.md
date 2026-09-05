# Work Status

Updated: 2026-09-05

## Important live-system context

- The mobile dashboard synchronization fix is merged into `main` and deployed through GitHub Pages.
- On 2026-07-16, the live Supabase `products` app-state row was restored from the real Google Sheet catalog after an old four-item test catalog appeared on phones. The restored catalog contained 22 entries when verified.
- Recovery snapshots are stored only in the local ignored `tmp/recovery-2026-07-16/` directory. They must not be committed or deleted automatically.
- Burger POS ใช้ `public.pos_app_state` และ BOY Central เป็นข้อมูลออนไลน์หลัก โดย Google Sheets เป็นสำเนา/รายงาน ไม่ใช้ Sheet App State กลับมาทับเมื่อ Supabase ถูกตั้งค่าแล้ว
- เพิ่มคิว `centralSyncJobs` สำหรับส่งออเดอร์และการยกเลิกเข้า `boy_central` แบบ idempotent โดยหน้าร้านยังขายต่อได้เมื่อออฟไลน์
- POS ไม่มีหน้าล็อกอินและไม่ใช้บัญชีเจ้าของร้าน โดยจะสร้าง session ประจำเครื่องอัตโนมัติและส่งเฉพาะออเดอร์/สต็อกที่จำเป็น; การจัดการ Master ทำจาก BOY ฝั่งผู้ดูแล
- BOY Central เป็นแหล่งยอดสต็อกกลางแล้ว: POS ดึงยอดกลับเมื่อเปิดแอป/กลับมาออนไลน์/ทุก 15 วินาที และหลังส่งออเดอร์สำเร็จ โดยจะไม่ดึงยอดมาทับเมื่อยังมีคิวออฟไลน์ค้าง
- กู้ประวัติขายจาก Google Sheet และแท็บเล็ตได้ครบ 1,481 ออเดอร์ (ก.ค. 636, ส.ค. 748, ก.ย. 97; ยกเลิก 20) เข้า BOY Central แล้ว โดยไม่ตัดสต็อกย้อนหลังซ้ำ
- แท็บ `Sales` ใน Google Sheet ถูกจัดใหม่เป็นข้อมูลมาตรฐาน 2,434 แถว ครบ 1,481 ออเดอร์และไม่มีออร์เดอร์ซ้ำจากงานที่เคยส่งค้าง
- แอปเก็บประวัติออร์เดอร์ทั้งหมดใน IndexedDB แทน localStorage และเลิกจำกัด 200 ออเดอร์แล้ว; ตรวจบน Redmi Pad 2 พบ 1,481 ออเดอร์ คิว Sheet/Central ค้าง 0
- Apps Script deployment หลักอยู่ที่เวอร์ชัน 21 และเขียนข้อมูลเป็นชุดพร้อม lock เพื่อลด timeout และแถวซ้ำ
- เครื่อง Mac นี้มี Android build tools และสร้าง APK ใหม่ได้แล้ว; เอา Windows-only `org.gradle.java.home` ออกจากโปรเจกต์เพื่อให้ build สลับ PC/Mac ได้

## Pending work

- ติดตั้ง APK รุ่นล่าสุดบน Redmi Pad 2 แล้วโดยรักษาข้อมูลเดิมในเครื่องไว้; Wi-Fi เชื่อมต่อและ Dashboard แสดงยอดเดือนสิงหาคม 67,099 บาทตามประวัติที่กู้คืน
- งานรหัส/สิทธิ์ประจำเครื่องยังไม่ทำตามคำสั่งผู้ใช้; หากจะเปิดภายหลังจึงค่อยตั้งค่า Anonymous Sign-ins และอนุมัติ UUID ของ Redmi Pad 2 เป็น `staff` เฉพาะสาขา BURGER
- ยอดสต็อก POS เดิมถูกใช้เป็น opening balance ชั่วคราว 23 รายการแล้ว (รวมยอดติดลบเดิม); ต้องตรวจนับจริงและปรับยอดก่อนถือว่าเป็นสต็อกใช้งานจริง
- การแก้ Master ใน POS จะส่ง snapshot เพื่ออัปเดต mapping แต่ยังไม่เขียนทับ BOY Central Master โดยอัตโนมัติ
