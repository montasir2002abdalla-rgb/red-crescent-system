const user = requireAuth();
updateUserDisplay();
initFloatingBell();

const isSender = (user.role === 'donor' || user.role === 'beneficiary');
const isReceiver = (user.role === 'manager' || user.role === 'inventory_keeper' || user.role === 'employee' || user.role === 'volunteer');

if (!isSender && !isReceiver) {
    alert('غير مسموح بالوصول');
    window.location.href = 'dashboard.html';
}

function initTabs() {
    const tabsContainer = document.querySelector('.tabs');
    let tabsHtml = '';
    if (isReceiver) {
        tabsHtml += `<button class="tab active" onclick="showTab('notifications')">التنبيهات الواردة</button>`;
        tabsHtml += `<button class="tab" onclick="showTab('complaints')">الشكاوى الواردة</button>`;
    }
    if (isSender) {
        tabsHtml += `<button class="tab active" onclick="showTab('alerts')">الإشعارات</button>`;
        tabsHtml += `<button class="tab" onclick="showTab('new')">إرسال جديد</button>`;
        tabsHtml += `<button class="tab" onclick="showTab('myMessages')">رسائلي</button>`;
    }
    tabsContainer.innerHTML = tabsHtml;
    if (isReceiver) showTab('notifications');
    else if (isSender) showTab('alerts');
}

function showTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (tab === 'notifications') {
        document.querySelector('[onclick="showTab(\'notifications\')"]').classList.add('active');
        document.getElementById('notificationsTab').classList.add('active');
        loadNotifications();
    } else if (tab === 'complaints') {
        document.querySelector('[onclick="showTab(\'complaints\')"]').classList.add('active');
        document.getElementById('complaintsTab').classList.add('active');
        loadComplaints();
    } else if (tab === 'new') {
        document.querySelector('[onclick="showTab(\'new\')"]').classList.add('active');
        document.getElementById('newTab').classList.add('active');
    } else if (tab === 'myMessages') {
        document.querySelector('[onclick="showTab(\'myMessages\')"]').classList.add('active');
        document.getElementById('myMessagesTab').classList.add('active');
        loadMyMessages();
    } else if (tab === 'alerts') {
        document.querySelector('[onclick="showTab(\'alerts\')"]').classList.add('active');
        document.getElementById('alertsTab').classList.add('active');
        loadAlerts();
    }
}

async function loadNotifications() {
    try {
        const all = await getComplaints();
        const notifications = all.filter(c => c.type === 'notification' && c.userRole !== 'system');
        const container = document.getElementById('notificationsList');
        container.innerHTML = notifications.map(n => {
            let printLink = '';
            let messageText = n.message;
            const urlMatch = n.message.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                printLink = `<a href="${urlMatch[0]}" target="_blank" class="btn-print-notif"><i class="fas fa-print"></i> طباعة الإشعار</a>`;
                messageText = n.message.replace(urlMatch[0], '');
            }
            return `<div class="notif-card ${n.read ? 'read' : 'unread'}">
                <div class="notif-icon"><i class="fas fa-bell"></i></div>
                <div class="notif-content">
                    <div class="notif-message">${messageText}</div>
                    <div class="notif-meta">
                        <span><i class="far fa-clock"></i> ${new Date(n.createdAt).toLocaleString('ar-EG')}</span>
                        ${!n.read ? `<button class="btn-mark-read" onclick="markAsRead(${n.id})">تحديد كمقروء</button>` : ''}
                        ${printLink}
                    </div>
                </div>
            </div>`;
        }).join('') || '<div class="empty-state">لا توجد إشعارات جديدة</div>';
    } catch(e) { alert(e.message); }
}

