# Work Status

Updated: 2026-09-02

## Important live-system context

- The mobile dashboard synchronization fix is merged into `main` and deployed through GitHub Pages.
- On 2026-07-16, the live Supabase `products` app-state row was restored from the real Google Sheet catalog after an old four-item test catalog appeared on phones. The restored catalog contained 22 entries when verified.
- Recovery snapshots are stored only in the local ignored `tmp/recovery-2026-07-16/` directory. They must not be committed or deleted automatically.
- Burger POS ยังใช้ `public.pos_app_state` เป็น state หลักของแอปและ Google Sheets เป็นสำเนา/รายงาน
- เพิ่มคิว `centralSyncJobs` สำหรับส่งออเดอร์และการยกเลิกเข้า `boy_central` แบบ idempotent โดยหน้าร้านยังขายต่อได้เมื่อออฟไลน์
- หน้า Settings > BOY Central รองรับ Magic Link, จำ session ในเครื่อง, ส่ง Master snapshot และสั่งส่งคิวค้าง

## Pending work

- ต้องเปิดหน้า Settings > BOY Central บนอุปกรณ์ POS และล็อกอินด้วยอีเมลผู้ดูแลหนึ่งครั้งก่อนคิวกลางจะเริ่มส่ง
- ยังไม่ย้ายออเดอร์ย้อนหลัง 200 รายการหรือยอดสต็อกเดิม; ต้องตรวจช่วงวันที่และกำหนด opening stock ก่อนนำเข้า
- การแก้ Master ใน POS จะส่ง snapshot เพื่ออัปเดต mapping แต่ยังไม่เขียนทับ BOY Central Master โดยอัตโนมัติ
