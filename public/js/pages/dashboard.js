// public/js/pages/dashboard.js
const user = requireAuth();
updateUserDisplay();
initFloatingBell();

function buildSidebar() {
    const nav = document.getElementById('mainNav');
    const role = user.role;
    let html = '';

    // القسم الرئيسي - دائماً موجود
    html += `<div class="nav-section"><h4 class="nav-title">القائمة الرئيسية</h4><ul>`;
    html += `<li><a href="#" class="nav-link active" onclick="loadSection('dashboard')"><i class="fas fa-home"></i> <span>الرئيسية</span></a></li>`;
    
    // إضافة إدارة المستخدمين للمدير ضمن القائمة الرئيسية
    if (role === 'manager') {
        html += `<li><a href="users-management.html" class="nav-link"><i class="fas fa-users-cog"></i> <span>إدارة المستخدمين</span></a></li>`;
    }
    html += `</ul></div>`;

    // بقية الأقسام حسب الدور
    if (role === 'manager') {
        html += `<div class="nav-section"><h4 class="nav-title">إدارة النظام</h4><ul>`;
        html += `<li><a href="approvals.html" class="nav-link"><i class="fas fa-check-circle"></i> <span>الموافقات المعلقة</span></a></li>`;
        html += `<li><a href="manager-requests.html" class="nav-link"><i class="fas fa-money-bill-wave"></i> <span>طلبات مالية معلقة</span></a></li>`;
        html += `<li><a href="employee-requests.html" class="nav-link"><i class="fas fa-tasks"></i> <span>طلبات عينية معلقة</span></a></li>`;
        html += `<li><a href="dispense.html" class="nav-link"><i class="fas fa-box-open"></i> <span>صرف المساعدات</span></a></li>`;
        html += `<li><a href="inventory.html" class="nav-link"><i class="fas fa-boxes"></i> <span>المخزون</span></a></li>`;
        html += `<li><a href="reports.html" class="nav-link"><i class="fas fa-chart-bar"></i> <span>التقارير</span></a></li>`;
        html += `<li><a href="emergency.html" class="nav-link"><i class="fas fa-ambulance"></i> <span>فرق الطوارئ</span></a></li>`;
        html += `<li><a href="logistics.html" class="nav-link"><i class="fas fa-truck"></i> <span>النقل واللوجستيات</span></a></li>`;
        html += `</ul></div>`;
    } else if (role === 'inventory_keeper') {
        html += `<div class="nav-section"><h4 class="nav-title">إدارة المخزون</h4><ul>`;
        html += `<li><a href="inventory.html" class="nav-link"><i class="fas fa-boxes"></i> <span>المخزون</span></a></li>`;
        html += `<li><a href="dispense.html" class="nav-link"><i class="fas fa-box-open"></i> <span>صرف المساعدات</span></a></li>`;
        html += `<li><a href="reports.html" class="nav-link"><i class="fas fa-chart-bar"></i> <span>التقارير</span></a></li>`;
        html += `</ul></div>`;
    } else if (role === 'employee' || role === 'volunteer') {
        html += `<div class="nav-section"><h4 class="nav-title">العمليات</h4><ul>`;
        html += `<li><a href="employee-requests.html" class="nav-link"><i class="fas fa-tasks"></i> <span>طلبات المساعدة المعلقة</span></a></li>`;
        html += `<li><a href="beneficiaries.html" class="nav-link"><i class="fas fa-user-injured"></i> <span>المستفيدين</span></a></li>`;
        html += `<li><a href="requests.html" class="nav-link"><i class="fas fa-clipboard-list"></i> <span>جميع الطلبات</span></a></li>`;
        html += `<li><a href="health.html" class="nav-link"><i class="fas fa-heartbeat"></i> <span>الحالات الصحية</span></a></li>`;
        html += `<li><a href="emergency.html" class="nav-link"><i class="fas fa-ambulance"></i> <span>فرق الطوارئ</span></a></li>`;
        html += `<li><a href="logistics.html" class="nav-link"><i class="fas fa-truck"></i> <span>النقل واللوجستيات</span></a></li>`;
        html += `</ul></div>`;
    } else if (role === 'donor') {
        html += `<div class="nav-section"><h4 class="nav-title">التبرعات</h4><ul>`;
        html += `<li><a href="finance.html" class="nav-link"><i class="fas fa-hand-holding-heart"></i> <span>تقديم تبرع</span></a></li>`;
        html += `<li><a href="#" class="nav-link" onclick="loadSection('myDonations')"><i class="fas fa-history"></i> <span>تبرعاتي</span></a></li>`;
        html += `</ul></div>`;
    } else if (role === 'beneficiary') {
        html += `<div class="nav-section"><h4 class="nav-title">الخدمات</h4><ul>`;
        html += `<li><a href="requests.html" class="nav-link"><i class="fas fa-hands-helping"></i> <span>طلب مساعدة</span></a></li>`;
        html += `<li><a href="#" class="nav-link" onclick="loadSection('myRequests')"><i class="fas fa-list"></i> <span>طلباتي</span></a></li>`;
        html += `</ul></div>`;
    }

    // قسم تغيير كلمة المرور
    html += `<div class="nav-section"><ul><li><a href="#" class="nav-link" onclick="showChangePasswordModal()"><i class="fas fa-key"></i> <span>تغيير كلمة المرور</span></a></li></ul></div>`;
    nav.innerHTML = html;
}