async function loadComplaints() {
    try {
        const all = await getComplaints();
        const complaints = all.filter(c => c.type === 'complaint');
        const container = document.getElementById('complaintsList');
        container.innerHTML = complaints.map(c => `
            <div class="complaint-item ${c.read ? 'read' : 'unread'}">
                <p><strong>من: ${c.userRole === 'donor' ? 'مانح' : c.userRole === 'beneficiary' ? 'مستفيد' : 'غير معروف'}</strong></p>
                <p>${c.message}</p>
                <small>${new Date(c.createdAt).toLocaleString('ar-EG')}</small>
                <div class="complaint-actions">
                    ${!c.read ? `<button class="btn btn-sm btn-success" onclick="markAsRead(${c.id})">قراءة</button>` : ''}
                    ${user.role === 'manager' ? `<button class="btn btn-sm btn-danger" onclick="deleteMessage(${c.id})">حذف</button>` : ''}
                </div>
            </div>
        `).join('') || '<p>لا توجد شكاوى</p>';
    } catch(e) { alert(e.message); }
}

async function loadAlerts() {
    try {
        const all = await getComplaints();
        const alerts = all.filter(c => c.type === 'notification' && c.userId === user.id);
        const container = document.getElementById('alertsList');
        container.innerHTML = alerts.map(n => {
            let printLink = '';
            let messageText = n.message;
            const urlMatch = n.message.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                printLink = `<a href="${urlMatch[0]}" target="_blank" class="btn-print-notif"><i class="fas fa-print"></i> طباعة الإشعار</a>`;
                messageText = n.message.replace(urlMatch[0], '');
            }
            return `<div class="notif-card ${n.read ? 'read' : 'unread'}">
                <div class="notif-icon"><i class="fas fa-bell"></i></div>
                <div class="notif-content">
                    <div class="notif-message">${messageText}</div>
                    <div class="notif-meta">
                        <span><i class="far fa-clock"></i> ${new Date(n.createdAt).toLocaleString('ar-EG')}</span>
                        ${!n.read ? `<button class="btn-mark-read" onclick="markAsRead(${n.id})">تحديد كمقروء</button>` : ''}
                        ${printLink}
                    </div>
                </div>
            </div>`;
        }).join('') || '<div class="empty-state">لا توجد إشعارات</div>';
    } catch(e) { alert(e.message); }
}

async function loadMyMessages() {
    try {
        const all = await getComplaints();
        const myMessages = all.filter(c => c.userId === user.id);
        const container = document.getElementById('myMessagesList');
        container.innerHTML = myMessages.map(m => `
            <div class="complaint-item ${m.read ? 'read' : 'unread'}">
                <p><span class="badge ${m.type}">${m.type === 'notification' ? 'تنبيه' : 'شكوى'}</span></p>
                <p>${m.message}</p>
                <small>${new Date(m.createdAt).toLocaleString('ar-EG')}</small>
                <div class="complaint-actions">
                    ${!m.read ? `<button class="btn btn-sm btn-success" onclick="markAsRead(${m.id})">قراءة</button>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deleteMessage(${m.id})">حذف</button>
                </div>
            </div>
        `).join('') || '<p>لم ترسل أي رسائل بعد</p>';
    } catch(e) { alert(e.message); }
}

window.markAsRead = async (id) => {
    try {
        await markComplaintAsRead(id);
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) showTab(activeTab.innerText === 'التنبيهات الواردة' ? 'notifications' :
            activeTab.innerText === 'الشكاوى الواردة' ? 'complaints' :
            activeTab.innerText === 'رسائلي' ? 'myMessages' : 'alerts');
    } catch(e) { alert(e.message); }
};

window.deleteMessage = async (id) => {
    if (confirm('هل أنت متأكد من حذف هذه الرسالة؟')) {
        try {
            await deleteComplaint(id);
            const activeTab = document.querySelector('.tab.active');
            if (activeTab) showTab(activeTab.innerText === 'التنبيهات الواردة' ? 'notifications' :
                activeTab.innerText === 'الشكاوى الواردة' ? 'complaints' :
                activeTab.innerText === 'رسائلي' ? 'myMessages' : 'alerts');
        } catch(e) { alert(e.message); }
    }
};

document.getElementById('complaintForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        type: document.getElementById('complaintType').value,
        message: document.getElementById('complaintMessage').value
    };
    try {
        await createComplaint(data);
        alert('تم الإرسال بنجاح');
        document.getElementById('complaintForm').reset();
        if (isSender) showTab('myMessages');
        else showTab('notifications');
    } catch(e) { alert(e.message); }
});

initTabs();