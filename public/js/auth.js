// ملف auth.js - إدارة المصادقة والجلسات

// دالة مساعدة لمعالجة الرد
async function handleResponse(response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
}

function updateUserDisplay() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        document.querySelectorAll('#userName').forEach(el => el.textContent = user.name);
        let roleText = '';
        if (user.role === 'manager') roleText = 'مدير النظام';
        else if (user.role === 'inventory_keeper') roleText = 'أمين مخزن';
        else if (user.role === 'employee') roleText = 'موظف';
        else if (user.role === 'volunteer') roleText = 'متطوع';
        else if (user.role === 'donor') roleText = 'مانح';
        else if (user.role === 'beneficiary') roleText = 'مستفيد';
        document.querySelectorAll('#userRole').forEach(el => el.textContent = roleText);
    }
}

function requireAuth(requiredRole) {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');
    if (!user || !token) {
        window.location.href = 'index.html';
        return null;
    }
    if (requiredRole && !requiredRole.includes(user.role)) {
        alert('ليس لديك صلاحية للوصول إلى هذه الصفحة');
        window.location.href = 'dashboard.html';
        return null;
    }
    return user;
}

function logout() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('pendingVerificationEmail');
        window.location.href = 'index.html';
    }
}

async function initFloatingBell() {
    const oldBell = document.getElementById('floatingBell');
    if (oldBell) oldBell.remove();

    const bell = document.createElement('div');
    bell.id = 'floatingBell';
    bell.className = 'floating-bell';
    bell.innerHTML = `<i class="fas fa-bell"></i><span class="badge" id="floatingBadge" style="display:none;">0</span>`;
    bell.onclick = () => window.location.href = 'notifications.html';
    document.body.appendChild(bell);

    async function updateBellBadge() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const user = JSON.parse(localStorage.getItem('user'));
            if (!user) return;
            const res = await fetch('/api/complaints', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const complaints = await res.json();
            let userComplaints;
            if (['manager','inventory_keeper','employee','volunteer'].includes(user.role)) {
                userComplaints = complaints.filter(c => c.type === 'notification' && c.userRole !== 'system');
            } else {
                userComplaints = complaints.filter(c => c.userId === user.id && c.type === 'notification');
            }
            const unread = userComplaints.filter(c => !c.read).length;
            const badge = document.getElementById('floatingBadge');
            if (badge) {
                if (unread > 0) {
                    badge.style.display = 'flex';
                    badge.innerText = unread > 99 ? '99+' : unread;
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch(e) {
            console.error('خطأ في تحديث الجرس', e);
        }
    }
    await updateBellBadge();
    setInterval(updateBellBadge, 30000);
}

// دالة تسجيل الدخول مع التحقق من البريد الإلكتروني
async function login(employeeId, password) {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password })
    });
    const data = await res.json();
    if (!res.ok) {
        if (data.requiresVerification && data.email) {
            localStorage.setItem('pendingVerificationEmail', data.email);
            window.location.href = 'verify-email.html?email=' + encodeURIComponent(data.email);
            throw new Error('يرجى تأكيد بريدك الإلكتروني أولاً. تم توجيهك إلى صفحة التحقق.');
        }
        throw new Error(data.error || 'حدث خطأ');
    }
    return data;
}

// دالة تسجيل مستخدم جديد
async function register(userData) {
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    });
    return handleResponse(res);
}

// دالة تغيير كلمة المرور
async function changePassword(oldPassword, newPassword) {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
    });
    return handleResponse(res);
}

// تصدير الدوال للنطاق العام
window.updateUserDisplay = updateUserDisplay;
window.requireAuth = requireAuth;
window.logout = logout;
window.initFloatingBell = initFloatingBell;
window.login = login;
window.register = register;
window.changePassword = changePassword;
window.handleResponse = handleResponse;