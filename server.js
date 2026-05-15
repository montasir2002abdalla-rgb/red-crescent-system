require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key-change-in-production';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== إعدادات PostgreSQL =====================
// ===================== إعدادات PostgreSQL =====================
// دعم DATABASE_URL من Render والمتغيرات المنفصلة
let poolConfig;

if (process.env.DATABASE_URL) {
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
    console.log('✅ استخدام DATABASE_URL للاتصال بقاعدة البيانات');
} else {
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'red_crescent_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
    console.log('✅ استخدام المتغيرات المنفصلة للاتصال بقاعدة البيانات');
}

const pool = new Pool(poolConfig);

// تحسين اختبار الاتصال مع رسائل أوضح
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        console.error('⚠️ تأكد من صحة متغيرات البيئة: DATABASE_URL أو (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)');
        console.log('⚠️ سيتم إعادة المحاولة بعد 10 ثوان...');
        setTimeout(() => {
            pool.connect((err2, client2, release2) => {
                if (err2) {
                    console.error('❌ فشل الاتصال مرة أخرى:', err2.message);
                } else {
                    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح بعد إعادة المحاولة');
                    release2();
                    initDatabase();
                }
            });
        }, 10000);
    } else {
        console.log('✅ تم الاتصال بقاعدة بيانات PostgreSQL بنجاح');
        release();
        initDatabase();
    }
});

// اختبار الاتصال بقاعدة البيانات
pool.connect(async (err, client, release) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات PostgreSQL:', err.message);
    } else {
        console.log('✅ تم الاتصال بقاعدة بيانات PostgreSQL بنجاح');
        release();
        await initDatabase();
    }
});

// ===================== إعدادات البريد الإلكتروني =====================
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER || 'red1956hilal@gmail.com',
        pass: process.env.EMAIL_PASS || '0909202260mont'
    }
});

// التحقق من اتصال البريد
emailTransporter.verify((error, success) => {
    if (error) {
        console.error('❌ خطأ في إعدادات البريد الإلكتروني:', error.message);
    } else {
        console.log('✅ تم إعداد البريد الإلكتروني بنجاح');
        console.log(`📧 البريد المرسل: ${process.env.EMAIL_USER || 'red1956hilal@gmail.com'}`);
    }
});

// ===================== دوال مساعدة =====================
function validatePhone(p) { return /^\d{10}$/.test(p); }
function validateNationalId(n) { return /^\d{11}$/.test(n); }
function validatePassword(p) { return p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p); }
const hashPassword = (pw) => bcrypt.hashSync(pw, 10);

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function sendEmail(to, subject, html) {
    try {
        const info = await emailTransporter.sendMail({
            from: `"جمعية الهلال الأحمر" <${process.env.EMAIL_USER || 'red1956hilal@gmail.com'}>`,
            to: to,
            subject: subject,
            html: html
        });
        console.log('✅ تم إرسال البريد:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ خطأ في إرسال البريد:', error.message);
        return false;
    }
}

// تخزين رموز التحقق المؤقتة
const tempVerificationCodes = new Map();

// ===================== دوال مساعدة API =====================
async function generateRequestNumber() {
    const result = await pool.query(`SELECT MAX(request_number) as max_num FROM assistance_requests`);
    let nextNum = (result.rows[0]?.max_num || 999) + 1;
    if (nextNum > 9999) nextNum = 1000;
    return nextNum;
}

async function reserveInventory(category, qty, beneficiaryId, requestId, warehouseId) {
    const result = await pool.query(
        `SELECT * FROM inventory WHERE category = $1 AND warehouse_id = $2 AND (quantity - COALESCE(reserved_quantity,0)) >= $3 ORDER BY expiry_date ASC LIMIT 1`,
        [category, warehouseId, qty]
    );
    if (result.rows.length === 0) throw new Error('لا يوجد مخزون كافٍ في المخزن المحدد');
    const item = result.rows[0];
    const newReserved = (item.reserved_quantity || 0) + qty;
    await pool.query(`UPDATE inventory SET reserved_quantity = $1 WHERE id = $2`, [newReserved, item.id]);
    await pool.query(
        `INSERT INTO inventory_reservations (inventory_id, beneficiary_id, request_id, quantity, expires_at) 
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')`,
        [item.id, beneficiaryId, requestId, qty]
    );
    return true;
}

async function sendNotification(userId, message, type = 'notification') {
    await pool.query(`INSERT INTO complaints (user_id, user_role, message, type) VALUES ($1, 'system', $2, $3)`, [userId, message, type]);
}