async function loadSection(section) {
    const content = document.getElementById('mainContent');
    if (section === 'dashboard') {
        try {
            const stats = await getStats();
            let statsHtml = '';
            if (user.role === 'manager' || user.role === 'inventory_keeper') {
                statsHtml = `<div class="quick-stats">
                    <div class="stat-card" onclick="window.location.href='beneficiaries-report.html'"><i class="fas fa-users"></i><div class="count">${stats.beneficiaries || 0}</div><div class="label">المستفيدين</div></div>
                    <div class="stat-card" onclick="window.location.href='donations-report.html'"><i class="fas fa-donate"></i><div class="count">${stats.donations || 0}</div><div class="label">التبرعات</div></div>
                    <div class="stat-card" onclick="window.location.href='inventory-report.html'"><i class="fas fa-boxes"></i><div class="count">${stats.inventoryItems || 0}</div><div class="label">أصناف المخزون</div></div>
                    <div class="stat-card" onclick="window.location.href='financial-report.html'"><i class="fas fa-money-bill"></i><div class="count">${stats.totalFunds || 0}</div><div class="label">إجمالي الأموال</div></div>
                    <div class="stat-card" onclick="window.location.href='requests-report.html'"><i class="fas fa-clock"></i><div class="count">${stats.pendingRequests || 0}</div><div class="label">طلبات معلقة</div></div>
                </div>`;
            } else if (user.role === 'donor') {
                statsHtml = `<div class="quick-stats"><div class="stat-card" onclick="loadSection('myDonations')"><i class="fas fa-hand-holding-heart"></i><div class="count">${stats.donations || 0}</div><div class="label">عدد تبرعاتي</div></div></div>`;
            } else if (user.role === 'beneficiary') {
                const beneficiaries = await getBeneficiaries();
                const myBen = beneficiaries.find(b => b.userId === user.id);
                if (myBen) {
                    const allReqs = await getAssistanceRequests();
                    const myReqs = allReqs.filter(r => r.beneficiaryId === myBen.id);
                    const pendingCount = myReqs.filter(r => r.status === 'pending').length;
                    statsHtml = `<div class="quick-stats"><div class="stat-card"><i class="fas fa-clock"></i><div class="count">${pendingCount}</div><div class="label">طلباتي المعلقة</div></div></div>`;
                } else statsHtml = '<p>لا توجد بيانات</p>';
            } else {
                statsHtml = `<div class="quick-stats"><div class="stat-card"><i class="fas fa-tasks"></i><div class="count">${stats.pendingRequests || 0}</div><div class="label">طلبات معلقة</div></div></div>`;
            }
            content.innerHTML = `<div class="dashboard-welcome"><h2>مرحباً ${user.name}</h2></div>${statsHtml}`;
        } catch(e) { content.innerHTML = '<p class="error">حدث خطأ في تحميل البيانات</p>'; }
    } else if (section === 'myDonations' && user.role === 'donor') {
        try {
            const donations = await getDonations();
            let rows = '';
            donations.forEach(d => {
                if (d.donationType === 'financial') {
                    rows += `<tr><td data-label="المبلغ">${d.amount || 0} جنيه</td><td data-label="طريقة الدفع">${d.paymentMethod || '-'}</td><td data-label="التاريخ">${new Date(d.createdAt).toLocaleDateString('ar-EG')}</td></tr>`;
                } else {
                    rows += `<tr><td data-label="الكمية">${d.amount || 0} ${d.paymentMethod || ''}</td><td data-label="الصنف">${d.transactionId || ''}</td><td data-label="التاريخ">${new Date(d.createdAt).toLocaleDateString('ar-EG')}</td></tr>`;
                }
            });
            content.innerHTML = `<h2>تبرعاتي السابقة</h2><table class="data-table"><thead><tr><th>المبلغ/الكمية</th><th>التفاصيل</th><th>التاريخ</th></tr></thead><tbody>${rows || '<tr><td colspan="3">لا توجد تبرعات</td></tr>'}</tbody></table>`;
        } catch(e) { content.innerHTML = '<p class="error">حدث خطأ</p>'; }
    } else if (section === 'myRequests' && user.role === 'beneficiary') {
        try {
            const beneficiaries = await getBeneficiaries();
            const myBen = beneficiaries.find(b => b.userId === user.id);
            if (myBen) {
                const allReqs = await getAssistanceRequests();
                const myReqs = allReqs.filter(r => r.beneficiaryId === myBen.id);
                let rows = myReqs.map(r => `<tr><td data-label="النوع">${r.requestType}</td><td data-label="الوصف">${r.description.substring(0,50)}...</td><td data-label="الحالة"><span class="status ${r.status}">${r.status === 'pending' ? 'معلق' : r.status === 'approved' ? 'معتمد' : r.status === 'completed' ? 'مكتمل' : 'مرفوض'}</span></td><td data-label="التاريخ">${new Date(r.createdAt).toLocaleDateString('ar-EG')}</td></tr>`).join('');
                content.innerHTML = `<h2>طلباتي</h2><table class="data-table"><thead><tr><th>النوع</th><th>الوصف</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${rows || '<tr><td colspan="4">لا توجد طلبات</td></tr>'}</tbody></table>`;
            } else content.innerHTML = '<p>لا توجد بيانات للمستفيد</p>';
        } catch(e) { content.innerHTML = '<p class="error">حدث خطأ</p>'; }
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.querySelector('.main-content').classList.toggle('expanded');
}

function toggleMobileMenu() {
    document.getElementById('sidebar').classList.toggle('open');
    const overlay = document.getElementById('sidebarOverlay') || createOverlay();
    overlay.classList.toggle('active');
}

function createOverlay() {
    const o = document.createElement('div');
    o.id = 'sidebarOverlay';
    o.className = 'sidebar-overlay';
    o.onclick = () => {
        document.getElementById('sidebar').classList.remove('open');
        o.classList.remove('active');
    };
    document.body.appendChild(o);
    return o;
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('sidebarOverlay')) createOverlay();
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    }
});

buildSidebar();
loadSection('dashboard');