// ===================== تهيئة قاعدة البيانات =====================
async function initDatabase() {
    try {
        // جدول الولايات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS states (
                id SERIAL PRIMARY KEY,
                name_ar TEXT UNIQUE NOT NULL,
                name_en TEXT
            )
        `);
        console.log('✅ تم إنشاء جدول states');

        // جدول المحليات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS localities (
                id SERIAL PRIMARY KEY,
                state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
                name_ar TEXT NOT NULL
            )
        `);
        console.log('✅ تم إنشاء جدول localities');

        // جدول المخازن
        await pool.query(`
            CREATE TABLE IF NOT EXISTS warehouses (
                id SERIAL PRIMARY KEY,
                locality_id INTEGER NOT NULL REFERENCES localities(id) ON DELETE CASCADE,
                name_ar TEXT NOT NULL,
                address TEXT,
                phone TEXT,
                user_id INTEGER
            )
        `);
        console.log('✅ تم إنشاء جدول warehouses');

        // جدول المستخدمين
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                employeeId TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'volunteer',
                status TEXT DEFAULT 'pending',
                approved INTEGER DEFAULT 0,
                qualifications TEXT,
                motivation TEXT,
                joinDate TEXT,
                gender TEXT,
                state TEXT,
                city TEXT,
                area TEXT,
                nationalId TEXT,
                warehouse_id INTEGER,
                email_verified INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول users');

        // جدول رموز التحقق
        await pool.query(`
            CREATE TABLE IF NOT EXISTS verification_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                email TEXT NOT NULL,
                token TEXT NOT NULL,
                type TEXT DEFAULT 'email_verification',
                expires_at TIMESTAMP NOT NULL,
                used INTEGER DEFAULT 0
            )
        `);
        console.log('✅ تم إنشاء جدول verification_tokens');

        // جدول التبرعات المالية
        await pool.query(`
            CREATE TABLE IF NOT EXISTS donations (
                id SERIAL PRIMARY KEY,
                donor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                donor_name TEXT NOT NULL,
                amount REAL,
                payment_method TEXT,
                transaction_id TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول donations');

        // جدول التبرعات العينية
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inkind_donations (
                id SERIAL PRIMARY KEY,
                donor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                donor_name TEXT NOT NULL,
                item_name TEXT NOT NULL,
                category TEXT,
                quantity INTEGER DEFAULT 1,
                unit TEXT DEFAULT 'قطعة',
                description TEXT,
                status TEXT DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول inkind_donations');

        // جدول المستفيدين
        await pool.query(`
            CREATE TABLE IF NOT EXISTS beneficiaries (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                id_number TEXT UNIQUE NOT NULL,
                phone TEXT NOT NULL,
                address TEXT,
                family_members INTEGER,
                health_status TEXT,
                gender TEXT,
                national_id TEXT,
                family_members_json TEXT,
                registered_by INTEGER,
                state TEXT,
                city TEXT,
                area TEXT,
                warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول beneficiaries');

        // جدول السجلات الصحية
        await pool.query(`
            CREATE TABLE IF NOT EXISTS health_records (
                id SERIAL PRIMARY KEY,
                beneficiary_id INTEGER REFERENCES beneficiaries(id) ON DELETE CASCADE,
                record_date TEXT,
                diagnosis TEXT,
                treatment TEXT,
                notes TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول health_records');

        // جدول طلبات المساعدة
        await pool.query(`
            CREATE TABLE IF NOT EXISTS assistance_requests (
                id SERIAL PRIMARY KEY,
                request_number INTEGER UNIQUE,
                beneficiary_id INTEGER REFERENCES beneficiaries(id) ON DELETE CASCADE,
                request_type TEXT,
                description TEXT,
                status TEXT DEFAULT 'pending',
                quantity INTEGER DEFAULT 1,
                amount REAL DEFAULT 0,
                approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                approved_at TEXT,
                dispensed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                dispensed_at TEXT,
                warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول assistance_requests');

        // جدول المخزون
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                item_name TEXT NOT NULL,
                category TEXT,
                sub_category TEXT,
                quantity INTEGER,
                reserved_quantity INTEGER DEFAULT 0,
                unit TEXT,
                expiry_date TEXT,
                min_stock INTEGER DEFAULT 0,
                warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول inventory');

        // جدول حجوزات المخزون
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory_reservations (
                id SERIAL PRIMARY KEY,
                inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
                beneficiary_id INTEGER REFERENCES beneficiaries(id) ON DELETE CASCADE,
                request_id INTEGER REFERENCES assistance_requests(id) ON DELETE CASCADE,
                quantity INTEGER,
                reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                status TEXT DEFAULT 'active'
            )
        `);
        console.log('✅ تم إنشاء جدول inventory_reservations');

        // جدول سجل صرف المساعدات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dispense_log (
                id SERIAL PRIMARY KEY,
                request_id INTEGER REFERENCES assistance_requests(id) ON DELETE SET NULL,
                beneficiary_id INTEGER REFERENCES beneficiaries(id) ON DELETE CASCADE,
                inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
                quantity INTEGER,
                dispensed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                dispensed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT
            )
        `);
        console.log('✅ تم إنشاء جدول dispense_log');

        // جدول المعاملات المالية
        await pool.query(`
            CREATE TABLE IF NOT EXISTS financial_transactions (
                id SERIAL PRIMARY KEY,
                donation_id INTEGER REFERENCES donations(id) ON DELETE SET NULL,
                amount REAL,
                type TEXT,
                description TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                beneficiary_id INTEGER REFERENCES beneficiaries(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول financial_transactions');

        // جدول فرق الطوارئ
        await pool.query(`
            CREATE TABLE IF NOT EXISTS emergency_teams (
                id SERIAL PRIMARY KEY,
                team_name TEXT,
                leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                members TEXT,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول emergency_teams');

        // جدول الشكاوى والإشعارات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                user_role TEXT,
                message TEXT,
                type TEXT,
                read INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول complaints');

        // جدول اللوجستيات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS logistics (
                id SERIAL PRIMARY KEY,
                request_id INTEGER REFERENCES assistance_requests(id) ON DELETE SET NULL,
                from_location TEXT,
                to_location TEXT,
                status TEXT DEFAULT 'pending',
                assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ تم إنشاء جدول logistics');

        console.log('🎉 تم إنشاء جميع الجداول بنجاح');

        // ===================== إدخال بيانات الولايات والمحليات =====================
        const statesData = [
            { name: "الخرطوم", localities: ["بحري", "امبدة", "أم درمان", "كرري", "جبل أولياء", "شرق النيل", "الخرطوم"] },
            { name: "شمال دارفور", localities: ["الفاشر", "كتم", "كلمندو", "مالحة", "سايح"] },
            { name: "جنوب دارفور", localities: ["نيالا", "ربيعة", "شمال جبل مرة", "كاس", "عديلا"] },
            { name: "شرق دارفور", localities: ["الضعين", "أبو كارنكا", "بئر عوض", "يلدا", "عسلاية"] },
            { name: "غرب دارفور", localities: ["الجنينة", "سراف عمرة", "حبيبيلة", "بندسي", "كرينك"] },
            { name: "وسط دارفور", localities: ["زالنجي", "بندقو", "وادي صالح", "أزوم", "روكرو"] },
            { name: "شمال كردفان", localities: ["الأبيض", "سودري", "برام", "شيكان", "أم روابة"] },
            { name: "جنوب كردفан", localities: ["كادوقلي", "أبو جبيهة", "تلودي", "الدلنج", "رشاد"] },
            { name: "غرب كردفان", localities: ["النهود", "كيليك", "الأبيض الجديدة", "بابانوسة", "لجين"] },
            { name: "النيل الأبيض", localities: ["ربك", "كوستي", "الجزيرة أبا", "القوتة", "الدويم"] },
            { name: "النيل الأزرق", localities: ["الدمازين", "باو", "القيسان", "الروصيرص", "تادامون"] },
            { name: "نهر النيل", localities: ["الدامر", "عطبرة", "شندي", "بربر", "أبو حمد"] },
            { name: "البحر الأحمر", localities: ["بورتسودان", "سواكن", "حلايب", "أروما", "طوكر"] },
            { name: "القضارف", localities: ["القضارف", "الفاو", "البطانة", "قلع النحل", "رهد البردي"] },
            { name: "كسلا", localities: ["كسلا", "حلفا الجديدة", "أروما", "اللكويت", "خشم القربة"] },
            { name: "سنار", localities: ["سنار", "سنجة", "الدندر", "السوكي", "أبو حجار"] },
            { name: "الجزيرة", localities: ["ود مدني", "الحصاحيصا", "الكاملين", "المناقل", "أم القرى"] },
            { name: "شمال السودان", localities: ["دنقلا", "مروي", "وادي حلفا", "البرقيق", "سليم"] }
        ];

        for (const state of statesData) {
            const stateResult = await pool.query(
                `INSERT INTO states (name_ar) VALUES ($1) ON CONFLICT (name_ar) DO NOTHING RETURNING id`,
                [state.name]
            );
            let stateId = stateResult.rows[0]?.id;
            if (!stateId) {
                const existing = await pool.query(`SELECT id FROM states WHERE name_ar = $1`, [state.name]);
                stateId = existing.rows[0]?.id;
            }
            if (stateId) {
                for (const locality of state.localities) {
                    await pool.query(
                        `INSERT INTO localities (state_id, name_ar) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [stateId, locality]
                    );
                }
            }
        }
        console.log('✅ تم إدخال بيانات الولايات والمحليات');

        // إضافة مخزن افتراضي لكل محلية
        const localities = await pool.query(`SELECT id FROM localities`);
        for (const loc of localities.rows) {
            await pool.query(
                `INSERT INTO warehouses (locality_id, name_ar) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [loc.id, `مخزن ${loc.id}`]
            );
        }
        console.log('✅ تم إدخال بيانات المخازن الافتراضية');

        // ===================== المستخدمون الافتراضيون =====================
// ===================== المستخدمون الافتراضيون =====================
try {
    // مدير النظام
    const adminExists = await pool.query(`SELECT id FROM users WHERE employeeId = $1`, ['0001']);
    if (adminExists.rows.length === 0) {
        await pool.query(`
            INSERT INTO users (employeeId, name, email, phone, password, role, status, approved, joinDate, gender, email_verified)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, ['0001', 'مدير النظام', 'admin@redcrescent.org', '0912345678', hashPassword('admin123'), 'manager', 'active', 1, new Date().toISOString().split('T')[0], 'male', 1]);
        console.log('✅ تم إضافة المستخدم الافتراضي: مدير النظام');
    }

    // أمين المخزن
    const keeperExists = await pool.query(`SELECT id FROM users WHERE employeeId = $1`, ['0002']);
    if (keeperExists.rows.length === 0) {
        await pool.query(`
            INSERT INTO users (employeeId, name, email, phone, password, role, status, approved, joinDate, gender, email_verified)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, ['0002', 'أمين المخزن', 'keeper@redcrescent.org', '0912345679', hashPassword('keeper123'), 'inventory_keeper', 'active', 1, new Date().toISOString().split('T')[0], 'male', 1]);
        console.log('✅ تم إضافة المستخدم الافتراضي: أمين المخزن');
    }

    // ✅ مهم جداً: تأكيد البريد الإلكتروني للمستخدمين الافتراضيين (حتى لو كانوا موجودين)
    const updateResult = await pool.query(`UPDATE users SET email_verified = 1 WHERE employeeId IN ('0001', '0002') AND email_verified = 0`);
    if (updateResult.rowCount > 0) {
        console.log(`✅ تم تأكيد البريد الإلكتروني لـ ${updateResult.rowCount} مستخدم افتراضي`);
    } else {
        console.log('✅ المستخدمون الافتراضيون لديهم بريد مؤكد بالفعل');
    }
} catch (err) {
    console.error('❌ خطأ في إعداد المستخدمين الافتراضيين:', err.message);
}


// ===================== Middleware =====================
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح به' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'توكن غير صالح' });
        req.user = user;
        next();
    });
};

const requireManager = (req, res, next) => {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'يتطلب صلاحية مدير' });
    next();
};

const requireInventoryAccess = (req, res, next) => {
    if (!['manager', 'inventory_keeper'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    next();
};

// ===================== مسارات التحقق من البريد الإلكتروني =====================

// إرسال رمز التحقق
app.post('/api/send-verification-code', async (req, res) => {
    const { email, role } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }
    
    try {
        const userExists = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
        }
        
        const code = generateVerificationCode();
        const expiresAt = Date.now() + 10 * 60 * 1000;
        
        tempVerificationCodes.set(email, { code, expiresAt, role });
        
        setTimeout(() => {
            if (tempVerificationCodes.has(email)) {
                tempVerificationCodes.delete(email);
            }
        }, 10 * 60 * 1000);
        
        const emailHtml = `
            <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: linear-gradient(145deg, #8e2323, #6b1f1f); padding: 20px; text-align: center; border-radius: 20px 20px 0 0;">
                    <div style="width: 60px; height: 60px; background: white; border-radius: 50%; margin: 0 auto; position: relative;">
                        <div style="width: 30px; height: 30px; background: #8e2323; border-radius: 50%; position: absolute; top: 15px; right: 15px;"></div>
                    </div>
                    <h2 style="color: white; margin-top: 10px;">جمعية الهلال الأحمر</h2>
                    <p style="color: white; margin: 5px 0 0;">السودان</p>
                </div>
                <div style="background: white; padding: 30px; border-radius: 0 0 20px 20px;">
                    <h3 style="color: #0288d1;">رمز التحقق الخاص بك</h3>
                    <p>استخدم الرمز التالي لإكمال عملية التسجيل:</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; background: #e1f5fe; padding: 15px 30px; border-radius: 12px; color: #0288d1; direction: ltr; display: inline-block;">${code}</span>
                    </div>
                    <p>🔐 هذا الرمز صالح لمدة 10 دقائق</p>
                    <hr style="margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">© 2025 جمعية الهلال الأحمر - جميع الحقوق محفوظة</p>
                </div>
            </div>
        `;
        
        const sent = await sendEmail(email, 'رمز التحقق - جمعية الهلال الأحمر', emailHtml);
        
        if (sent) {
            res.json({ message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
        } else {
            res.status(500).json({ error: 'فشل إرسال البريد. يرجى المحاولة لاحقاً' });
        }
    } catch (err) {
        console.error('خطأ في إرسال رمز التحقق:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// التحقق من الرمز
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;
    
    if (!email || !code) {
        return res.status(400).json({ error: 'البريد الإلكتروني والرمز مطلوبان' });
    }
    
    const stored = tempVerificationCodes.get(email);
    
    if (!stored) {
        return res.status(400).json({ error: 'لم يتم إرسال رمز لهذا البريد أو انتهت صلاحيته' });
    }
    
    if (stored.code !== code) {
        return res.status(400).json({ error: 'الرمز غير صحيح' });
    }
    
    if (Date.now() > stored.expiresAt) {
        tempVerificationCodes.delete(email);
        return res.status(400).json({ error: 'انتهت صلاحية الرمز. يرجى طلب رمز جديد' });
    }
    
    tempVerificationCodes.delete(email);
    
    res.json({ message: 'تم التحقق بنجاح! يمكنك إكمال التسجيل' });
});

// إعادة إرسال رمز التحقق
app.post('/api/resend-verification', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
    }
    
    try {
        const userExists = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
        }
        
        const code = generateVerificationCode();
        const expiresAt = Date.now() + 10 * 60 * 1000;
        
        tempVerificationCodes.set(email, { code, expiresAt });
        
        setTimeout(() => {
            if (tempVerificationCodes.has(email)) {
                tempVerificationCodes.delete(email);
            }
        }, 10 * 60 * 1000);
        
        const emailHtml = `
            <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: linear-gradient(145deg, #8e2323, #6b1f1f); padding: 20px; text-align: center; border-radius: 20px 20px 0 0;">
                    <h2 style="color: white;">جمعية الهلال الأحمر</h2>
                </div>
                <div style="background: white; padding: 30px; border-radius: 0 0 20px 20px;">
                    <h3 style="color: #0288d1;">إعادة إرسال رمز التحقق</h3>
                    <p>رمز التحقق الجديد الخاص بك هو:</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; background: #e1f5fe; padding: 15px 30px; border-radius: 12px; color: #0288d1;">${code}</span>
                    </div>
                    <p>هذا الرمز صالح لمدة 10 دقائق</p>
                </div>
            </div>
        `;
        
        const sent = await sendEmail(email, 'إعادة إرسال رمز التحقق - جمعية الهلال الأحمر', emailHtml);
        
        if (sent) {
            res.json({ message: 'تم إعادة إرسال رمز التحقق إلى بريدك الإلكتروني' });
        } else {
            res.status(500).json({ error: 'فشل إرسال البريد. يرجى المحاولة لاحقاً' });
        }
    } catch (err) {
        console.error('خطأ في إعادة إرسال رمز التحقق:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// ===================== مسار التسجيل الجديد =====================
app.post('/api/register', async (req, res) => {
    const {
        employeeId, name, email, phone, password, role,
        qualifications, motivation, familySize, gender,
        nationalId, familyMembersJSON, healthStatus,
        state, city, area, warehouse_id, donorType
    } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب وصالح' });
    }
    
    if (phone && !validatePhone(phone)) {
        return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون 10 أرقام' });
    }
    
    if (role === 'beneficiary' && nationalId && !validateNationalId(nationalId)) {
        return res.status(400).json({ error: 'الرقم الوطني يجب أن يكون 11 رقمًا' });
    }
    
    if (!validatePassword(password)) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل وتحتوي على حروف وأرقام' });
    }

    try {
        const existingUser = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
        }

        let finalEmployeeId = employeeId;
        
        if (role === 'donor' || role === 'beneficiary') {
            const maxId = await pool.query(`
                SELECT employeeId FROM users WHERE role IN ('donor', 'beneficiary') 
                AND employeeId ~ '^[0-9]+$' ORDER BY CAST(employeeId AS INTEGER) DESC LIMIT 1
            `);
            let nextNum = 10000;
            if (maxId.rows.length > 0) {
                nextNum = parseInt(maxId.rows[0].employeeid) + 1;
            }
            finalEmployeeId = nextNum.toString();
        } else {
            if (!employeeId || !/^\d{4}$/.test(employeeId)) {
                return res.status(400).json({ error: 'رقم الموظف يجب أن يكون 4 أرقام بالضبط' });
            }
            const existingEmp = await pool.query(`SELECT id FROM users WHERE employeeId = $1`, [employeeId]);
            if (existingEmp.rows.length > 0) {
                return res.status(400).json({ error: 'رقم الموظف موجود مسبقاً' });
            }
            finalEmployeeId = employeeId;
        }

        const hashed = hashPassword(password);
        const joinDate = new Date().toISOString().split('T')[0];
        const approved = (role === 'donor' || role === 'beneficiary') ? 1 : 0;
        const status = approved ? 'active' : 'pending';
        
        const result = await pool.query(`
            INSERT INTO users (
                employeeId, name, email, phone, password, role, status, approved,
                qualifications, motivation, joinDate, gender, state, city, area,
                nationalId, warehouse_id, email_verified, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 1, CURRENT_TIMESTAMP)
            RETURNING id
        `, [finalEmployeeId, name, email, phone, hashed, role, status, approved,
            qualifications || null, motivation || null, joinDate, gender || null,
            state || null, city || null, area || null, nationalId || null,
            warehouse_id || null]);
        
        const userId = result.rows[0].id;
        
        if (role === 'beneficiary') {
            await pool.query(`
                INSERT INTO beneficiaries (
                    user_id, name, id_number, phone, family_members, gender,
                    national_id, family_members_json, health_status, state, city, area, warehouse_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [userId, name, finalEmployeeId, phone, familySize || 1, gender || null,
                nationalId || null, familyMembersJSON || '[]', healthStatus || null,
                state || null, city || null, area || null, warehouse_id || null]);
        }
        
        res.status(201).json({
            id: userId,
            message: 'تم تسجيل حسابك بنجاح',
            employeeId: finalEmployeeId,
            email: email
        });
        
    } catch (err) {
        console.error('خطأ في التسجيل:', err);
        if (err.constraint === 'users_employeeid_key') {
            res.status(400).json({ error: 'رقم الموظف موجود مسبقاً' });
        } else if (err.constraint === 'users_email_key') {
            res.status(400).json({ error: 'البريد الإلكتروني موجود مسبقاً' });
        } else {
            res.status(500).json({ error: 'حدث خطأ في الخادم' });
        }
    }
});

// ===================== مسار تسجيل الدخول =====================
app.post('/api/auth/login', async (req, res) => {
    const { employeeId, password } = req.body;
    
    try {
        const result = await pool.query(`SELECT * FROM users WHERE employeeId = $1`, [employeeId]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(401).json({ error: 'الرقم الوظيفي أو كلمة المرور غير صحيحة' });
        }
        
        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'الرقم الوظيفي أو كلمة المرور غير صحيحة' });
        }
        
        if (user.status !== 'active') {
            return res.status(403).json({ error: 'الحساب غير مفعل بعد' });
        }
        
        if (!user.email_verified) {
            return res.status(403).json({ error: 'يرجى تأكيد بريدك الإلكتروني أولاً', requiresVerification: true, email: user.email });
        }
        
        const token = jwt.sign({
            id: user.id,
            employeeId: user.employeeid,
            name: user.name,
            role: user.role,
            approved: user.approved
        }, SECRET_KEY, { expiresIn: '24h' });
        
        res.json({
            token,
            user: {
                id: user.id,
                employeeId: user.employeeid,
                name: user.name,
                role: user.role,
                approved: user.approved
            }
        });
    } catch (err) {
        console.error('خطأ في تسجيل الدخول:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// ===================== مسار تغيير كلمة المرور =====================
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    
    if (!validatePassword(newPassword)) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل وتحتوي على حروف وأرقام' });
    }
    
    try {
        const result = await pool.query(`SELECT password FROM users WHERE id = $1`, [req.user.id]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        if (!bcrypt.compareSync(oldPassword, user.password)) {
            return res.status(401).json({ error: 'كلمة المرور القديمة غير صحيحة' });
        }
        
        await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashPassword(newPassword), req.user.id]);
        
        res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (err) {
        console.error('خطأ:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// ===================== مسارات "نسيت كلمة السر" =====================

// جلب بيانات الموقع للمستخدم
app.post('/api/get-user-location', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
    }
    
    try {
        const result = await pool.query(`SELECT state, city FROM users WHERE email = $1`, [email]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        res.json({
            exists: true,
            hasLocation: !!(user.state && user.city),
            state: user.state || '',
            city: user.city || ''
        });
    } catch (err) {
        console.error('خطأ:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// طلب إعادة تعيين كلمة المرور مع التحقق بالولاية والمحلية
app.post('/api/forgot-password', async (req, res) => {
    const { email, state, city } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
    }
    
    if (!state || !city) {
        return res.status(400).json({ error: 'الولاية والمحلية مطلوبتان للتحقق من الهوية' });
    }
    
    try {
        const result = await pool.query(`SELECT id, name, state, city FROM users WHERE email = $1`, [email]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(404).json({ error: 'لم يتم العثور على حساب مرتبط بهذا البريد الإلكتروني' });
        }
        
        const userState = user.state || '';
        const userCity = user.city || '';
        
        if (userState !== state || userCity !== city) {
            return res.status(403).json({
                error: 'بيانات الولاية أو المحلية غير صحيحة. يرجى التأكد من المعلومات التي أدخلتها عند التسجيل.'
            });
        }
        
        const resetToken = generateResetToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        
        await pool.query(
            `UPDATE verification_tokens SET used = 1 WHERE user_id = $1 AND type = 'password_reset' AND used = 0`,
            [user.id]
        );
        
        await pool.query(
            `INSERT INTO verification_tokens (user_id, email, token, type, expires_at) VALUES ($1, $2, $3, 'password_reset', $4)`,
            [user.id, email, resetToken, expiresAt]
        );
        
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;
        
        const emailHtml = `
            <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: linear-gradient(145deg, #8e2323, #6b1f1f); padding: 20px; text-align: center; border-radius: 20px 20px 0 0;">
                    <div style="width: 50px; height: 50px; background: white; border-radius: 50%; margin: 0 auto;"></div>
                    <h2 style="color: white; margin-top: 10px;">جمعية الهلال الأحمر</h2>
                    <p style="color: white; margin: 5px 0 0;">السودان</p>
                </div>
                <div style="background: white; padding: 30px; border-radius: 0 0 20px 20px;">
                    <h3 style="color: #0288d1;">السلام عليكم ${user.name}،</h3>
                    <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك.</p>
                    <p><strong>✅ معلومات التحقق:</strong> تم التحقق من هويتك عبر الولاية والمحلية.</p>
                    <p>انقر على الرابط أدناه لإنشاء كلمة مرور جديدة:</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${resetUrl}" style="background: linear-gradient(145deg, #0288d1, #01579b); color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; font-weight: bold; display: inline-block;">إعادة تعيين كلمة المرور</a>
                    </div>
                    <p>🔐 هذا الرابط صالح لمدة ساعة واحدة</p>
                    <hr style="margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 10px;">📍 تم تسجيل هذا الطلب من الولاية: ${state}، المحلية: ${city}</p>
                </div>
            </div>
        `;
        
        const sent = await sendEmail(email, 'إعادة تعيين كلمة المرور - جمعية الهلال الأحمر', emailHtml);
        
        if (sent) {
            res.json({ message: 'تم التحقق من هويتك بنجاح. تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.' });
        } else {
            res.status(500).json({ error: 'حدث خطأ في إرسال البريد الإلكتروني. يرجى المحاولة لاحقاً.' });
        }
    } catch (err) {
        console.error('خطأ:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// التحقق من صحة رمز إعادة التعيين
app.post('/api/verify-reset-token', async (req, res) => {
    const { email, token } = req.body;
    
    try {
        const result = await pool.query(
            `SELECT * FROM verification_tokens WHERE email = $1 AND token = $2 AND type = 'password_reset' AND used = 0 AND expires_at > NOW()`,
            [email, token]
        );
        const tokenRecord = result.rows[0];
        
        if (!tokenRecord) {
            return res.status(400).json({ error: 'الرابط غير صالح أو منتهي الصلاحية' });
        }
        
        res.json({ message: 'الرابط صالح', userId: tokenRecord.user_id });
    } catch (err) {
        console.error('خطأ:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// إعادة تعيين كلمة المرور
app.post('/api/reset-password', async (req, res) => {
    const { email, token, newPassword } = req.body;
    
    if (!validatePassword(newPassword)) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل وتحتوي على حروف وأرقام' });
    }
    
    try {
        const result = await pool.query(
            `SELECT * FROM verification_tokens WHERE email = $1 AND token = $2 AND type = 'password_reset' AND used = 0 AND expires_at > NOW()`,
            [email, token]
        );
        const tokenRecord = result.rows[0];
        
        if (!tokenRecord) {
            return res.status(400).json({ error: 'الرابط غير صالح أو منتهي الصلاحية' });
        }
        
        const hashedPassword = hashPassword(newPassword);
        
        await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashedPassword, tokenRecord.user_id]);
        await pool.query(`UPDATE verification_tokens SET used = 1 WHERE id = $1`, [tokenRecord.id]);
        
        res.json({ message: 'تم إعادة تعيين كلمة المرور بنجاح' });
    } catch (err) {
        console.error('خطأ:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// ===================== مسارات الولايات والمحليات والمخازن =====================

app.get('/api/states', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM states ORDER BY name_ar`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/localities/:stateId', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM localities WHERE state_id = $1 ORDER BY name_ar`, [req.params.stateId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/warehouses/:localityId', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM warehouses WHERE locality_id = $1`, [req.params.localityId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات المخزون =====================

app.get('/api/inventory/available', authenticateToken, requireInventoryAccess, async (req, res) => {
    const warehouseId = req.query.warehouse_id;
    let sql = `SELECT id, item_name as "itemName", category, sub_category as "subCategory", 
                      (quantity - COALESCE(reserved_quantity,0)) as available_quantity, 
                      unit, expiry_date as "expiryDate", min_stock as "minStock", warehouse_id 
               FROM inventory`;
    let params = [];
    if (warehouseId) {
        sql += ` WHERE warehouse_id = $1`;
        params.push(warehouseId);
    }
    try {
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/inventory', authenticateToken, requireInventoryAccess, async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM inventory ORDER BY last_updated DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory', authenticateToken, requireInventoryAccess, async (req, res) => {
    const { itemName, category, subCategory, quantity, unit, expiryDate, minStock, warehouse_id } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO inventory (item_name, category, sub_category, quantity, unit, expiry_date, min_stock, warehouse_id, last_updated) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP) RETURNING id`,
            [itemName, category, subCategory, quantity, unit, expiryDate, minStock, warehouse_id]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'تمت الإضافة' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/inventory/:id', authenticateToken, requireInventoryAccess, async (req, res) => {
    try {
        await pool.query(`UPDATE inventory SET quantity = $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2`, [req.body.quantity, req.params.id]);
        res.json({ message: 'تم التحديث' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        await pool.query(`DELETE FROM inventory WHERE id = $1`, [req.params.id]);
        res.json({ message: 'تم الحذف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات طلبات المساعدة =====================

app.post('/api/assistance-requests', authenticateToken, async (req, res) => {
    const { beneficiaryId, requestType, description, quantity = 1 } = req.body;
    try {
        const benResult = await pool.query(`SELECT warehouse_id FROM beneficiaries WHERE id = $1`, [beneficiaryId]);
        if (benResult.rows.length === 0) return res.status(400).json({ error: 'المستفيد غير موجود' });
        const warehouseId = benResult.rows[0].warehouse_id;
        const requestNumber = await generateRequestNumber();
        
        if (requestType !== 'financial') {
            const categoryMap = { food: 'food', medical: 'medical', shelter: 'shelter', other: 'other' };
            const category = categoryMap[requestType] || 'other';
            const result = await pool.query(
                `INSERT INTO assistance_requests (request_number, beneficiary_id, request_type, description, status, quantity, warehouse_id) 
                 VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING id`,
                [requestNumber, beneficiaryId, requestType, description, quantity, warehouseId]
            );
            const requestId = result.rows[0].id;
            await reserveInventory(category, quantity, beneficiaryId, requestId, warehouseId);
            res.status(201).json({ id: requestId, request_number: requestNumber, message: `تم تقديم الطلب برقم ${requestNumber} وحجز الكمية مؤقتاً` });
        } else {
            const result = await pool.query(
                `INSERT INTO assistance_requests (request_number, beneficiary_id, request_type, description, status, quantity, warehouse_id) 
                 VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING id`,
                [requestNumber, beneficiaryId, requestType, description, quantity, warehouseId]
            );
            res.status(201).json({ id: result.rows[0].id, request_number: requestNumber, message: `تم تقديم الطلب المالي برقم ${requestNumber}` });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/assistance-requests', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ar.*, b.name as beneficiaryName FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id ORDER BY ar.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/assistance-requests/pending', authenticateToken, async (req, res) => {
    if (!['employee', 'volunteer', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    try {
        const result = await pool.query(
            `SELECT ar.*, b.name as beneficiaryName, b.family_members as "familyMembers" 
             FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id 
             WHERE ar.status = 'pending' AND ar.request_type != 'financial' ORDER BY ar.created_at ASC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/assistance-requests/financial-pending', authenticateToken, requireManager, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ar.*, b.name as beneficiaryName FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id 
             WHERE ar.status = 'pending' AND ar.request_type = 'financial' ORDER BY ar.created_at ASC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/assistance-requests/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ar.*, b.name as beneficiaryName FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id WHERE ar.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'غير موجود' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/assistance-requests/:id/approve', authenticateToken, async (req, res) => {
    if (!['employee', 'volunteer', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    const requestId = req.params.id;
    const { quantity = 1 } = req.body;
    try {
        const requestResult = await pool.query(
            `SELECT ar.*, b.name as beneficiaryName, b.user_id as beneficiaryUserId, ar.request_number 
             FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id 
             WHERE ar.id = $1 AND ar.status = 'pending' AND ar.request_type != 'financial'`,
            [requestId]
        );
        if (requestResult.rows.length === 0) return res.status(400).json({ error: 'الطلب غير متاح للموافقة' });
        const request = requestResult.rows[0];
        await pool.query(
            `UPDATE assistance_requests SET status = 'approved', quantity = $1, approved_by = $2, approved_at = NOW() WHERE id = $3`,
            [quantity, req.user.id, requestId]
        );
        const receiptUrl = `${req.protocol}://${req.get('host')}/print-receipt.html?id=${request.request_number}&requestId=${request.request_number}&name=${encodeURIComponent(request.beneficiaryname)}&type=${request.request_type}&details=الكمية: ${quantity}`;
        const msg = `✅ تمت الموافقة على طلبك رقم ${request.request_number}. يمكنك طباعة الإشعار من الرابط التالي:\n${receiptUrl}`;
        await sendNotification(request.beneficiaryuserid, msg);
        res.json({ message: 'تمت الموافقة وإرسال إشعار قابل للطباعة' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/assistance-requests/:id/approve-financial', authenticateToken, requireManager, async (req, res) => {
    const requestId = req.params.id;
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'المبلغ غير صالح' });
    try {
        const requestResult = await pool.query(
            `SELECT ar.*, b.name as beneficiaryName, b.user_id as beneficiaryUserId, ar.request_number 
             FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id 
             WHERE ar.id = $1 AND ar.status = 'pending' AND ar.request_type = 'financial'`,
            [requestId]
        );
        if (requestResult.rows.length === 0) return res.status(400).json({ error: 'الطلب غير متاح' });
        const request = requestResult.rows[0];
        const balanceResult = await pool.query(
            `SELECT SUM(CASE WHEN type='income' THEN amount ELSE 0 END) - SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as balance FROM financial_transactions`
        );
        const balance = balanceResult.rows[0]?.balance || 0;
        if (balance < amount) return res.status(400).json({ error: 'الرصيد غير كافٍ' });
        await pool.query(
            `UPDATE assistance_requests SET status = 'approved', amount = $1, approved_by = $2, approved_at = NOW() WHERE id = $3`,
            [amount, req.user.id, requestId]
        );
        const receiptUrl = `${req.protocol}://${req.get('host')}/print-receipt.html?id=${request.request_number}&requestId=${request.request_number}&name=${encodeURIComponent(request.beneficiaryname)}&type=مالي&details=المبلغ: ${amount} جنيه`;
        const msg = `✅ تمت الموافقة على طلبك المالي رقم ${request.request_number} بمبلغ ${amount}. يمكنك طباعة الإشعار من الرابط:\n${receiptUrl}`;
        await sendNotification(request.beneficiaryuserid, msg);
        await pool.query(
            `INSERT INTO financial_transactions (amount, type, description, created_by, beneficiary_id) VALUES ($1, 'expense', $2, $3, $4)`,
            [amount, `صرف مساعدة مالية - طلب ${request.request_number}`, req.user.id, request.beneficiary_id]
        );
        res.json({ message: 'تمت الموافقة وتسجيل المصروف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/assistance-requests/:id/reject', authenticateToken, async (req, res) => {
    if (!['employee', 'volunteer', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    const requestId = req.params.id;
    try {
        const requestResult = await pool.query(
            `SELECT ar.*, b.user_id as beneficiaryUserId, ar.request_number 
             FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id 
             WHERE ar.id = $1 AND ar.status = 'pending'`,
            [requestId]
        );
        if (requestResult.rows.length === 0) return res.status(400).json({ error: 'الطلب غير متاح للرفض' });
        const request = requestResult.rows[0];
        await pool.query(`UPDATE assistance_requests SET status = 'rejected' WHERE id = $1`, [requestId]);
        await pool.query(`UPDATE inventory_reservations SET status = 'cancelled' WHERE request_id = $1`, [requestId]);
        await pool.query(
            `UPDATE inventory SET reserved_quantity = COALESCE(reserved_quantity,0) - COALESCE((SELECT quantity FROM inventory_reservations WHERE request_id = $1), 0) 
             WHERE id IN (SELECT inventory_id FROM inventory_reservations WHERE request_id = $1)`,
            [requestId]
        );
        const msg = `نأسف، تم رفض طلبك رقم ${request.request_number}.`;
        await sendNotification(request.beneficiaryuserid, msg);
        res.json({ message: 'تم الرفض' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسار صرف المساعدات =====================
app.post('/api/dispense', authenticateToken, async (req, res) => {
    if (!['manager', 'inventory_keeper'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    const { requestId, itemId, quantity } = req.body;
    if (!requestId || !itemId || !quantity) return res.status(400).json({ error: 'بيانات ناقصة' });
    try {
        const requestResult = await pool.query(`SELECT * FROM assistance_requests WHERE id = $1 AND status = 'approved'`, [requestId]);
        if (requestResult.rows.length === 0) return res.status(400).json({ error: 'الطلب غير معتمد' });
        const request = requestResult.rows[0];
        const reservationResult = await pool.query(`SELECT * FROM inventory_reservations WHERE request_id = $1 AND status = 'active'`, [requestId]);
        if (reservationResult.rows.length === 0) return res.status(400).json({ error: 'لا يوجد حجز نشط لهذا الطلب' });
        const reservation = reservationResult.rows[0];
        if (reservation.inventory_id !== itemId) return res.status(400).json({ error: 'الصنف المحدد لا يطابق الحجز' });
        const updateResult = await pool.query(
            `UPDATE inventory SET quantity = quantity - $1, reserved_quantity = reserved_quantity - $1 WHERE id = $2 AND quantity >= $1`,
            [quantity, itemId]
        );
        if (updateResult.rowCount === 0) return res.status(400).json({ error: 'فشل تحديث المخزون' });
        await pool.query(
            `UPDATE assistance_requests SET status = 'completed', dispensed_by = $1, dispensed_at = NOW() WHERE id = $2`,
            [req.user.id, requestId]
        );
        await pool.query(`UPDATE inventory_reservations SET status = 'dispensed' WHERE request_id = $1`, [requestId]);
        await pool.query(
            `INSERT INTO dispense_log (request_id, beneficiary_id, inventory_id, quantity, dispensed_by, notes) VALUES ($1, $2, $3, $4, $5, $6)`,
            [requestId, request.beneficiary_id, itemId, quantity, req.user.id, `صرف بموجب طلب ${request.request_number}`]
        );
        const benResult = await pool.query(`SELECT user_id FROM beneficiaries WHERE id = $1`, [request.beneficiary_id]);
        if (benResult.rows.length > 0) {
            await sendNotification(benResult.rows[0].user_id, `تم صرف طلبك رقم ${request.request_number} بنجاح.`);
        }
        res.json({ message: 'تم الصرف بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== تقرير المساعدات =====================
app.get('/api/beneficiary-assistance/:beneficiaryId', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT dl.*, i.item_name as "itemName", i.category, u.name as dispensedByName, ar.request_type as "requestType", ar.request_number
            FROM dispense_log dl
            JOIN inventory i ON dl.inventory_id = i.id
            JOIN users u ON dl.dispensed_by = u.id
            JOIN assistance_requests ar ON dl.request_id = ar.id
            WHERE dl.beneficiary_id = $1
            ORDER BY dl.dispensed_at DESC
        `, [req.params.beneficiaryId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== التحقق من نقص المخزون =====================
app.post('/api/check-low-stock', authenticateToken, requireInventoryAccess, async (req, res) => {
    try {
        const itemsResult = await pool.query(`SELECT * FROM inventory WHERE quantity <= min_stock AND min_stock > 0`);
        const items = itemsResult.rows;
        for (let item of items) {
            const msg = `⚠️ تنبيه: صنف "${item.item_name}" أصبح مخزونه منخفضاً (${item.quantity} متبقي). الحد الأدنى ${item.min_stock}.`;
            await sendNotification(1, msg);
            const wResult = await pool.query(`SELECT user_id FROM warehouses WHERE id = $1`, [item.warehouse_id]);
            if (wResult.rows.length > 0 && wResult.rows[0].user_id) {
                await sendNotification(wResult.rows[0].user_id, msg);
            }
        }
        res.json({ message: `تم إرسال ${items.length} إشعار` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== إعادة طباعة الإشعار =====================
app.get('/api/receipt-by-request/:requestNumber', authenticateToken, async (req, res) => {
    const requestNumber = req.params.requestNumber;
    try {
        const result = await pool.query(
            `SELECT ar.*, b.name as beneficiaryName FROM assistance_requests ar JOIN beneficiaries b ON ar.beneficiary_id = b.id WHERE ar.request_number = $1`,
            [requestNumber]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'الطلب غير موجود' });
        const request = result.rows[0];
        const details = request.request_type === 'financial' ? `المبلغ: ${request.amount} جنيه` : `الكمية: ${request.quantity}`;
        const receiptUrl = `${req.protocol}://${req.get('host')}/print-receipt.html?id=${request.request_number}&requestId=${request.request_number}&name=${encodeURIComponent(request.beneficiaryname)}&type=${request.request_type}&details=${encodeURIComponent(details)}`;
        res.json({ receiptUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات المستخدمين =====================
app.get('/api/users', authenticateToken, requireManager, async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM users ORDER BY created_at DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/pending', authenticateToken, requireManager, async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM users WHERE status = 'pending'`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/active', authenticateToken, requireManager, async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM users WHERE status = 'active'`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/approve/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        await pool.query(`UPDATE users SET status = 'active', approved = 1 WHERE id = $1`, [req.params.id]);
        res.json({ message: 'تمت الموافقة' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/reject/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
        res.json({ message: 'تم الرفض والحذف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', authenticateToken, requireManager, async (req, res) => {
    const { name, email, phone, role, status, gender, state, city, area, nationalId } = req.body;
    try {
        await pool.query(
            `UPDATE users SET name=$1, email=$2, phone=$3, role=$4, status=$5, gender=$6, state=$7, city=$8, area=$9, nationalId=$10 WHERE id=$11`,
            [name, email, phone, role, status, gender, state, city, area, nationalId, req.params.id]
        );
        res.json({ message: 'تم التحديث' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        await pool.query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
        res.json({ message: 'تم الحذف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات التبرعات =====================
app.post('/api/donations', authenticateToken, async (req, res) => {
    const { amount, paymentMethod, transactionId } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO donations (donor_id, donor_name, amount, payment_method, transaction_id, status) VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id`,
            [req.user.id, req.user.name, amount, paymentMethod, transactionId]
        );
        const donationId = result.rows[0].id;
        await pool.query(
            `INSERT INTO financial_transactions (donation_id, amount, type, description, created_by) VALUES ($1, $2, 'income', 'تبرع مالي', $3)`,
            [donationId, amount, req.user.id]
        );
        res.status(201).json({ id: donationId, message: 'تم تسجيل التبرع' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inkind-donations', authenticateToken, async (req, res) => {
    if (req.user.role !== 'donor') return res.status(403).json({ error: 'مسموح للمانحين فقط' });
    const { itemName, category, quantity, unit, description } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO inkind_donations (donor_id, donor_name, item_name, category, quantity, unit, description, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed') RETURNING id`,
            [req.user.id, req.user.name, itemName, category, quantity, unit, description]
        );
        const existingResult = await pool.query(
            `SELECT * FROM inventory WHERE item_name = $1 AND category = $2`,
            [itemName, category]
        );
        if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            await pool.query(`UPDATE inventory SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2`, [quantity, existing.id]);
        } else {
            await pool.query(`INSERT INTO inventory (item_name, category, quantity, unit, last_updated) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`, [itemName, category, quantity, unit]);
        }
        res.status(201).json({ id: result.rows[0].id, message: 'تم التبرع العيني وإضافته للمخزون' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/donations', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'donor') {
            const result = await pool.query(`
                SELECT amount, payment_method, transaction_id, status, created_at, 'financial' as donationType FROM donations WHERE donor_id = $1
                UNION ALL
                SELECT quantity, unit, description, status, created_at, 'inkind' as donationType FROM inkind_donations WHERE donor_id = $1
                ORDER BY created_at DESC
            `, [req.user.id]);
            res.json(result.rows);
        } else {
            const result = await pool.query(`SELECT * FROM donations ORDER BY created_at DESC`);
            res.json(result.rows);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/inkind-donations', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'donor') {
            const result = await pool.query(`SELECT * FROM inkind_donations WHERE donor_id = $1 ORDER BY created_at DESC`, [req.user.id]);
            res.json(result.rows);
        } else {
            const result = await pool.query(`SELECT * FROM inkind_donations ORDER BY created_at DESC`);
            res.json(result.rows);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات المعاملات المالية =====================
app.post('/api/expenses', authenticateToken, requireManager, async (req, res) => {
    const { amount, description, beneficiaryId } = req.body;
    try {
        const balanceResult = await pool.query(
            `SELECT SUM(CASE WHEN type='income' THEN amount ELSE 0 END) - SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as balance FROM financial_transactions`
        );
        const balance = balanceResult.rows[0]?.balance || 0;
        if (amount > balance) return res.status(400).json({ error: 'الرصيد غير كافٍ' });
        const result = await pool.query(
            `INSERT INTO financial_transactions (amount, type, description, created_by, beneficiary_id) VALUES ($1, 'expense', $2, $3, $4) RETURNING id`,
            [amount, description, req.user.id, beneficiaryId || null]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'تم تسجيل الصرف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/financial-transactions', authenticateToken, requireInventoryAccess, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ft.*, d.donor_name, b.name as beneficiaryName 
            FROM financial_transactions ft 
            LEFT JOIN donations d ON ft.donation_id = d.id 
            LEFT JOIN beneficiaries b ON ft.beneficiary_id = b.id 
            ORDER BY ft.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات المستفيدين =====================
app.get('/api/beneficiaries', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM beneficiaries ORDER BY created_at DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/beneficiaries', authenticateToken, async (req, res) => {
    const { name, idNumber, phone, address, familyMembers, healthStatus, gender, nationalId, familyMembersJSON, state, city, area, warehouse_id } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO beneficiaries (name, id_number, phone, address, family_members, health_status, gender, national_id, family_members_json, registered_by, state, city, area, warehouse_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
            [name, idNumber, phone, address, familyMembers, healthStatus, gender, nationalId, familyMembersJSON, req.user.id, state, city, area, warehouse_id]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'تم تسجيل المستفيد' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/beneficiaries/:id', authenticateToken, async (req, res) => {
    const { name, phone, address, familyMembers, healthStatus, gender, nationalId, familyMembersJSON, state, city, area, warehouse_id } = req.body;
    try {
        await pool.query(
            `UPDATE beneficiaries SET name=$1, phone=$2, address=$3, family_members=$4, health_status=$5, gender=$6, national_id=$7, family_members_json=$8, state=$9, city=$10, area=$11, warehouse_id=$12 WHERE id=$13`,
            [name, phone, address, familyMembers, healthStatus, gender, nationalId, familyMembersJSON, state, city, area, warehouse_id, req.params.id]
        );
        res.json({ message: 'تم التحديث' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/beneficiaries/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(`DELETE FROM beneficiaries WHERE id=$1`, [req.params.id]);
        res.json({ message: 'تم الحذف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات السجلات الصحية =====================
app.get('/api/health-records/:beneficiaryId', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT hr.*, u.name as createdByName FROM health_records hr LEFT JOIN users u ON hr.created_by = u.id WHERE hr.beneficiary_id = $1 ORDER BY hr.record_date DESC`,
            [req.params.beneficiaryId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/health-records', authenticateToken, async (req, res) => {
    const { beneficiaryId, recordDate, diagnosis, treatment, notes } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO health_records (beneficiary_id, record_date, diagnosis, treatment, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [beneficiaryId, recordDate, diagnosis, treatment, notes, req.user.id]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/health-records/:id', authenticateToken, async (req, res) => {
    const { recordDate, diagnosis, treatment, notes } = req.body;
    try {
        await pool.query(
            `UPDATE health_records SET record_date=$1, diagnosis=$2, treatment=$3, notes=$4 WHERE id=$5`,
            [recordDate, diagnosis, treatment, notes, req.params.id]
        );
        res.json({ message: 'تم التحديث' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/health-records/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(`DELETE FROM health_records WHERE id=$1`, [req.params.id]);
        res.json({ message: 'تم الحذف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات الشكاوى والإشعارات =====================
app.get('/api/complaints', authenticateToken, async (req, res) => {
    const role = req.user.role;
    const userId = req.user.id;
    try {
        if (['manager', 'inventory_keeper', 'employee', 'volunteer'].includes(role)) {
            const result = await pool.query(`SELECT * FROM complaints ORDER BY created_at DESC`);
            res.json(result.rows);
        } else {
            const result = await pool.query(`SELECT * FROM complaints WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
            res.json(result.rows);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/complaints', authenticateToken, async (req, res) => {
    const { message, type } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO complaints (user_id, user_role, message, type) VALUES ($1, $2, $3, $4) RETURNING id`,
            [req.user.id, req.user.role, message, type]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/complaints/read/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(`UPDATE complaints SET read = 1 WHERE id = $1`, [req.params.id]);
        res.json({ message: 'تم تحديد القراءة' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/complaints/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(`DELETE FROM complaints WHERE id = $1`, [req.params.id]);
        res.json({ message: 'تم الحذف' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسار الإحصائيات =====================
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const beneficiaries = await pool.query(`SELECT COUNT(*) as count FROM beneficiaries`);
        const donations = await pool.query(`SELECT COUNT(*) as count FROM donations`);
        const inventory = await pool.query(`SELECT COUNT(*) as count FROM inventory`);
        const income = await pool.query(`SELECT SUM(amount) as total FROM financial_transactions WHERE type='income'`);
        const expenses = await pool.query(`SELECT SUM(amount) as total FROM financial_transactions WHERE type='expense'`);
        const pending = await pool.query(`SELECT COUNT(*) as count FROM assistance_requests WHERE status='pending'`);
        const completed = await pool.query(`SELECT COUNT(*) as count FROM assistance_requests WHERE status='completed'`);
        
        const stats = {
            beneficiaries: parseInt(beneficiaries.rows[0]?.count || 0),
            donations: parseInt(donations.rows[0]?.count || 0),
            inventoryItems: parseInt(inventory.rows[0]?.count || 0),
            totalIncome: parseFloat(income.rows[0]?.total || 0),
            totalExpenses: parseFloat(expenses.rows[0]?.total || 0),
            totalFunds: parseFloat(income.rows[0]?.total || 0) - parseFloat(expenses.rows[0]?.total || 0),
            pendingRequests: parseInt(pending.rows[0]?.count || 0),
            completedRequests: parseInt(completed.rows[0]?.count || 0)
        };
        
        if (req.user.role === 'donor') {
            const donorResult = await pool.query(`SELECT SUM(amount) as total FROM donations WHERE donor_id = $1`, [req.user.id]);
            stats.totalDonationsForUser = parseFloat(donorResult.rows[0]?.total || 0);
        }
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات فرق الطوارئ =====================
app.get('/api/emergency-teams', authenticateToken, async (req, res) => {
    if (!['manager', 'employee'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    try {
        const result = await pool.query(`SELECT et.*, u.name as leaderName FROM emergency_teams et LEFT JOIN users u ON et.leader_id = u.id`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/emergency-teams', authenticateToken, async (req, res) => {
    if (!['manager', 'employee'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    const { teamName, leaderId, members } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO emergency_teams (team_name, leader_id, members) VALUES ($1, $2, $3) RETURNING id`,
            [teamName, leaderId, JSON.stringify(members)]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/emergency-teams/:id', authenticateToken, async (req, res) => {
    if (!['manager', 'employee'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    try {
        await pool.query(`UPDATE emergency_teams SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
        res.json({ message: 'تم التحديث' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== مسارات اللوجستيات =====================
app.get('/api/logistics', authenticateToken, async (req, res) => {
    if (!['manager', 'employee'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    try {
        const result = await pool.query(`SELECT l.*, u.name as assignedName FROM logistics l LEFT JOIN users u ON l.assigned_to = u.id ORDER BY l.created_at DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logistics', authenticateToken, async (req, res) => {
    if (!['manager', 'employee'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    const { requestId, fromLocation, toLocation, assignedTo } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO logistics (request_id, from_location, to_location, assigned_to, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
            [requestId, fromLocation, toLocation, assignedTo]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/logistics/:id', authenticateToken, async (req, res) => {
    if (!['manager', 'employee'].includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
    try {
        await pool.query(`UPDATE logistics SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
        res.json({ message: 'تم التحديث' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== تشغيل الخادم =====================
app.listen(PORT, () => {
    console.log(`\n🚀 ========================================`);
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📧 البريد الإلكتروني: ${process.env.EMAIL_USER || 'red1956hilal@gmail.com'}`);
    console.log(`🗄️ قاعدة البيانات: PostgreSQL`);
    console.log(`========================================\n`);
});